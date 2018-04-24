import { upgradeAllInstallations } from './upgradeAllInstallations';
import { APIGatewayEvent, Callback, Context, Handler } from 'aws-lambda';

jest.mock('aws-sdk');
jest.mock('@octokit/rest');
jest.mock('../github/auth');
jest.mock('../github/queries');
const AWS = require('aws-sdk');
const Octokit = require('@octokit/rest');
const { generateGitHubToken } = require('../github/auth');
const { fetchInstallationIds } = require('../github/queries');

async function executeHandler(
  handler: Handler,
  event: APIGatewayEvent | undefined = undefined,
  context: Context | undefined = undefined,
  callback: Callback = jest.fn(),
) {
  // Hacky typecasts, but that's okay because these will only be used in tests
  // and we definitely know what we're doing. We do, right?
  const result = await handler(event || ({} as any), context || ({} as any), callback);
  return { event, context, callback, result };
}

describe(upgradeAllInstallations, () => {
  beforeEach(() => {
    const arn = 'snsarn';
    process.env.upgradeInstallationSnsArn = arn;
  });

  afterEach(() => {
    jest.resetAllMocks();
    delete process.env.upgradeInstallationSnsArn;
  });

  function mockAwsSnsPublish(func: ((any, Function) => void) | undefined = undefined) {
    func = func || ((params: any, callback: Function) => callback());
    const publish = jest.fn().mockImplementation(func);
    AWS.SNS.mockImplementation(() => ({ publish }));
    return publish;
  }

  function mockOctokit(additionalFuncs: any = {}) {
    Octokit.mockImplementation(() => ({ authenticate: jest.fn(), ...additionalFuncs }));
    generateGitHubToken.mockReturnValue('token');
  }

  test('should invoke upgradeInstallation for every installation ID', async () => {
    const publish = mockAwsSnsPublish();
    mockOctokit();

    const mockInstIds = [123, 234, 345];
    fetchInstallationIds.mockResolvedValue(mockInstIds);

    const { callback } = await executeHandler(upgradeAllInstallations);
    expect(callback).toHaveBeenCalled();
    expect(publish).toHaveBeenCalledTimes(mockInstIds.length);
  });

  test('should fail gracefully by calling callback', async () => {
    mockOctokit();
    fetchInstallationIds.mockResolvedValue([123, 234, 345]);

    // Mock an SNS error
    const error1 = new Error('Error 1!');
    mockAwsSnsPublish((params: any, callback: Function) => callback(error1));
    const { callback } = await executeHandler(upgradeAllInstallations);
    expect(callback).toHaveBeenLastCalledWith(error1);

    // Mock an error while fetching installation IDs
    const error2 = new Error('Error 2!');
    fetchInstallationIds.mockRejectedValue(error2);
    const { callback: callback2 } = await executeHandler(upgradeAllInstallations);
    expect(callback2).toHaveBeenLastCalledWith(error2);
  });
});
