import { generateGitHubToken } from './auth';
import * as jwt from 'jsonwebtoken';

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
