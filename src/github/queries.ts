import * as Octokit from '@octokit/rest';
import { cottonBranch } from '../config';
import { writeFileAsync, PathPair } from '../util/files';

import * as bluebird from 'bluebird';
global.Promise = bluebird;

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

export async function fetchBranchData(
  owner: string,
  repo: string,
  branch: string,
  octokit: Octokit,
) {
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
