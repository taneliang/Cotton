import { prHumanReadableBody, prBody, getPrMetadata, setPrMetadata } from './pr';
import { getMetadata } from './metadata';

// Mock package upgrade objects
const upgradedOne = { one: { original: '0.1.0', upgraded: '0.1.1' } };
const upgradedTwo = { two: { original: '1.1.0', upgraded: '2.1.1' } };

const upgradeSummary = {
  'proj/1': {
    dependencies: { ...upgradedOne, ...upgradedTwo },
    peerDependencies: { ...upgradedTwo },
    ignored: ['hydrogen', 'helium'],
  },
};

describe(prHumanReadableBody, () => {
  test('should include all relevant information', () => {
    const body = prHumanReadableBody(upgradeSummary);

    expect(body).toContain('proj/1'); // Include project name
    expect(body).toContain('dependencies'); // Include dep type
    expect(body).toContain('peerDependencies');
    expect(body).not.toContain('devDependencies'); // Leave out dep types that weren't updated
    expect(body).toContain('one'); // Include package name
    expect(body).toContain('two');
    expect(body).toContain('0.1.0'); // Include package versions
    expect(body).toContain('0.1.1');
    expect(body).toContain('hydrogen'); // Include ignored packages
    expect(body).toContain('helium');
  });
});

describe(prBody, () => {
  test('should include human readable body', () => {
    const body = prBody(upgradeSummary);
    const humanReadableBody = prHumanReadableBody(upgradeSummary);
    expect(body).toContain(humanReadableBody);
  });

  test('should contain metadata', () => {
    const body = prBody(upgradeSummary);
    const metadata = setPrMetadata('', upgradeSummary);
    expect(body).toContain(metadata);
  });
});

describe(getPrMetadata, () => {
  test('should return upgrade summary', () => {
    const body = prBody(upgradeSummary);
    const metadata = getPrMetadata(body);
    expect(metadata).toEqual({
      upgradeSummary,
    });
  });
});

describe(setPrMetadata, () => {
  test('should contain metadata', () => {
    const metadata = setPrMetadata('', upgradeSummary);
    expect(metadata).toContain('cottonmetadata');
    expect(getMetadata(metadata, 'upgradeSummary')).toEqual(upgradeSummary);
  });
});
