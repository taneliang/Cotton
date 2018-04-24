import { join } from 'path';
import { APIGatewayEvent, SNSEvent, Callback, Context, Handler } from 'aws-lambda';
import * as Octokit from '@octokit/rest';
import * as _ from 'lodash';
import * as uuid from 'uuid/v4';
import { upgradeProject, RepoDiff, PackageDiff } from '../upgrade';
import { fetchTokenForInstallation, fetchLastPRData, fetchFiles } from '../github/queries';
import { commitFiles, createOrUpdatePR } from '../github/mutations';
import { generateGitHubToken } from '../github/auth';
import { findProjectRootDirs, getFilePaths, mkdirpAsync, PathPair } from '../util/files';
import { isSnsEvent, isApiGatewayEvent } from '../util/lambdaEvent';

export type RepoDetails = {
  owner: string;
  repo: string;
};

// Upgrade a repository.
async function upgrade(installationId: string, repoDetails: RepoDetails) {
  const { owner, repo } = repoDetails;
  const repoFullName = `${owner}/${repo}`;
  console.log('Upgrading repository', repoFullName);

  // Initialize octokit and authenticate for this installation
  const octokit = new Octokit();
  octokit.authenticate({ type: 'integration', token: generateGitHubToken() });
  const token = await fetchTokenForInstallation(installationId, octokit);
  octokit.authenticate({ type: 'token', token });

  // Abort if foreign commits present in PR
  const prData = await fetchLastPRData(owner, repo, octokit);
  if (prData && prData.foreignCommitsPresent) {
    console.log(`Foreign commits present in upgrade branch for ${repoFullName}. Aborting upgrade.`);
    return null;
  }

  // Build ignored package list from prev summary
  const prevUpgradeSummary: RepoDiff | undefined = prData && prData.metadata.upgradeSummary;
  const packagesToIgnore: { [repoRoot: string]: string[] } = _.mapValues(
    prevUpgradeSummary,
    (packageDiff: PackageDiff) => packageDiff.ignored || [],
  );
  console.log(prevUpgradeSummary);
  console.log(
    `Ignoring packages while upgrading ${repoFullName}: ${JSON.stringify(packagesToIgnore)}`,
  );

  // Get paths to all package.json and yarn.lock files
  const query = (filename: string) => `filename:${filename} repo:${repoFullName}`;
  const [packageJsons, yarnLocks] = await Promise.all([
    octokit.search.code({ q: query('package.json') }),
    octokit.search.code({ q: query('yarn.lock') }),
  ]);

  // Filter out all package.jsons without a corresponding yarn.lock and vice versa
  const upgradeRoot = join('/tmp', uuid());
  const projDirPaths = findProjectRootDirs(
    packageJsons.data.items.map((i: any) => i.path),
    yarnLocks.data.items.map((i: any) => i.path),
  ).map((repoPath: string) => ({
    repoPath, // Path in repo (provided by GitHub)
    localPath: join(upgradeRoot, repoPath), // Local download path
  }));

  // Abort if nothing can be upgraded
  if (projDirPaths.length === 0) {
    console.log('No package.json + yarn.lock pairs in', repoFullName);
    return null;
  }

  // Download all package.jsons and yarn.lock pairs and store them in project directories
  await Promise.map(projDirPaths, (dir: PathPair) => mkdirpAsync(dir.localPath, {}));
  const filePaths = getFilePaths(projDirPaths, ['package.json', 'yarn.lock']);
  await fetchFiles(owner, repo, filePaths, octokit);

  // Upgrade projects
  const upgradeDiffs = await Promise.map(projDirPaths, (projDir: PathPair) =>
    upgradeProject(projDir.localPath, packagesToIgnore[projDir.repoPath]),
  );
  // Zip project dirs and upgrade diffs, then
  // remove projects in this repo that weren't upgraded
  const upgradeSummary = _.pickBy(
    _.zipObject(projDirPaths.map((path: PathPair) => path.repoPath), upgradeDiffs),
    _.negate(_.isEmpty), // Prune empty diffs - projs with nothing to upgrade, and nothing ignored
  ) as RepoDiff;

  // 3 states:
  // 1. >= 1 projects have updates.
  //    upgradeSummary.length > 0. Commit files and crupdate PR.
  // 2. No projects have pending updates, and all projects have no ignored updates.
  //    upgradeSummary.length = 0. Close open PR if present and return.
  // 3. No projects have pending updates, and >=1 projects have ignored updates.
  //    upgradeSummary.length > 0. Close open PR if present and return.

  // All done if nothing was upgraded. (i.e. everything up-to-date, or all
  // upgrades have been discarded)
  const numProjectsWithUpgrades = Object.values(upgradeSummary).filter(
    (packageDiff: PackageDiff) => _.difference(Object.keys(packageDiff), ['ignored']).length > 0,
  ).length;

  if (numProjectsWithUpgrades === 0) {
    console.log('Nothing to upgrade for', repoFullName);
    // TODO: Close open PR if present
    return null;
  }

  // TODO: Would be nice to abort commit if description has been updated again

  // Commit files
  const commitSha = await commitFiles(owner, repo, filePaths, octokit);

  // Create or edit PR
  const prResult = await createOrUpdatePR(owner, repo, upgradeSummary, prData, octokit);

  return { commitSha, upgradeSummary, projDirPaths, pr: prResult.data.number };
}

export const upgradeRepository: Handler = async (
  event: any,
  context: Context,
  callback: Callback,
) => {
  // Extract payload data
  let installationId: string | undefined;
  let repoDetails: RepoDetails | undefined;
  if (isSnsEvent(event)) {
    const jsonMessage = (event as SNSEvent).Records[0].Sns.Message;
    try {
      const payload = JSON.parse(jsonMessage);
      installationId = payload.installationId;
      repoDetails = {
        owner: payload.repoDetails.owner,
        repo: payload.repoDetails.repo,
      };
    } catch (e) {
      // Leave fields as undefined
    }
  } else if (isApiGatewayEvent(event)) {
    const pathParams = (event as APIGatewayEvent).pathParameters;
    if (pathParams) {
      installationId = pathParams.instId;
      repoDetails = {
        owner: pathParams.owner,
        repo: pathParams.repo,
      };
    }
  }

  // Abort if no installation ID or repo details found
  if (!installationId) {
    console.log('No installation ID found.', event);
    return;
  }
  if (!repoDetails) {
    console.log('No repo details found.', event);
    return;
  }

  try {
    // Run upgrade routine
    const response = await upgrade(installationId, repoDetails);
    return callback(null, response);
  } catch (e) {
    return callback(e);
  }
};
