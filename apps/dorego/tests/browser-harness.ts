export { launchBrowser as launchTestBrowser } from '../../../scripts/ci/browser-harness.cjs';
import { browserName as selectedBrowser } from '../../../scripts/ci/browser-harness.cjs';
export const browserName = selectedBrowser();
