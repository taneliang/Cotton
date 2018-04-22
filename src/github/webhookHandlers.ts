import { promisify } from 'util';
import * as AWS from 'aws-sdk';
import * as _ from 'lodash';

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

export async function handleIssueCommentCreated(payload: any) {
  // Only handle pull requests
  if (!payload.issue.pull_request) return;

  // Only handle PR creations
  if (payload.action !== 'created') return;

  // Only handle our upgrade PR
  if (
    payload.issue.user.login !== 'cotton[bot]' ||
    payload.issue.user.html_url !== 'https://github.com/apps/cotton'
  )
    return;

  // Abort if no installation - we need installation to upgrade
  if (!payload.installation) return;

  // Abort if no body - weird input
  if (!payload.comment.body) return;

  // Abort if no slash command - definitely not meant for us
  const body = payload.comment.body;
  const commands = slashCommands(body);
  if (!commands) return;

  // Perform slash commands
  const upgradeCommands = ['upgrade', 'reupgrade', 'update'];
  if (_.intersection(commands, upgradeCommands).length > 0) {
    const installationId = payload.installation.id;

    // Use SNS to invoke lambda that upgrades repos
    const sns = new AWS.SNS();
    const publishAsync = promisify(sns.publish);
    const messageObject = {
      installationId,
      repoDetails: {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
      },
    };
    await publishAsync.call(sns, {
      Message: JSON.stringify(messageObject),
      TopicArn: process.env.upgradeRepositorySnsArn,
    });
    return { installationId, commands, messageObject };
  }
}
