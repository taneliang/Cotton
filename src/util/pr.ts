import * as pug from 'pug';
import { getMetadata, setMetadata } from './metadata';
import { RepoDiff } from '../upgrade';

export const PR_TITLE = 'Upgrade all dependencies';

const UPGRADE_SUMMARY_METADATA_KEY = 'upgradeSummary';

const prHumanDescFunction = pug.compileFile('src/views/prHumanDesc.pug');

// Create human readable body
export function prHumanReadableBody(upgradeSummary: RepoDiff) {
  return prHumanDescFunction({ upgradeSummary });
}

// Create human readable body + metadata string
export function prBody(upgradeSummary: RepoDiff) {
  const humanString = prHumanDescFunction({ upgradeSummary });
  return setPrMetadata(humanString, upgradeSummary);
}

export function getPrMetadata(prBodyString: string) {
  return { upgradeSummary: getMetadata(prBodyString, UPGRADE_SUMMARY_METADATA_KEY) };
}

// Set PR metadata on a PR body
export function setPrMetadata(prBodyString: string, upgradeSummary: RepoDiff) {
  return setMetadata(prBodyString, UPGRADE_SUMMARY_METADATA_KEY, upgradeSummary);
}
