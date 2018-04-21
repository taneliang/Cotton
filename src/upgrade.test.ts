import { diffDependencies, upgradeProject } from './upgrade';

jest.mock('child_process');
jest.mock('npm-check-updates');
jest.mock('./util/files');
const { exec } = require('child_process');
const { run } = require('npm-check-updates');
const { readFileAsync, writeFileAsync } = require('./util/files');

const barePkg = { name: 'pkg', version: '0' };

const upgradedDepsAndOptDeps = {
  oldPkg: {
    ...barePkg,
    dependencies: { unchanged1: '0.0.0', upgraded1: '0.0.1' },
    optionalDependencies: { unchanged4: '0.0.0', upgraded4: '0.0.1' },
  },
  newPkg: {
    ...barePkg,
    dependencies: { unchanged1: '0.0.0', upgraded1: '0.0.2' },
    optionalDependencies: { unchanged4: '0.0.0', upgraded4: '0.0.2' },
  },
  diff: {
    dependencies: { upgraded1: { original: '0.0.1', upgraded: '0.0.2' } },
    optionalDependencies: { upgraded4: { original: '0.0.1', upgraded: '0.0.2' } },
  },
};

const upgradedAllDeps = {
  oldPkg: {
    ...barePkg,
    dependencies: { unchanged1: '0.0.0', upgraded1: '0.0.1' },
    devDependencies: { unchanged2: '0.0.0', upgraded2: '0.0.1' },
    peerDependencies: { unchanged3: '0.0.0', upgraded3: '0.0.1' },
    optionalDependencies: { unchanged4: '0.0.0', upgraded4: '0.0.1' },
  },
  newPkg: {
    ...barePkg,
    dependencies: { unchanged1: '0.0.0', upgraded1: '0.0.2' },
    devDependencies: { unchanged2: '0.0.0', upgraded2: '0.0.2' },
    peerDependencies: { unchanged3: '0.0.0', upgraded3: '0.0.2' },
    optionalDependencies: { unchanged4: '0.0.0', upgraded4: '0.0.2' },
  },
  diff: {
    dependencies: { upgraded1: { original: '0.0.1', upgraded: '0.0.2' } },
    devDependencies: { upgraded2: { original: '0.0.1', upgraded: '0.0.2' } },
    peerDependencies: { upgraded3: { original: '0.0.1', upgraded: '0.0.2' } },
    optionalDependencies: { upgraded4: { original: '0.0.1', upgraded: '0.0.2' } },
  },
};

const unchangedPkg = {
  ...barePkg,
  dependencies: { unchanged1: '0.0.0' },
  devDependencies: { unchanged2: '0.0.0' },
  peerDependencies: { unchanged3: '0.0.0' },
  optionalDependencies: { unchanged4: '0.0.0' },
};

describe(diffDependencies, () => {
  test('should return diff', () => {
    const { oldPkg, newPkg, diff } = upgradedAllDeps;
    expect(diffDependencies(oldPkg, newPkg)).toEqual(diff);
  });

  test('should gracefully ignore missing dependency keys', () => {
    const { oldPkg, newPkg, diff } = upgradedDepsAndOptDeps;
    expect(diffDependencies(oldPkg, newPkg)).toEqual(diff);
  });

  test('should return empty object when nothing was upgraded', () => {
    expect(diffDependencies(unchangedPkg, unchangedPkg)).toEqual({});
  });
});

describe(upgradeProject, () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('should write package.json and run yarn if deps were upgraded', async () => {
    // Mock situation
    const { oldPkg, newPkg, diff } = upgradedDepsAndOptDeps;
    readFileAsync.mockResolvedValue(JSON.stringify(oldPkg));
    run.mockResolvedValue(newPkg);

    // Mock functions that should just terminate
    writeFileAsync.mockResolvedValue();
    exec.mockImplementation((cmd, opt, callback) => callback());

    const upgradeResult = await upgradeProject('.');

    expect(upgradeResult).toEqual(diff);
    expect(writeFileAsync).toHaveBeenCalledTimes(1); // Write package.json if there were changes
    expect(exec).toHaveBeenCalledTimes(1); // Run yarn to update yarn.lock
  });

  test('should not write or run yarn if no deps were upgraded', async () => {
    // Mock situation
    // i.e. package.json and ncu-upgraded package have the same deps
    readFileAsync.mockResolvedValue(JSON.stringify(unchangedPkg));
    run.mockResolvedValue(unchangedPkg);

    const upgradeResult = await upgradeProject('.');

    expect(upgradeResult).toBe(null); // Return null if no upgrades to be made
    expect(writeFileAsync).not.toHaveBeenCalled(); // Don't write if there aren't any changes
    expect(exec).not.toHaveBeenCalled(); // Don't run yarn if nothing was upgraded
  });
});
