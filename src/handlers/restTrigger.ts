import { APIGatewayEvent, Callback, Context, Handler } from 'aws-lambda';

export const restTrigger: Handler = (
  event: APIGatewayEvent,
  context: Context,
  callback: Callback,
) => {
  const response = {
    statusCode: 200,
    body: JSON.stringify({
      input: event,
    }),
  };

  return callback(null, response);
};
