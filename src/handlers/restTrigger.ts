import { APIGatewayEvent, Callback, Context, Handler } from 'aws-lambda';
import * as Octokit from '@octokit/rest';

export const restTrigger: Handler = async (
  event: APIGatewayEvent,
  context: Context,
  callback: Callback,
) => {
  const octokit = new Octokit();
  let response = null;

  try {
    // const result = await octokit.apps.get({});
    const result = await octokit.misc.getRepoLicense({
      owner: 'nusmodifications',
      repo: 'nusmods',
    });

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
