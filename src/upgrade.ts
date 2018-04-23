import { join } from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as _ from 'lodash';
import { diff } from 'deep-diff';
import * as ncu from 'npm-check-updates';
import { readFileAsync, writeFileAsync } from './util/files';

type PackageJson = {
  name: string;
  version: string;
  dependencies?: Dependencies;
  devDependencies?: Dependencies;
  peerDependencies?: Dependencies;
  optionalDependencies?: Dependencies;
};

type Dependencies = { readonly [index: string]: string };

export type DependencyDiff = { [index: string]: { original: string; upgraded: string } };
export type PackageDiff = {
  dependencies?: DependencyDiff;
  devDependencies?: DependencyDiff;
  peerDependencies?: DependencyDiff;
  optionalDependencies?: DependencyDiff;
  ignored?: string[];
};
export type RepoDiff = { [repoRoot: string]: PackageDiff };

export const execAsync = promisify(exec);

// Add node_modules/yarn/bin to PATH so that we can execute yarn.
// Not adding node_modules/.bin as the yarn script tries to load ../lib/cli,
// which cannot be found in node_modules/.bin.
process.env['PATH'] =
  process.env['PATH'] + ':' + process.env['LAMBDA_TASK_ROOT'] + '/node_modules/yarn/bin/';

// Diff dependencies in 2 packages
export function diffDependencies(oldPackage: PackageJson, newPackage: PackageJson): PackageDiff {
  const dependencyKeys = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ];

  // Generate diffs for each dependencyKey
  const diffsForDepTypes: DependencyDiff[] = _.map(dependencyKeys, (key: string) => {
    const diffArray = diff(oldPackage[key] || {}, newPackage[key] || {}) || [];
    const transformedDiff = diffArray.map((diff) => ({
      // Assume diff is an edit, and that path only has 1 element (dep name).
      [diff.path[0]]: {
        original: diff.lhs,
        upgraded: diff.rhs,
      },
    }));
    // Merge array of per-package diffs
    return _.assign({}, ...transformedDiff);
  });

  const allDiffs = _.zipObject(dependencyKeys, diffsForDepTypes);
  // Remove keys with undefined values
  return _.pickBy(allDiffs, _.negate(_.isEmpty)) as PackageDiff;
}

// Upgrade project at rootDir (which must contain a package.json and yarn.lock).
// If packages were updated, returns an upgrade diff object, else returns null.
// TODO: Accept an array of packages to ignore
export async function upgradeProject(rootDir: string) {
  const packageJsonPath = join(rootDir, 'package.json');
  const readPackageJson = async () => {
    const packageJson = await readFileAsync(packageJsonPath, 'utf-8');
    return JSON.parse(packageJson) as PackageJson;
  };

  // Read package.json
  const oldPackage = await readPackageJson();

  // TODO: Manually undo previous package upgrade. May not be necessary if
  // we're always upgrading from the package on master.

  // Upgrade packages
  // TODO: Ensure that custom packages are ignored
  // TODO: Set rejected (ignored) packages
  const upgradedPackage = await ncu.run({
    packageFile: packageJsonPath,
    silent: true,
    jsonAll: true,
    upgradeAll: true,
  });

  // Calculate diff
  const upgradeDiff = diffDependencies(oldPackage, upgradedPackage);

  // Abort if nothing was upgraded
  if (_.isEmpty(upgradeDiff)) return null;

  // Save new package.json
  // TODO: Preserve formatting (only replace necessary bits? Prettier?)
  await writeFileAsync(packageJsonPath, JSON.stringify(upgradedPackage, null, 2) + '\n', 'utf-8');

  // Run yarn to update yarn.lock
  await execAsync('yarn install --ignore-scripts', { cwd: rootDir });

  // TODO: Add ignored packages to upgradeDiff

  // Return diff
  return upgradeDiff;
}
