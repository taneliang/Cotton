import { slashCommands, handleIssueCommentCreated } from './webhookHandlers';

jest.mock('aws-sdk');
const AWS = require('aws-sdk');

const issuecommentCreatedPrPayload = require('./__mocks__/ghwh.issuecomment.created.pr.json');

describe(slashCommands, () => {
  test('should match valid slash commands', () => {
    const strs = {
      '/abcDe': ['abcde'],
      '        /abcDe  ': ['abcde'],
      '\n/abcDe\n': ['abcde'],
      '/aBc /deF\n/Ghi': ['abc', 'def', 'ghi'],
      'not/aBc /deF\n/Ghi': ['def', 'ghi'],
    };
    Object.entries(strs).forEach(([str, cmd]: [string, string[]]) =>
      expect(slashCommands(str)).toEqual(cmd),
    );
  });

  test('should return null when there are no valid slash commands', () => {
    const strs = ['abcde', '        a/abcde  ', '1/abcde', './pathy/path', '/'];
    strs.forEach((str: string) => expect(slashCommands(str)).toBe(null));
  });
});

describe(handleIssueCommentCreated, () => {
  test('should ignore PRs not by us', async () => {
    const samplePayload = {
      ...issuecommentCreatedPrPayload,
      issue: {
        user: {
          login: 'totally_not_cotton[bot]',
          html_url: 'https://github.com/apps/totally_not_cotton',
        },
      },
    };
    await expect(handleIssueCommentCreated(samplePayload)).resolves.toBeUndefined();
  });

  test('should ignore payloads without installation', async () => {
    const samplePayload = { ...issuecommentCreatedPrPayload };
    delete samplePayload.installation;
    await expect(handleIssueCommentCreated(samplePayload)).resolves.toBeUndefined();
  });

  test('should ignore comments without slash command', async () => {
    const samplePayload = {
      ...issuecommentCreatedPrPayload,
      comment: { body: 'no slash commands/has invalid commands' },
    };
    await expect(handleIssueCommentCreated(samplePayload)).resolves.toBeUndefined();
  });

  test('should ignore comments with unsupported commands', async () => {
    const samplePayload = {
      ...issuecommentCreatedPrPayload,
      comment: { body: '/badbot' },
    };
    await expect(handleIssueCommentCreated(samplePayload)).resolves.toBeUndefined();
  });

  test('should handle comments with supported commands', async () => {
    const samplePayload = {
      ...issuecommentCreatedPrPayload,
      comment: { body: '/UpGrade' },
    };

    const publish = jest.fn().mockImplementation((params: any, callback: Function) => callback());
    AWS.SNS.mockImplementation(() => ({ publish }));
    await expect(handleIssueCommentCreated(samplePayload)).resolves.toBeTruthy();
    expect(publish).toHaveBeenCalled();
  });
});

describe('webhooks should ignore other events', () => {
  // Sample webhook payloads for use in tests
  const samplePayloads = [issuecommentCreatedPrPayload];

  // Tests webhook handler, expecting it to return a falsy value for every payload
  // except the ones in passingIndices.
  function testWebhookIdentification(passingIndices: number[], handler: (payload: any) => any) {
    describe(handler, () => {
      samplePayloads.forEach((payload: any, index: number) => {
        if (!passingIndices.includes(index)) {
          test(`should return falsy value for payload ${index}`, async () => {
            return expect(handler(payload)).resolves.toBeFalsy();
          });
        }
      });
    });
  }

  testWebhookIdentification([0], handleIssueCommentCreated);
});
