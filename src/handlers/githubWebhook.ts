import { APIGatewayEvent, Callback, Context, Handler } from 'aws-lambda';
import { verifyWebhookEvent } from '../github/auth';

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
  let error = verifyWebhookEvent(event);
  if (error) {
    return callback(null, { ...error, headers: { 'Content-Type': 'text/plain' } });
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
