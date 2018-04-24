import {
  slashCommands,
  handleIssueCommentCreated,
  handlePrReviewCommentCreated,
  packageFromDiffHunk,
} from './webhookHandlers';

jest.mock('aws-sdk');
jest.mock('@octokit/rest');
jest.mock('./auth');
jest.mock('./queries');
const AWS = require('aws-sdk');
const Octokit = require('@octokit/rest');
const { generateGitHubToken } = require('./auth');
const { fetchTokenForInstallation } = require('./queries');

const issuecommentCreatedPrPayload = require('./__mocks__/ghwh.issuecomment.created.pr.json');
const prreviewcommentCreatedPayload = require('./__mocks__/ghwh.prreviewcomment.created.json');

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

  test('should ignore closed PRs', async () => {
    // A closed, but otherwise valid PR
    const samplePayload = {
      ...issuecommentCreatedPrPayload,
      comment: { body: '/upgrade' },
      issue: {
        ...issuecommentCreatedPrPayload.issue,
        state: 'closed',
      },
    };

    // If this test fails, there may be strange errors caused by the mocked AWS SNS module.
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

describe(packageFromDiffHunk, () => {
  test('should return correct value for diff from GitHub', () => {
    const diffHunk =
      '@@ -4,9 +4,9 @@\n   "main": "index.js",\n   "license": "MIT",\n   "dependencies": {\n-    "react": "16.2.0"\n+    "react": "16.3.2"';
    expect(packageFromDiffHunk(diffHunk, 4)).toEqual('react'); // - line
    expect(packageFromDiffHunk(diffHunk, 5)).toEqual('react'); // + line
  });

  const splitHunks = [
    '@@ -4,9 +4,9 @@',
    '   "main": "index.js",',
    '   "license": "MIT",',
    '-  "Dependencies": {',
    '+  "dependencies": {',
    '     "unchanged": "1.2.3",',
    '-    "react": "16.2.0",',
    '-    "webpack": "4.0.0"',
    '+    "react": "16.3.2",',
    '+    "webpack": "4.5.0"',
  ];

  test('should return deps on lines with and without trailing commas', () => {
    const diffHunk = splitHunks.join('\n');
    expect(packageFromDiffHunk(diffHunk, 6)).toEqual('react'); // With comma
    expect(packageFromDiffHunk(diffHunk, 7)).toEqual('webpack'); // Without comma
  });

  test('should return deps on lines with + xor - prefixes', () => {
    const diffHunk = splitHunks.join('\n');
    expect(packageFromDiffHunk(diffHunk, 6)).toEqual('react'); // - react, comma
    expect(packageFromDiffHunk(diffHunk, 9)).toEqual('webpack'); // + webpack, no comma
  });

  test('should return undefined for unchanged deps', () => {
    const diffHunk = splitHunks.join('\n');
    expect(packageFromDiffHunk(diffHunk, 5)).toBeUndefined(); // "unchanged"
  });

  test('should return undefined for clearly non-dep lines', () => {
    const diffHunk = splitHunks.join('\n');
    // '"dependencies": {' line should cause JSON.parse to throw
    expect(packageFromDiffHunk(diffHunk, 4)).toBeUndefined(); // "dependencies"
  });
});

describe(handlePrReviewCommentCreated, () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('should ignore PRs not by us', async () => {
    const samplePayload = {
      ...prreviewcommentCreatedPayload,
      pull_request: {
        ...prreviewcommentCreatedPayload.pull_request,
        head: {
          ...prreviewcommentCreatedPayload.pull_request.head,
          ref: 'cotton/notcotton',
        },
      },
    };
    await expect(handlePrReviewCommentCreated(samplePayload)).resolves.toBeUndefined();
  });

  test('should ignore payloads without installation', async () => {
    const samplePayload = { ...prreviewcommentCreatedPayload };
    delete samplePayload.installation;
    await expect(handlePrReviewCommentCreated(samplePayload)).resolves.toBeUndefined();
  });

  test('should ignore comments without slash command', async () => {
    const samplePayload = {
      ...prreviewcommentCreatedPayload,
      comment: {
        ...prreviewcommentCreatedPayload.comment,
        body: 'no slash commands/has invalid commands',
      },
    };
    await expect(handlePrReviewCommentCreated(samplePayload)).resolves.toBeUndefined();
  });

  test('should ignore comments with unsupported commands', async () => {
    const samplePayload = {
      ...prreviewcommentCreatedPayload,
      comment: {
        ...prreviewcommentCreatedPayload.comment,
        body: '/badbot',
      },
    };
    await expect(handlePrReviewCommentCreated(samplePayload)).resolves.toBeUndefined();
  });

  test('should ignore closed PRs', async () => {
    // A closed, but otherwise valid PR
    const samplePayload = {
      ...prreviewcommentCreatedPayload,
      comment: {
        ...prreviewcommentCreatedPayload.comment,
        body: '/discard',
      },
      pull_request: {
        ...prreviewcommentCreatedPayload.pull_request,
        state: 'closed',
      },
    };

    await expect(handlePrReviewCommentCreated(samplePayload)).resolves.toBeUndefined();
  });

  test('should ignore comments on non-package.json files', async () => {
    const samplePayload = {
      ...prreviewcommentCreatedPayload,
      comment: {
        ...prreviewcommentCreatedPayload.comment,
        body: '/discard',
        path: 'CapScam/Package.json',
      },
    };

    await expect(handlePrReviewCommentCreated(samplePayload)).resolves.toBeUndefined();
  });

  test('should handle comments with supported commands', async () => {
    const samplePayload = {
      ...prreviewcommentCreatedPayload,
      comment: {
        ...prreviewcommentCreatedPayload.comment,
        body: '/discard',
      },
    };

    const publish = jest.fn().mockImplementation((params: any, callback: Function) => callback());
    AWS.SNS.mockImplementation(() => ({ publish }));

    const update = jest.fn();
    Octokit.mockImplementation(() => ({
      authenticate: jest.fn(),
      pullRequests: { update },
    }));

    generateGitHubToken.mockReturnValue('token');
    fetchTokenForInstallation.mockResolvedValue('token');

    await expect(handlePrReviewCommentCreated(samplePayload)).resolves.toMatchObject({
      commands: ['discard'],
      packageToDiscard: 'react',
    });
    expect(publish).toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
  });
});

describe('webhooks should ignore other events', () => {
  // Sample webhook payloads for use in tests
  const samplePayloads = [issuecommentCreatedPrPayload, prreviewcommentCreatedPayload];

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
  testWebhookIdentification([1], handlePrReviewCommentCreated);
});
