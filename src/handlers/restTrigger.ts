import { dirname, join } from 'path';
import { readFile, writeFile } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { APIGatewayEvent, Callback, Context, Handler } from 'aws-lambda';
import { diff } from 'deep-diff';
import * as Octokit from '@octokit/rest';
import * as _ from 'lodash';
import 'lodash.product';
import * as mkdirp from 'mkdirp';
import * as ncu from 'npm-check-updates';

import generateGitHubToken from '../auth/generateToken';

import * as bluebird from 'bluebird';
global.Promise = bluebird;

// Add node_modules/yarn/bin to PATH so that we can execute yarn.
// Not adding node_modules/.bin as the yarn script tries to load ../lib/cli,
// which cannot be found in node_modules/.bin.
process.env['PATH'] =
  process.env['PATH'] + ':' + process.env['LAMBDA_TASK_ROOT'] + '/node_modules/yarn/bin/';

type PathPair = {
  repoPath: string;
  localPath: string;
};

type Dependencies = { readonly [index: string]: string };

type PackageJson = {
  name: string;
  version: string;
  dependencies?: Dependencies;
  devDependencies?: Dependencies;
  peerDependencies?: Dependencies;
  optionalDependencies?: Dependencies;
};

type DependencyDiff = { [index: string]: { original: string; upgraded: string } };

const cottonBranch = 'cotton/upgrade';

// Using 2 different versions of promisify to get around compile
// error: TS2554: Expected X arguments, but got Y.
const mkdirpAsync = Promise.promisify(mkdirp);
const readFileAsync = promisify(readFile);
const writeFileAsync = promisify(writeFile);
const execAsync = promisify(exec);

async function fetchInstallationIds(octokit: Octokit) {
  const installations = await octokit.apps.getInstallations({});
  return installations.data.map((inst: any) => inst.id);
}

function fetchTokensForInstallations(installationIds: string[], octokit: Octokit) {
  return Promise.map(installationIds, async (installationId: string) => {
    const tokenResult = await octokit.apps.createInstallationToken({
      installation_id: installationId,
    });
    return tokenResult.data.token;
  });
}

async function fetchBranchData(owner: string, repo: string, branch: string, octokit: Octokit) {
  const ref = await octokit.gitdata
    .getReference({ owner, repo, ref: `heads/${branch}` })
    // cotton's branch may not exist. Catch error and return undefined
    .catch((e) => {
      if (e.code !== 404) throw e;
      return null;
    });
  if (!ref) return null;

  const refSha = ref.data.object.sha;

  const commit = await octokit.repos.getCommit({ owner, repo, sha: refSha });
  const commitSha = commit.data.sha;
  const treeSha = commit.data.commit.tree.sha;
  return { refSha, commitSha, treeSha };
}

async function fetchLastPRData(owner: string, repo: string, octokit: Octokit) {
  // Find our PR, if present
  const allPrs = await octokit.pullRequests.getAll({ owner, repo, head: cottonBranch });

  // Return null if there are no PRs for cotton branch
  if (allPrs.data.length === 0) return null;

  // Log warning if more than 1 PR was found
  if (allPrs.data.length > 1) {
    console.log(owner + '/' + repo, 'has', allPrs.data.length, 'PRs on cotton branch!');
    // TODO: Close PRs or handle them somehow
  }

  const { number, body } = allPrs.data[0];
  // TODO: Extract PR body metadata

  // Check if foreign commits are present
  const commits = await octokit.pullRequests.getCommits({ owner, repo, number });
  const authors = commits.data
    .map((c: any) => c.author.login)
    .filter((author: string) => author !== 'cotton[bot]'); // TODO: Replace magic const
  const foreignCommitsPresent = authors.length > 0;

  return { number, body, foreignCommitsPresent };
}

