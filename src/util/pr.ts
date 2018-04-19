import * as pug from 'pug';
import { PackageDiff } from '../handlers/restTrigger';

export const PR_TITLE = 'Upgrade all dependencies';

const prHumanDescFunction = pug.compileFile('src/views/prHumanDesc.pug');

// Create human readable body
export function prHumanReadableBody(upgradeSummary: { [index: string]: PackageDiff }) {
  return prHumanDescFunction({ upgradeSummary });
}

// Create human readable body + metadata string
export function prBody(upgradeSummary: { [index: string]: PackageDiff }) {
  const humanString = prHumanDescFunction({ upgradeSummary });
  // TODO: Generate metadata string
  const metadata = '';
  return humanString + metadata;
}
