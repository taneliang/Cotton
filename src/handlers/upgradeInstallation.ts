import { promisify } from 'util';
import { APIGatewayEvent, SNSEvent, Callback, Context, Handler } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import * as Octokit from '@octokit/rest';
import * as _ from 'lodash';
import { fetchTokenForInstallation } from '../github';
import generateGitHubToken from '../auth/generateToken';
import { isSnsEvent, isApiGatewayEvent } from '../util/lambdaEvent';

// Upgrade an installation
async function upgrade(installationId: string) {
  console.log('Upgrading installation', installationId);

  // Initialize octokit and authenticate for this installation
  const octokit = new Octokit();
  octokit.authenticate({ type: 'integration', token: generateGitHubToken() });
  const token = await fetchTokenForInstallation(installationId, octokit);
  octokit.authenticate({ type: 'token', token });

  // Find and upgrade all repos in this installation
  const repos = await octokit.apps.getInstallationRepositories({});

  const sns = new AWS.SNS();
  const publishAsync = promisify(sns.publish);
  return Promise.map(repos.data.repositories, (repoDetails: any) => {
    const messageObject = {
      installationId,
      repoDetails: {
        owner: repoDetails.owner.login,
        repo: repoDetails.name,
      },
    };
    return publishAsync.call(sns, {
      Message: JSON.stringify(messageObject),
      TopicArn: process.env.upgradeRepositorySnsArn,
    });
  });
}

export const upgradeInstallation: Handler = async (
  event: any,
  context: Context,
  callback: Callback,
) => {
  // Extract installation ID
  let installationId;
  if (isSnsEvent(event)) {
    installationId = (event as SNSEvent).Records[0].Sns.Message;
  } else if (isApiGatewayEvent(event)) {
    const pathParams = (event as APIGatewayEvent).pathParameters;
    if (pathParams) installationId = pathParams.instId;
  }

  // Abort if no installation ID found
  if (!installationId) {
    console.log('No installation ID found.', event);
    return;
  }

  try {
    // Run upgrade routine
    const response = await upgrade(installationId);
    return callback(null, response);
  } catch (e) {
    return callback(e);
  }
};