// Return directories where both package.json and yarn.lock are present
export function findProjectRootDirs(packageJsonPaths: string[], yarnLockPaths: string[]): string[] {
  // Get dir paths without filenames
  const packageJsonDirs = packageJsonPaths.map(dirname);
  const yarnLockDirs = yarnLockPaths.map(dirname);

  // Filter out package.json dirs that don't have a corresponding yarn.lock dir
  return _.intersection(packageJsonDirs, yarnLockDirs);
}

// Compute paths to all files in all project directories
export function getFilePaths(projectDirs: PathPair[], filenames: string[]): PathPair[] {
  return (_ as any)
    .product(projectDirs, filenames) // Get cartesian product of dirs and file names
    .map(([dirPath, file]: [PathPair, string]) => ({
      // Join filenames to dirs
      repoPath: join(dirPath.repoPath, file),
      localPath: join(dirPath.localPath, file),
    }));
}

// Fetch all files in owner/repo and save to disk
function fetchFiles(owner: string, repo: string, filePaths: PathPair[], octokit: Octokit) {
  return Promise.map(filePaths, (filePath: PathPair) =>
    octokit.repos
      .getContent({ owner, repo, path: filePath.repoPath })
      .then((content: any) =>
        writeFileAsync(filePath.localPath, content.data.content, content.data.encoding),
      ),
  );
}

// Diff dependencies in 2 packages
export function diffDependencies(
  oldPackage: PackageJson,
  newPackage: PackageJson,
): { [index: string]: DependencyDiff } {
  const dependencyKeys = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ];

  // Generate diffs for each dependencyKey
  const diffsForDepTypes: DependencyDiff[] = _.map(dependencyKeys, (key: string) => {
    const diffArray = diff(oldPackage[key] || {}, newPackage[key] || {}) || [];
    const transformedDiff = diffArray.map((diff) => ({
      // Assume diff is an edit, and that path only has 1 element (dep name).
      [diff.path[0]]: {
        original: diff.lhs,
        upgraded: diff.rhs,
      },
    }));
    // Merge array of per-package diffs
    return _.assign({}, ...transformedDiff);
  });

  const allDiffs = _.zipObject(dependencyKeys, diffsForDepTypes);
  // Remove keys with undefined values
  return _.pickBy(allDiffs, _.negate(_.isEmpty)) as { [index: string]: DependencyDiff };
}

// Upgrade project at rootDir (which must contain a package.json and yarn.lock).
// If packages were updated, returns an upgrade diff object, else returns null.
async function upgradeProject(rootDir: string) {
  const packageJsonPath = join(rootDir, 'package.json');
  const readPackageJson = async () => {
    const packageJson = await readFileAsync(packageJsonPath, 'utf-8');
    return JSON.parse(packageJson) as PackageJson;
  };

  // Read package.json
  const oldPackage = await readPackageJson();

  // TODO: Manually undo previous package upgrade

  // Upgrade packages
  // TODO: Ensure that custom packages are ignored
  // TODO: Set rejected (ignored) packages
  const upgradedPackage = await ncu.run({
    packageFile: packageJsonPath,
    silent: true,
    jsonAll: true,
    upgradeAll: true,
  });

  // Calculate diff
  const upgradeDiff = diffDependencies(oldPackage, upgradedPackage);

  // Abort if nothing was upgraded
  if (_.isEmpty(upgradeDiff)) return null;

  // Save new package.json
  // TODO: Preserve formatting (only replace necessary bits? Prettier?)
  await writeFileAsync(packageJsonPath, JSON.stringify(upgradedPackage, null, 2) + '\n', 'utf-8');

  // Run yarn to update yarn.lock
  await execAsync('yarn install --ignore-scripts', { cwd: rootDir });

  // Return diff
  return upgradeDiff;
}

