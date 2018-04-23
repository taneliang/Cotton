import * as Octokit from '@octokit/rest';
import { cottonBranch } from '../config';
import { RepoDiff } from '../upgrade';
import { PR_TITLE, prBody } from '../util/pr';
import { readFileAsync, PathPair } from '../util/files';
import { fetchBranchData } from './queries';

import * as bluebird from 'bluebird';
global.Promise = bluebird;

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
  upgradeSummary: RepoDiff,
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
