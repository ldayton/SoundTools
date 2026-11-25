import {checkScoreLayoutComponent} from "../../../packages/music-practice/browser-tests/score-layout";
import {launchBrowser,newPage,captureFailure,closeBrowser} from "../../../scripts/ci/browser-harness.cjs";
const browser=await launchBrowser();
try {
  const page=await newPage(browser,{viewport:{width:1100,height:900}});
  await checkScoreLayoutComponent(page);
  console.log("PASS: shared score layout geometry, transformations, physical scale and unchanged music");
} catch(error) {
  await captureFailure(browser,error);
  throw error;
} finally {
  await closeBrowser(browser);
}
