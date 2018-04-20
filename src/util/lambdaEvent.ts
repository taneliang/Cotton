// Functions to guess the source of an AWS Lambda event.
// Adapted from https://stackoverflow.com/a/41837288/5281021

export function isSnsEvent(event: any) {
  return event.Records && event.Records[0].EventSource === 'aws:sns';
}

export function isApiGatewayEvent(event: any) {
  return event.httpMethod;
}

export function isScheduledEvent(event: any) {
  return event.source === 'aws.events';
}
