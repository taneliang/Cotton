import { APIGatewayEvent, Callback, Context, Handler } from 'aws-lambda';
import * as Octokit from '@octokit/rest';
import { zip } from 'lodash';

import generateGitHubToken from '../auth/generateToken';

import * as bluebird from 'bluebird';
global.Promise = bluebird;

async function fetchInstallationIds(octokit: Octokit) {
  const installations = await octokit.apps.getInstallations({});
  return installations.data.map((inst: any) => inst.id);
}

function fetchTokensForInstallations(installationIds: string[], octokit: Octokit) {
  return Promise.map(installationIds, async (installationId: string) => {
    const tokenResult = await octokit.apps.createInstallationToken({
      installation_id: installationId,
    });
    return tokenResult.data.token;
  });
}

// Upgrade a repository. octokit should be authenticated with token to access repo.
async function upgradeRepository(repoDetails: any, octokit: Octokit) {
  console.log('Upgrading repository', repoDetails.full_name);

  // TODO: Find existing PR if present. Branches?

  // Get paths to all package.json and yarn.lock files
  const query = (filename: string) => `filename:${filename} repo:${repoDetails.full_name}`;
  const [packageJsons, yarnLocks] = await Promise.all([
    octokit.search.code({ q: query('package.json') }),
    octokit.search.code({ q: query('yarn.lock') }),
  ]);

  // TODO: Filter out all package.jsons without a corresponding yarn.lock and vice versa

  // TODO: Download all package.jsons and yarn.lock pairs and store them in project directories

  // TODO: Upgrade all package.jsons

  // TODO: Run yarn for all package.jsons

  // TODO: Commit all files

  // TODO: Submit or edit PR

  const result = { packageJsons, yarnLocks };
  return result;
}

// Upgrade an installation
async function upgradeInstallation(installationId: string, token: string) {
  console.log('Upgrading installation', installationId);

  // Initialize octokit and authenticate for this installation
  const octokit = new Octokit();
  octokit.authenticate({ type: 'token', token });

  // Find and upgrade all repos in this installation
  const repos = await octokit.apps.getInstallationRepositories({});
  const result = await Promise.map(repos.data.repositories, (repoDetails: any) =>
    upgradeRepository(repoDetails, octokit),
  );
  return result;
}

export const restTrigger: Handler = async (
  event: APIGatewayEvent,
  context: Context,
  callback: Callback,
) => {
  // Initialize and authenticate octokit
  const octokit = new Octokit();
  octokit.authenticate({ type: 'integration', token: generateGitHubToken() });

  let response = null;

  try {
    // Get installation IDs and access tokens
    const installationIds = await fetchInstallationIds(octokit);
    const tokens = await fetchTokensForInstallations(installationIds, octokit);
    const installationIdTokenPairs = zip(installationIds, tokens);

    // Upgrade all repos in all installations
    const result = await Promise.map(installationIdTokenPairs, async (pair: [string, string]) =>
      upgradeInstallation(pair[0], pair[1]),
    );

    response = {
      statusCode: 200,
      body: JSON.stringify({
        result,
      }),
    };
  } catch (e) {
    return callback(e);
  }

  return callback(null, response);
};
