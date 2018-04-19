import { dirname, join } from 'path';
import { readFile, writeFile } from 'fs';
import { promisify } from 'util';
import * as mkdirp from 'mkdirp';
import * as _ from 'lodash';
import 'lodash.product'; // For _.product

import * as bluebird from 'bluebird';

export type PathPair = {
  repoPath: string;
  localPath: string;
};

// Using 2 different versions of promisify to get around compile
// error: TS2554: Expected X arguments, but got Y.
export const mkdirpAsync = bluebird.promisify(mkdirp);
export const readFileAsync = promisify(readFile);
export const writeFileAsync = promisify(writeFile);

// Return directories where both package.json and yarn.lock are present
export function findProjectRootDirs(packageJsonPaths: string[], yarnLockPaths: string[]): string[] {
  // Get dir paths without filenames
  const packageJsonDirs = packageJsonPaths.map(dirname);
  const yarnLockDirs = yarnLockPaths.map(dirname);

  // Filter out package.json dirs that don't have a corresponding yarn.lock dir
  return _.intersection(packageJsonDirs, yarnLockDirs);
}

// Compute paths to all files in all project directories
export function getFilePaths(projectDirs: PathPair[], filenames: string[]): PathPair[] {
  return (_ as any)
    .product(projectDirs, filenames) // Get cartesian product of dirs and file names
    .map(([dirPath, file]: [PathPair, string]) => ({
      // Join filenames to dirs
      repoPath: join(dirPath.repoPath, file),
      localPath: join(dirPath.localPath, file),
    }));
}
