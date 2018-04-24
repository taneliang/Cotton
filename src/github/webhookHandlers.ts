import { basename, dirname } from 'path';
import { promisify } from 'util';
import * as AWS from 'aws-sdk';
import * as Octokit from '@octokit/rest';
import * as _ from 'lodash';
import { cottonBranch } from '../config';
import { RepoDetails } from '../handlers/upgradeRepository';
import { fetchTokenForInstallation } from '../github/queries';
import { generateGitHubToken } from '../github/auth';
import { getPrMetadata, setPrMetadata } from '../util/pr';

// Returns an array of lowercased slash commands, or null if no slash commands found.
export function slashCommands(str: string) {
  const matches = str.match(/(?:^|\s)\/(\w)+/g);
  if (matches === null) return matches;
  return matches.map(
    (match: string) =>
      match
        .trim() // Trim whitespace
        .toLowerCase() // Lowercase for easier identification
        .substring(1), // Remove leading /
  );
}

// Use SNS to invoke lambda that upgrades repos
async function invokeUpgradeRepo(installationId: string, repoDetails: RepoDetails) {
  const sns = new AWS.SNS();
  const publishAsync = promisify(sns.publish);
  const messageObject = { installationId, repoDetails };
  return publishAsync.call(sns, {
    Message: JSON.stringify(messageObject),
    TopicArn: process.env.upgradeRepositorySnsArn,
  });
}

export async function handleIssueCommentCreated(payload: any) {
  // Only handle pull requests
  if (!payload.issue || !payload.issue.pull_request) return undefined;

  // Only handle PR creations
  if (payload.action !== 'created') return undefined;

  // Only handle our upgrade PR
  if (
    payload.issue.user.login !== 'cotton[bot]' ||
    payload.issue.user.html_url !== 'https://github.com/apps/cotton'
  ) {
    return undefined;
  }

  // Only handle open PRs
  if (payload.issue.state !== 'open') return undefined;

  // Abort if no installation - we need installation to upgrade
  if (!payload.installation) return undefined;

  // Abort if no body - weird input
  if (!payload.comment.body) return undefined;

  // Abort if no slash command - definitely not meant for us
  const body = payload.comment.body;
  const commands = slashCommands(body);
  if (!commands) return undefined;

  // Perform slash commands
  const upgradeCommands = ['upgrade', 'reupgrade', 'update'];
  if (_.intersection(commands, upgradeCommands).length > 0) {
    const installationId = payload.installation.id;
    const repoDetails = {
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
    };
    await invokeUpgradeRepo(installationId, repoDetails);
    return { commands, installationId, repoDetails };
  }
}

// Extract package name from GitHub diff hunk at position.
// Position docs: https://developer.github.com/v3/pulls/comments/#create-a-comment
export function packageFromDiffHunk(diffHunk: string, position: number) {
  const lines = diffHunk.split('\n');
  let line = lines[position];
  if (!line) return undefined;

  // Assume line is in the form '+    "react": "^16.3.0",', possibly without
  // the trailing comma (if it's the last dep), and possibly prefixed with a
  // '-' instead if the line was removed.

  // Ignore (i.e. return undefined) for lines without a +/- prefix.
  if (line.substr(0, 1) !== '+' && line.substr(0, 1) !== '-') return undefined;
  line = line.substr(1);

  // Extract the package name "react" by trimming whitespace from the line,
  // then removing the comma if it exists. This should turn it into the valid
  // JSON string '{"react": "^16.3.0"}'.
  line = line.trim(); // Trim whitespace
  if (line.substr(-1) === ',') line = line.slice(0, -1); // Remove comma
  line = `{${line}}`;

  // Parse JSON string
  try {
    const obj = JSON.parse(line);
    if (!_.isPlainObject(obj)) return undefined; // Abort if JSON is not an object
    return Object.keys(obj)[0]; // Return first key in object
  } catch (e) {
    return undefined;
  }
}

export async function handlePrReviewCommentCreated(payload: any) {
  // Only handle comment creations
  if (payload.action !== 'created') return undefined;

  // Only handle PRs and comments
  if (!payload.pull_request || !payload.comment) return undefined;

  // Only handle our upgrade PR
  if (payload.pull_request.head.ref !== cottonBranch) return undefined;

  // Only handle open PRs
  if (payload.pull_request.state !== 'open') return undefined;

  // Abort if no installation - we need installation to upgrade
  if (!payload.installation) return undefined;

  // Abort if no body - weird input
  const body = payload.comment.body;
  if (!body) return undefined;

  // Abort if no slash command - definitely not meant for us
  const commands = slashCommands(body);
  if (!commands) return undefined;

  // Perform slash commands
  const discardCommands = ['discard', 'ignore', 'undo', 'nah'];
  if (_.intersection(commands, discardCommands).length > 0) {
    const { diff_hunk: diffHunk, position, path: filePath } = payload.comment;

    // Ignore comments that are not on a package.json file
    if (basename(filePath) !== 'package.json') return undefined;
    const repoPath = dirname(filePath);

    // Identify package name
    const packageToDiscard = packageFromDiffHunk(diffHunk, position);
    if (!packageToDiscard) return undefined;

    const installationId = payload.installation.id;
    const repoDetails = {
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
    };

    // Modify PR description to include this package

    // Add packageToDiscard to upgradeSummary
    const prBody = payload.pull_request.body;
    const upgradeSummary = getPrMetadata(prBody).upgradeSummary || {};
    const newSummary = _.update(
      upgradeSummary,
      [repoPath, 'ignored'],
      // Ensure ignored array exists
      (ignoredArray: any | undefined) => ignoredArray || [],
    );
    newSummary[repoPath].ignored.push(packageToDiscard);
    newSummary[repoPath].ignored = _.uniq(newSummary[repoPath].ignored);

    // Initialize octokit and authenticate for this installation
    const octokit = new Octokit();
    octokit.authenticate({ type: 'integration', token: generateGitHubToken() });
    const token = await fetchTokenForInstallation(installationId, octokit);
    octokit.authenticate({ type: 'token', token });

    await octokit.pullRequests.update({
      ...repoDetails,
      number: payload.pull_request.number,
      body: setPrMetadata(prBody, upgradeSummary),
    });

    // Invoke upgrade lambda
    await invokeUpgradeRepo(installationId, repoDetails);
    return { commands, packageToDiscard, installationId, repoDetails };
  }
}
