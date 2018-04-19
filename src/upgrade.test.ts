import { diffDependencies } from './upgrade';

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
