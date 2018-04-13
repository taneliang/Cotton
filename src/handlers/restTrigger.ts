import { dirname, join } from 'path';
import { writeFile } from 'fs';
import { promisify } from 'util';
import { APIGatewayEvent, Callback, Context, Handler } from 'aws-lambda';
import * as Octokit from '@octokit/rest';
import * as _ from 'lodash';
import 'lodash.product';
import * as mkdirp from 'mkdirp';

import generateGitHubToken from '../auth/generateToken';

import * as bluebird from 'bluebird';
global.Promise = bluebird;

type PathPair = {
  repoPath: string;
  localPath: string;
};

// Using 2 different versions of promisify to get around compile
// error: TS2554: Expected X arguments, but got Y.
const mkdirpAsync = Promise.promisify(mkdirp);
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

// Return directories where both package.json and yarn.lock are present
export function findProjectRootDirs(packageJsonPaths: string[], yarnLockPaths: string[]): string[] {
  // Get dir paths without filenames
  const packageJsonDirs = packageJsonPaths.map(dirname);
  const yarnLockDirs = yarnLockPaths.map(dirname);

  // Filter out package.json dirs that don't have a corresponding yarn.lock dir
  // TODO: Use _.intersection
  return packageJsonDirs.filter((dir: string) => yarnLockDirs.includes(dir));
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

// Upgrade a repository. octokit should be authenticated with token to access repo.
async function upgradeRepository(repoDetails: any, octokit: Octokit) {
  console.log('Upgrading repository', repoDetails.full_name);

  // TODO: Find existing PR if present. Branches?

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

  // TODO: Upgrade all package.jsons

  // TODO: Run yarn for all package.jsons

  // TODO: Commit all files

  // TODO: Submit or edit PR

  const result = { projDirPaths, filePaths };
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

  let response = null;

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
