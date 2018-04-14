import { dirname, join } from 'path';
import { readFile, writeFile } from 'fs';
import { promisify } from 'util';
import { APIGatewayEvent, Callback, Context, Handler } from 'aws-lambda';
import * as Octokit from '@octokit/rest';
import * as _ from 'lodash';
import 'lodash.product';
import * as mkdirp from 'mkdirp';
import * as ncu from 'npm-check-updates';

import generateGitHubToken from '../auth/generateToken';

import * as bluebird from 'bluebird';
global.Promise = bluebird;

type PathPair = {
  repoPath: string;
  localPath: string;
};

type PackageJson = {
  name: string;
  version: string;
  dependencies: { readonly [index: string]: string } | undefined;
  devDependencies: { readonly [index: string]: string } | undefined;
};

const cottonBranch = 'cotton/upgrade';

// Using 2 different versions of promisify to get around compile
// error: TS2554: Expected X arguments, but got Y.
const mkdirpAsync = Promise.promisify(mkdirp);
const readFileAsync = promisify(readFile);
const writeFileAsync = promisify(writeFile);

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

// TODO: Handle ignored packages
async function upgradeProject(rootDir: string) {
  // Read package.json
  const packageJsonPath = join(rootDir, 'package.json');
  const packageJson = await readFileAsync(packageJsonPath, 'utf-8');
  // console.log('before', packageJsonString);

  // TODO: Calculate diff
  // const package = JSON.parse(packageJson) as PackageJson;

  // TODO: Ensure that custom packages are ignored
  const upgradedPackage = await ncu.run({
    packageFile: packageJsonPath,
    silent: true,
    jsonAll: true,
    upgradeAll: true,
  });

  // Save new package.json
  // TODO: Preserve formatting (only replace necessary bits? Prettier?)
  await writeFileAsync(packageJsonPath, JSON.stringify(upgradedPackage, null, 2), 'utf-8');

  // TODO: Run yarn to update yarn.lock

  // TODO: Return diff
  return upgradedPackage;
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

  // TODO: Create cotton branch if it doesn't exist

  // TODO: Update cotton branch HEAD

  return newCommit.data.sha;
}

// Upgrade a repository. octokit should be authenticated with token to access repo.
async function upgradeRepository(repoDetails: any, octokit: Octokit) {
  console.log('Upgrading repository', repoDetails.full_name);

  // TODO: Abort if foreign commits present in PR. https://octokit.github.io/rest.js/#api-PullRequests-getCommits

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

  if (projDirPaths.length === 0) {
    console.log('No package.json + yarn.lock pairs in', repoDetails.full_name);
    return {};
  }

  // Download all package.jsons and yarn.lock pairs and store them in project directories
  await Promise.map(projDirPaths, (dir: PathPair) => mkdirpAsync(dir.localPath, {}));
  const filePaths = getFilePaths(projDirPaths, ['package.json', 'yarn.lock']);
  await fetchFiles(repoDetails.owner.login, repoDetails.name, filePaths, octokit);

  // TODO: Upgrade projects
  await Promise.map(projDirPaths, (projDir: PathPair) => upgradeProject(projDir.localPath));

  // TODO: Abort if nothing was upgraded

  // Commit files
  const commitSha = await commitFiles(
    repoDetails.owner.login,
    repoDetails.name,
    filePaths,
    octokit,
  );

  // TODO: Create or edit PR

  const result = { commitSha, projDirPaths, filePaths };
  return result;
}

// Upgrade an installation
async function upgradeInstallation(installationId: string, token: string) {
  console.log('Upgrading installation', installationId);

  // Initialize octokit and authenticate for this installation
  const octokit = new Octokit();
  octokit.authenticate({ type: 'token', token });

  // Find and upgrade all repos in this installation
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
      body: JSON.stringify({
        result,
      }),
    };
  } catch (e) {
    return callback(e);
  }

  return callback(null, response);
};
