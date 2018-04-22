import { fetchInstallationIds, fetchTokenForInstallation } from './queries';
import * as Octokit from '@octokit/rest';

// Cleanly double cast an octokitMock object to Octokit to appease TypeScript
function mockOctokit(octokitMock: any): Octokit {
  return octokitMock as Octokit;
}

describe('github helpers', () => {
  beforeEach(() => jest.resetAllMocks());
  afterEach(() => jest.resetAllMocks());

  describe(fetchInstallationIds, () => {
    test('should return installation IDs', async () => {
      const apiResult = require('./__mocks__/octokit.apps.getInstallations.valid.json');
      const octokit = mockOctokit({
        apps: {
          getInstallations: jest.fn().mockResolvedValue({ data: apiResult }),
        },
      });
      await expect(fetchInstallationIds(octokit)).resolves.toEqual([1]);
    });
  });

  describe(fetchTokenForInstallation, () => {
    test('should return token', async () => {
      const apiResult = require('./__mocks__/octokit.apps.createInstallationToken.valid.json');
      const octokit = mockOctokit({
        apps: {
          createInstallationToken: jest.fn().mockResolvedValue({ data: apiResult }),
        },
      });
      await expect(fetchTokenForInstallation('1', octokit)).resolves.toEqual(apiResult.token);
    });
  });
});
