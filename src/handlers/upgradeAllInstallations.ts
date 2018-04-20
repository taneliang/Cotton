import { APIGatewayEvent, Callback, Context, Handler } from 'aws-lambda';
import * as Octokit from '@octokit/rest';
import * as _ from 'lodash';

import { upgradeInstallation } from './upgradeInstallation';
import { fetchInstallationIds, fetchTokensForInstallations } from '../github';
import generateGitHubToken from '../auth/generateToken';

import * as bluebird from 'bluebird';
global.Promise = bluebird;

export const upgradeAllInstallations: Handler = async (
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
    if (installationIds.length !== tokens.length) {
      throw new Error('Not all installations have tokens');
    }
    const installationIdTokenPairs = _.zip(installationIds, tokens) as [string, string][];

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
