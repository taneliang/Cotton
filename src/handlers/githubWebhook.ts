import { APIGatewayEvent, Callback, Context, Handler } from 'aws-lambda';
import { createHmac } from 'crypto';

function signRequestBody(key: string, body: string | null) {
  if (!body) return null;
  return `sha1=${createHmac('sha1', key)
    .update(body, 'utf8')
    .digest('hex')}`;
}

export const githubWebhookListener: Handler = (
  event: APIGatewayEvent,
  context: Context,
  callback: Callback,
) => {
  let errMsg;

  const token = process.env.GITHUB_WEBHOOK_SECRET;
  if (typeof token !== 'string') {
    errMsg = "Must provide a 'GITHUB_WEBHOOK_SECRET' env variable";
    return callback(null, {
      statusCode: 401,
      headers: { 'Content-Type': 'text/plain' },
      body: errMsg,
    });
  }

  const headers = event.headers;

  const sig = headers['x-hub-signature'];
  if (!sig) {
    errMsg = 'No X-Hub-Signature found on request';
    return callback(null, {
      statusCode: 401,
      headers: { 'Content-Type': 'text/plain' },
      body: errMsg,
    });
  }

  const githubEvent = headers['x-github-event'];
  if (!githubEvent) {
    errMsg = 'No X-Github-Event found on request';
    return callback(null, {
      statusCode: 422,
      headers: { 'Content-Type': 'text/plain' },
      body: errMsg,
    });
  }

  const id = headers['x-github-delivery'];
  if (!id) {
    errMsg = 'No X-Github-Delivery found on request';
    return callback(null, {
      statusCode: 401,
      headers: { 'Content-Type': 'text/plain' },
      body: errMsg,
    });
  }

  const calculatedSig = signRequestBody(token, event.body);
  if (sig !== calculatedSig) {
    errMsg = "X-Hub-Signature incorrect. Github webhook token doesn't match";
    return callback(null, {
      statusCode: 401,
      headers: { 'Content-Type': 'text/plain' },
      body: errMsg,
    });
  }

  const parsedBody = JSON.parse(event.body || '');

  /* eslint-disable */
  console.log('---------------------------------');
  console.log(`Github-Event: "${githubEvent}" with action: "${parsedBody.action}"`);
  console.log('---------------------------------');
  console.log('Payload', parsedBody);
  /* eslint-enable */

  // Do custom stuff here with github event data
  // For more on events see https://developer.github.com/v3/activity/events/types/

  const response = {
    statusCode: 200,
    body: JSON.stringify({
      input: event,
    }),
  };

  return callback(null, response);
};
