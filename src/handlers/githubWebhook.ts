import { APIGatewayEvent, Callback, Context, Handler } from 'aws-lambda';
import { createHmac } from 'crypto';

function signRequestBody(key: string, body: string | null) {
  if (!body) return null;
  return `sha1=${createHmac('sha1', key)
    .update(body, 'utf8')
    .digest('hex')}`;
}

const responseHeaders = { 'Content-Type': 'text/plain' };

// Verifies authenticity of a webhook event.
// https://developer.github.com/webhooks/#delivery-headers
function verifyGitHubWebhookEvent(event: APIGatewayEvent) {
  const token = process.env.GITHUB_WEBHOOK_SECRET;
  if (typeof token !== 'string') {
    const errMsg = "Must provide a 'GITHUB_WEBHOOK_SECRET' env variable";
    return { statusCode: 401, body: errMsg };
  }

  const headers = event.headers;

  const sig = headers['x-hub-signature'];
  if (!sig) {
    const errMsg = 'No X-Hub-Signature found on request';
    return { statusCode: 401, body: errMsg };
  }

  const githubEvent = headers['x-github-event'];
  if (!githubEvent) {
    const errMsg = 'No X-Github-Event found on request';
    return { statusCode: 422, body: errMsg };
  }

  const id = headers['x-github-delivery'];
  if (!id) {
    const errMsg = 'No X-Github-Delivery found on request';
    return { statusCode: 401, body: errMsg };
  }

  const calculatedSig = signRequestBody(token, event.body);
  if (sig !== calculatedSig) {
    const errMsg = "X-Hub-Signature incorrect. Github webhook token doesn't match";
    return { statusCode: 401, body: errMsg };
  }

  return null;
}

function handleEvent(eventType: string, payload: { [key: string]: any }) {
  const action: string | undefined = payload.action;

  console.log('---------------------------------');
  console.log(`Github-Event: "${eventType}" with action: "${action}"`);
  console.log('---------------------------------');
  console.log('Payload', payload);

  // TODO: Handlers:
  // InstallationEvent created: Trigger upgrade
  // InstallationRepositoriesEvent added: Trigger repo upgrade
  // IssueCommentEvent created: Possibly trigger repo upgrade
  // IssuesEvent closed: Possibly delete branch
  // PullRequestReviewCommentEvent created: Possibly trigger upgrade
  // PushEvent: Possibly trigger upgrade

  switch (eventType) {
    default:
      console.log('Unsupported event', eventType);
      break;
  }
}

export const githubWebhookListener: Handler = (
  event: APIGatewayEvent,
  context: Context,
  callback: Callback,
) => {
  let error = verifyGitHubWebhookEvent(event);
  if (error) {
    return callback(null, { ...error, headers: responseHeaders });
  }

  // Do custom stuff here with github event data
  // For more on events see https://developer.github.com/v3/activity/events/types/
  const result = handleEvent(event.headers['x-github-event'], JSON.parse(event.body || ''));

  const response = {
    statusCode: 200,
    body: JSON.stringify({
      result,
    }),
  };

  return callback(null, response);
};
