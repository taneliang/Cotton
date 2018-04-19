import * as pug from 'pug';
import { getMetadata, setMetadata } from './metadata';
import { PackageDiff } from '../upgrade';

export const PR_TITLE = 'Upgrade all dependencies';

const UPGRADE_SUMMARY_METADATA_KEY = 'upgradeSummary';

const prHumanDescFunction = pug.compileFile('src/views/prHumanDesc.pug');

// Create human readable body
export function prHumanReadableBody(upgradeSummary: { [index: string]: PackageDiff }) {
  return prHumanDescFunction({ upgradeSummary });
}

// Create human readable body + metadata string
export function prBody(upgradeSummary: { [index: string]: PackageDiff }) {
  const humanString = prHumanDescFunction({ upgradeSummary });
  return setMetadata(humanString, UPGRADE_SUMMARY_METADATA_KEY, upgradeSummary);
}

export function getPrMetadata(prBodyString: string) {
  return { upgradeSummary: getMetadata(prBodyString, UPGRADE_SUMMARY_METADATA_KEY) };
}
