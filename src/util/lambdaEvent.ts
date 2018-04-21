// Functions to guess the source of an AWS Lambda event.
// Adapted from https://stackoverflow.com/a/41837288/5281021

export function isSnsEvent(event: any): boolean {
  if (event.Records && event.Records[0].EventSource === 'aws:sns') return true;
  return false;
}

export function isApiGatewayEvent(event: any): boolean {
  if (event.httpMethod) return true;
  return false;
}

export function isScheduledEvent(event: any): boolean {
  if (event.source === 'aws.events') return true;
  return false;
}
