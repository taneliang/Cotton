import { APIGatewayEvent, Callback, Context, Handler } from 'aws-lambda';
import { verifyWebhookEvent } from '../github/auth';
import { handleIssueCommentCreated, handlePrReviewCommentCreated } from '../github/webhookHandlers';

async function handleEvent(eventType: string, payload: { [key: string]: any }) {
  const action: string | undefined = payload.action;

  console.log('---------------------------------');
  console.log('Payload', payload);
  console.log(`Github-Event: "${eventType}" with action: "${action}"`);
  console.log('---------------------------------');

  // TODO: Handlers:
  // InstallationEvent created: Trigger upgrade
  // InstallationRepositoriesEvent added: Trigger repo upgrade
  // IssueCommentEvent created: Possibly trigger repo upgrade
  // IssuesEvent closed: Possibly delete branch
  // PullRequestReviewCommentEvent created: Possibly trigger upgrade
  // PushEvent: Possibly trigger upgrade

  function eventAction(eventType: string, actionStr: string | undefined) {
    return `${eventType} ____ ${actionStr || '__NO_ACTION__'}`;
  }

  switch (eventAction(eventType, action)) {
    case eventAction('issue_comment', 'created'):
      return handleIssueCommentCreated(payload);
    case eventAction('pull_request_review_comment', 'created'):
      return handlePrReviewCommentCreated(payload);
    default:
      console.log('Unsupported event', eventType, action || '');
      break;
  }
}

export const githubWebhookListener: Handler = async (
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
  const eventType = event.headers['x-github-event'] || event.headers['X-GitHub-Event'];
  const result = await handleEvent(eventType, JSON.parse(event.body || ''));

  const response = {
    statusCode: 200,
    body: JSON.stringify({
      result,
    }),
  };

  return callback(null, response);
};
