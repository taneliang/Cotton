import { findProjectRootDirs, getFilePaths } from './files';

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
