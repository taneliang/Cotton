import { APIGatewayEvent, SNSEvent, Callback, Context, Handler } from 'aws-lambda';
import * as Octokit from '@octokit/rest';
import * as _ from 'lodash';
import { upgradeRepository } from './upgradeRepository';
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
  // TODO: Split repo upgrades into individual lambdas
  const repos = await octokit.apps.getInstallationRepositories({});
  return Promise.map(repos.data.repositories, (repoDetails: any) =>
    upgradeRepository(repoDetails, octokit),
  );
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
