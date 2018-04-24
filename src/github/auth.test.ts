import { generateGitHubToken, signRequestBody, verifyWebhookEvent } from './auth';
import { APIGatewayEvent } from 'aws-lambda';
import * as jwt from 'jsonwebtoken';
import * as _ from 'lodash';

jest.mock('fs');
const { readFileSync } = require('fs');

const mockPublicKey = `-----BEGIN PUBLIC KEY-----
MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAIR7xbGOHtkjr1B0hc9ZxglnHKbMfySC
ccOjOOxiF7xznmmbYY1N5SKnSkwX7zKv+JR3Gk9wbFB7xujvpP3NSq0CAwEAAQ==
-----END PUBLIC KEY-----
`;

const mockPrivateKey = `
-----BEGIN RSA PRIVATE KEY-----
MIIBOgIBAAJBAIR7xbGOHtkjr1B0hc9ZxglnHKbMfySCccOjOOxiF7xznmmbYY1N
5SKnSkwX7zKv+JR3Gk9wbFB7xujvpP3NSq0CAwEAAQJAXtIfipdHqO4LejAL3X5J
aU1tikxu63iZaAaYpUcH6g5l3zBW6GwBNGrtmv/8XrCOmDoNOBpcjpklNUE0wTZW
mQIhAMflk8vTwAoSKpvaVVfPZM5FdMjKCfiLOpJL5Cu3wRDbAiEAqaqaifyPH7su
nS/8YZT5xc5KYp/wHT/b0B+oJKIJhRcCIQCrBKHmnznMI/CqOCgNoRSoWMnqQtg2
+L7ajO0f7ezSQwIgb5Uoz4kPI8I51NzDMfYFEocqOpSPGN1vlf/L2FPMyP8CIGiE
yNvg2ztwi3BKf6ufRqi0Ma8bL3Sy5jls/f472mzI
-----END RSA PRIVATE KEY-----
`;

describe(generateGitHubToken, () => {
  test('should meet GitHub specs', () => {
    readFileSync.mockReturnValue(mockPrivateKey);
    const token = generateGitHubToken();
    readFileSync.mockReset();

    // Expect token to be signed correctly
    expect(() => jwt.verify(token, mockPublicKey)).not.toThrow();

    // Expect token to be signed with the RS256 algorithm.
    // GitHub requirement.
    const decoded = jwt.decode(token, { complete: true });
    expect(decoded).toMatchObject({ header: { alg: 'RS256' } });
  });
});

describe(signRequestBody, () => {
  test('should return null if body does not exist', () => {
    expect(signRequestBody('key', null)).toBe(null);
  });

  test('should return signed body', () => {
    expect(signRequestBody('key', 'body')).toMatchSnapshot();
  });
});

describe(verifyWebhookEvent, () => {
  beforeEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = '';
  });

  afterEach(() => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
  });

  const validEvent: APIGatewayEvent = {
    body: '',
    headers: {
      'X-Hub-Signature': 'sig',
      'X-GitHub-Event': 'event',
      'X-GitHub-Delivery': 'delivery',
    },
  } as any;

  function expectValidError(event: APIGatewayEvent) {
    const error = verifyWebhookEvent(event);
    expect(error).toBeDefined();
    expect(Object.keys(error || {})).toEqual(['statusCode', 'body']);
  }

  test('should return error when webhook secret is not set', () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    expectValidError(validEvent);
  });

  function testMissingHeader(header: string) {
    test(`should return error when ${header} header is not set`, () => {
      const event = _.cloneDeep(validEvent);
      delete event.headers[header];
      expectValidError(event);
    });
  }

  testMissingHeader('X-Hub-Signature');
  testMissingHeader('X-GitHub-Event');
  testMissingHeader('X-GitHub-Delivery');

  test('should return error when signature is invalid', () => {
    // Signature set doesn't match signature calculated by signRequestBody
    expectValidError(validEvent);
  });

  test.skip('should return null when webhook event is valid', () => {
    // TODO: Mock signRequestBody somehow to get past that last signature check
    expect(verifyWebhookEvent(validEvent)).toBe(null);
  });
});
