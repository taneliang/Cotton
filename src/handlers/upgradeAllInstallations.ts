import { promisify } from 'util';
import { APIGatewayEvent, Callback, Context, Handler } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import * as Octokit from '@octokit/rest';
import * as _ from 'lodash';

import { fetchInstallationIds } from '../github/queries';
import { generateGitHubToken } from '../github/auth';

import * as bluebird from 'bluebird';
global.Promise = bluebird;

export const upgradeAllInstallations: Handler = async (
  event: APIGatewayEvent,
  context: Context,
  callback: Callback,
) => {
  try {
    // Initialize and authenticate octokit
    const octokit = new Octokit();
    octokit.authenticate({ type: 'integration', token: generateGitHubToken() });

    // Upgrade all repos in all installations
    const installationIds: number[] = await fetchInstallationIds(octokit);

    console.log('Upgrading installations:', installationIds);
    const sns = new AWS.SNS();
    const publishAsync = promisify(sns.publish);
    await Promise.map(installationIds, (instId: number) => {
      return publishAsync.call(sns, {
        Message: instId.toString(),
        TopicArn: process.env.upgradeInstallationSnsArn,
      });
    });

    return callback(null, {
      statusCode: 200,
      body: JSON.stringify({ installationIds }),
    });
  } catch (e) {
    return callback(e);
  }
};
