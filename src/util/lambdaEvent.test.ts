import { isSnsEvent, isApiGatewayEvent, isScheduledEvent } from './lambdaEvent';

// Sample event data from AWS for use in tests
// https://docs.aws.amazon.com/lambda/latest/dg/eventsources.html
const sampleEvents = [
  require('./__mocks__/aws.event.scheduled.json'),
  require('./__mocks__/aws.event.sns.json'),
  require('./__mocks__/aws.event.gatewayproxyrequest.json'),
];

// Tests indentifier function, expecting it to return false for every event
// except the one at passingIndex.
function testEventIdentifier(passingIndex: number, identifier: (event: any) => boolean) {
  describe(identifier, () => {
    sampleEvents.forEach((event: any, index: number) => {
      const expectation = index === passingIndex; // Expect true for passingIndex
      test(`should return ${expectation} for sample event ${index}`, () => {
        expect(identifier(event)).toBe(expectation);
      });
    });
  });
}

testEventIdentifier(0, isScheduledEvent);
testEventIdentifier(1, isSnsEvent);
testEventIdentifier(2, isApiGatewayEvent);