async function commitFiles(owner: string, repo: string, filePaths: PathPair[], octokit: Octokit) {
  // Fetch master branch data for committing
  const masterBranchData = await fetchBranchData(owner, repo, 'master', octokit);

  if (!masterBranchData) {
    console.log(owner + '/' + repo, 'does not have a master branch!');
    throw 'No master branch found in ' + owner + '/' + repo;
  }

  // Upload all files as blobs
  // TODO: Don't commit unchanged files (optional optimization)
  const createdBlobs = await Promise.map(filePaths, (path: PathPair) =>
    readFileAsync(path.localPath, 'base64').then((content: string) =>
      octokit.gitdata.createBlob({
        owner,
        repo,
        content,
        encoding: 'base64',
      }),
    ),
  );

  // Create tree from blobs
  const tree = filePaths.map((path: PathPair, idx: number) => ({
    path: path.repoPath,
    sha: createdBlobs[idx].data.sha,
    mode: '100644', // blob
    type: 'blob',
  }));

  const createdTree = await octokit.gitdata.createTree({
    owner,
    repo,
    tree,
    base_tree: masterBranchData.treeSha,
  });

  // Create commit
  const newCommit = await octokit.gitdata.createCommit({
    owner,
    repo,
    message: 'Upgrade all dependencies',
    tree: createdTree.data.sha,
    parents: [masterBranchData.commitSha],
  });

  // Create/update cotton branch HEAD
  const setRefOpts = {
    owner,
    repo,
    ref: `refs/heads/${cottonBranch}`,
    sha: newCommit.data.sha,
  };
  await octokit.gitdata.createReference(setRefOpts).catch((e) => {
    // Catch e if e is "Reference already exists" and update reference instead
    if (e.code !== 422) throw e;
    return octokit.gitdata.updateReference({
      ...setRefOpts,
      ref: `heads/${cottonBranch}`,
      force: true,
    });
  });

  return newCommit.data.sha;
}

// TODO: Inject/update PR body metadata
function createOrUpdatePR(
  owner: string,
  repo: string,
  upgradeDiff: any,
  prData: any | null,
  octokit: Octokit,
) {
  const commonPrOpts = { owner, repo };
  if (!prData) {
    return octokit.pullRequests.create({
      ...commonPrOpts,
      head: cottonBranch,
      base: 'master',
      title: 'Upgrade all dependencies',
      body: 'supoer awesome :tada:',
    });
  }
  return octokit.pullRequests.update({
    ...commonPrOpts,
    number: prData.number,
    body: 'edited body :thinking:',
  });
}

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
  const rawUpgradeSummary = await Promise.map(projDirPaths, (projDir: PathPair) =>
    upgradeProject(projDir.localPath),
  );
  // Remove projects in this repo that weren't upgraded
  const upgradeSummary = _.filter(rawUpgradeSummary);

  // Abort if nothing was upgraded
  if (upgradeSummary.length === 0) {
    console.log('Nothing to upgrade for', repoDetails.full_name);
    return null;
  }

  // Commit files
  const commitSha = await commitFiles(owner, repo, filePaths, octokit);

  // Create or edit PR
  // TODO: Construct a serializable upgrade summary
  const prResult = await createOrUpdatePR(owner, repo, upgradeSummary, prData, octokit);

  const result = { commitSha, upgradeSummary, projDirPaths };
  return result;
}

// Upgrade an installation
async function upgradeInstallation(installationId: string, token: string) {
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

export const restTrigger: Handler = async (
  event: APIGatewayEvent,
  context: Context,
  callback: Callback,
) => {
  // Initialize and authenticate octokit
  const octokit = new Octokit();
  octokit.authenticate({ type: 'integration', token: generateGitHubToken() });

  let response: any | null = null;

  try {
    // Get installation IDs and access tokens
    const installationIds: string[] = await fetchInstallationIds(octokit);
    const tokens: string[] = await fetchTokensForInstallations(installationIds, octokit);

    // Pair up installation IDs with access tokens
    if (installationIds.length !== tokens.length) throw 'Not all installations have tokens';
    const installationIdTokenPairs = <[string, string][]>_.zip(installationIds, tokens);

    // Upgrade all repos in all installations
    const result = await Promise.map(installationIdTokenPairs, (pair: [string, string]) =>
      upgradeInstallation(pair[0], pair[1]),
    );

    response = {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (e) {
    return callback(e);
  }

  return callback(null, response);
};
