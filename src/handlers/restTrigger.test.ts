import { findProjectRootDirs, getFilePaths, diffDependencies } from './restTrigger';

describe(findProjectRootDirs, () => {
  test('should return dirs with both package.json and yarn.lock', () => {
    expect(
      findProjectRootDirs(
        ['package.json', 'sub/package.json', 'two/plus/two/is/four/package.json'],
        ['sub/yarn.lock', 'two/plus/two/is/four/yarn.lock', './yarn.lock'],
      ),
    ).toEqual(['.', 'sub', 'two/plus/two/is/four']);
  });

  test('should not return dirs with only one file', () => {
    expect(
      findProjectRootDirs(
        ['package.json', 'one/package.json', 'two/package.json/scam'],
        ['../yarn.lock', 'two/yarn.lock', 'somewhere/yarn.lock'],
      ),
    ).toEqual([]);
  });
});

describe(getFilePaths, () => {
  test('should return cartesian product of dirs and files', () => {
    const rawDirs = ['', '../', 'dirp', '/dirp/'];
    const pairDirs = rawDirs.map((dir: string) => ({ repoPath: dir, localPath: dir }));
    const files = ['', '/fonts.jpg', 'deep/ocean.txt', '../above.jpg'];
    const paths = getFilePaths(pairDirs, files);
    expect(paths).toMatchSnapshot();
  });
});

describe(diffDependencies, () => {
  test('should return diff', () => {
    const pkgOne = {
      name: 'pkg',
      version: '0',
      dependencies: { unchanged1: '0.0.0', upgraded1: '0.0.1' },
      devDependencies: { unchanged2: '0.0.0', upgraded2: '0.0.1' },
      peerDependencies: { unchanged3: '0.0.0', upgraded3: '0.0.1' },
      optionalDependencies: { unchanged4: '0.0.0', upgraded4: '0.0.1' },
    };

    const pkgTwo = {
      name: 'pkg',
      version: '0',
      dependencies: { unchanged1: '0.0.0', upgraded1: '0.0.2' },
      devDependencies: { unchanged2: '0.0.0', upgraded2: '0.0.2' },
      peerDependencies: { unchanged3: '0.0.0', upgraded3: '0.0.2' },
      optionalDependencies: { unchanged4: '0.0.0', upgraded4: '0.0.2' },
    };

    const expected = {
      dependencies: { upgraded1: { original: '0.0.1', upgraded: '0.0.2' } },
      devDependencies: { upgraded2: { original: '0.0.1', upgraded: '0.0.2' } },
      peerDependencies: { upgraded3: { original: '0.0.1', upgraded: '0.0.2' } },
      optionalDependencies: { upgraded4: { original: '0.0.1', upgraded: '0.0.2' } },
    };

    expect(diffDependencies(pkgOne, pkgTwo)).toEqual(expected);
  });

  test('should gracefully ignore missing dependency keys', () => {
    const pkgOne = {
      name: 'pkg',
      version: '0',
      dependencies: { unchanged1: '0.0.0', upgraded1: '0.0.1' },
      optionalDependencies: { unchanged4: '0.0.0', upgraded4: '0.0.1' },
    };

    const pkgTwo = {
      name: 'pkg',
      version: '0',
      dependencies: { unchanged1: '0.0.0', upgraded1: '0.0.2' },
      optionalDependencies: { unchanged4: '0.0.0', upgraded4: '0.0.2' },
    };

    const expected = {
      dependencies: { upgraded1: { original: '0.0.1', upgraded: '0.0.2' } },
      optionalDependencies: { upgraded4: { original: '0.0.1', upgraded: '0.0.2' } },
    };

    expect(diffDependencies(pkgOne, pkgTwo)).toEqual(expected);
  });

  test('should return empty object when nothing was upgraded', () => {
    const pkgOne = {
      name: 'pkg',
      version: '0',
      dependencies: { unchanged1: '0.0.0' },
      devDependencies: { unchanged2: '0.0.0' },
      peerDependencies: { unchanged3: '0.0.0' },
      optionalDependencies: { unchanged4: '0.0.0' },
    };
    expect(diffDependencies(pkgOne, pkgOne)).toEqual({});
  });
});
