import * as Octokit from '@octokit/rest';
import { PackageDiff } from './upgrade';
import { PR_TITLE, prBody } from './util/pr';
import { readFileAsync, writeFileAsync, PathPair } from './util/files';

import * as bluebird from 'bluebird';
global.Promise = bluebird;

const cottonBranch = 'cotton/upgrade';

export async function fetchInstallationIds(octokit: Octokit) {
  const installations = await octokit.apps.getInstallations({});
  return installations.data.map((inst: any) => inst.id);
}

export async function fetchTokenForInstallation(installationId: string, octokit: Octokit) {
  const tokenResult = await octokit.apps.createInstallationToken({
    installation_id: installationId,
  });
  return tokenResult.data.token;
}

export async function fetchLastPRData(owner: string, repo: string, octokit: Octokit) {
  // Find our PR, if present
  const allPrs = await octokit.pullRequests.getAll({
    owner,
    repo,
    head: `${owner}:${cottonBranch}`,
  });

  // Return null if there are no PRs for cotton branch
  if (allPrs.data.length === 0) return null;

  // Log warning if more than 1 PR was found
  if (allPrs.data.length > 1) {
    console.log(owner + '/' + repo, 'has', allPrs.data.length, 'PRs on cotton branch!');
    // TODO: Close PRs or handle them somehow
  }

  const { number: id, body } = allPrs.data[0];
  // TODO: Extract PR body metadata

  // Check if foreign commits are present
  const commits = await octokit.pullRequests.getCommits({ owner, repo, number: id });
  const authors = commits.data
    .map((c: any) => c.author.login)
    .filter((author: string) => author !== 'cotton[bot]'); // TODO: Replace magic const
  const foreignCommitsPresent = authors.length > 0;

  return { id, body, foreignCommitsPresent };
}

// Fetch all files in owner/repo and save to disk
export function fetchFiles(owner: string, repo: string, filePaths: PathPair[], octokit: Octokit) {
  return Promise.map(filePaths, (filePath: PathPair) =>
    octokit.repos
      .getContent({ owner, repo, path: filePath.repoPath })
      .then((content: any) =>
        writeFileAsync(filePath.localPath, content.data.content, content.data.encoding),
      ),
  );
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

export async function commitFiles(
  owner: string,
  repo: string,
  filePaths: PathPair[],
  octokit: Octokit,
) {
  // Fetch master branch data for committing
  const masterBranchData = await fetchBranchData(owner, repo, 'master', octokit);

  if (!masterBranchData) {
    console.log(owner + '/' + repo, 'does not have a master branch!');
    throw new Error('No master branch found in ' + owner + '/' + repo);
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

export function createOrUpdatePR(
  owner: string,
  repo: string,
  upgradeSummary: { [index: string]: PackageDiff },
  prData: any | null,
  octokit: Octokit,
) {
  const commonPrOpts = { owner, repo, body: prBody(upgradeSummary) };
  if (!prData) {
    return octokit.pullRequests.create({
      ...commonPrOpts,
      head: cottonBranch,
      base: 'master',
      title: PR_TITLE,
    });
  }
  return octokit.pullRequests.update({
    ...commonPrOpts,
    number: prData.id,
  });
}
