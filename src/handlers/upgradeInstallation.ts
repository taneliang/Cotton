import { join } from 'path';
import { APIGatewayEvent, Callback, Context, Handler } from 'aws-lambda';
import * as Octokit from '@octokit/rest';
import * as _ from 'lodash';
import { upgradeProject, PackageDiff } from '../upgrade';
import { fetchLastPRData, fetchFiles, commitFiles, createOrUpdatePR } from '../github';
import { findProjectRootDirs, getFilePaths, mkdirpAsync, PathPair } from '../util/files';

// Upgrade a repository. octokit should be authenticated with token to access repo.
async function upgradeRepository(repoDetails: any, octokit: Octokit) {
  console.log('Upgrading repository', repoDetails.full_name);
  const owner = repoDetails.owner.login;
  const repo = repoDetails.name;

  // Abort if foreign commits present in PR
  const prData = await fetchLastPRData(owner, repo, octokit);
  if (prData && prData.foreignCommitsPresent) {
    console.log(
      `Foreign commits present in upgrade branch for ${repoDetails.full_name}. Aborting upgrade.`,
    );
    return null;
  }

  // Get paths to all package.json and yarn.lock files
  const query = (filename: string) => `filename:${filename} repo:${repoDetails.full_name}`;
  const [packageJsons, yarnLocks] = await Promise.all([
    octokit.search.code({ q: query('package.json') }),
    octokit.search.code({ q: query('yarn.lock') }),
  ]);

  // Filter out all package.jsons without a corresponding yarn.lock and vice versa
  const upgradeRoot = join('/tmp', repoDetails.id.toString());
  const projDirPaths = findProjectRootDirs(
    packageJsons.data.items.map((i: any) => i.path),
    yarnLocks.data.items.map((i: any) => i.path),
  ).map((repoPath: string) => ({
    repoPath, // Path in repo (provided by GitHub)
    localPath: join(upgradeRoot, repoPath), // Local download path
  }));

  // Abort if nothing can be upgraded
  if (projDirPaths.length === 0) {
    console.log('No package.json + yarn.lock pairs in', repoDetails.full_name);
    return null;
  }

  // Download all package.jsons and yarn.lock pairs and store them in project directories
  await Promise.map(projDirPaths, (dir: PathPair) => mkdirpAsync(dir.localPath, {}));
  const filePaths = getFilePaths(projDirPaths, ['package.json', 'yarn.lock']);
  await fetchFiles(owner, repo, filePaths, octokit);

  // Upgrade projects
  const upgradeDiffs = await Promise.map(projDirPaths, (projDir: PathPair) =>
    upgradeProject(projDir.localPath),
  );
  // Zip project dirs and upgrade diffs, then
  // remove projects in this repo that weren't upgraded
  const upgradeSummary = _.pickBy(
    _.zipObject(projDirPaths.map((path: PathPair) => path.repoPath), upgradeDiffs),
  ) as { [index: string]: PackageDiff };

  // Abort if nothing was upgraded
  if (Object.keys(upgradeSummary).length === 0) {
    console.log('Nothing to upgrade for', repoDetails.full_name);
    // TODO: Close open PR if present
    return null;
  }

  // Commit files
  const commitSha = await commitFiles(owner, repo, filePaths, octokit);

  // Create or edit PR
  const prResult = await createOrUpdatePR(owner, repo, upgradeSummary, prData, octokit);

  const result = { commitSha, upgradeSummary, projDirPaths };
  return result;
}

// Upgrade an installation
export async function upgradeInstallation(installationId: string, token: string) {
  console.log('Upgrading installation', installationId);

  // Initialize octokit and authenticate for this installation
  const octokit = new Octokit();
  octokit.authenticate({ type: 'token', token });

  // Find and upgrade all repos in this installation
  // TODO: Split repo upgrades into individual lambdas
  const repos = await octokit.apps.getInstallationRepositories({});
  const result = await Promise.map(repos.data.repositories, (repoDetails: any) =>
    upgradeRepository(repoDetails, octokit),
  );
  return result;
}
