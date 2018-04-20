import { APIGatewayEvent, Callback, Context, Handler } from 'aws-lambda';
import * as Octokit from '@octokit/rest';
import * as _ from 'lodash';

import { upgradeInstallation } from './upgradeInstallation';
import { fetchInstallationIds } from '../github';
import generateGitHubToken from '../auth/generateToken';

import * as bluebird from 'bluebird';
global.Promise = bluebird;

export const upgradeAllInstallations: Handler = async (
  event: APIGatewayEvent,
  context: Context,
  callback: Callback,
) => {
  let response: any | null = null;

  try {
    // Initialize and authenticate octokit
    const octokit = new Octokit();
    octokit.authenticate({ type: 'integration', token: generateGitHubToken() });

    // Upgrade all repos in all installations
    const installationIds: string[] = await fetchInstallationIds(octokit);
    const result = await Promise.map(installationIds, upgradeInstallation);

    response = { statusCode: 200, body: JSON.stringify(result) };
  } catch (e) {
    return callback(e);
  }

  return callback(null, response);
};
