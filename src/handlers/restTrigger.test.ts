import { findProjectRootDirs } from './restTrigger';

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
        ['package.json', 'one/package.json'],
        ['../yarn.lock', 'two/yarn.lock', 'somewhere/yarn.lock'],
      ),
    ).toEqual([]);
  });
});
