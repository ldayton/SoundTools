// Developer alias and CI use the same case registry and resource scheduler.
import { runBrowserSuites } from '../../../scripts/ci/browser-suites.cjs';
const result = await runBrowserSuites((process.env.TEST_BROWSERS || 'chromium,firefox,webkit').split(','));
if (!result.passed) process.exitCode = 1;
