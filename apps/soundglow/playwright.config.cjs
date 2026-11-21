const {defineConfig}=require('@playwright/test');
const origin='http://127.0.0.1:'+(process.env.SOUNDGLOW_TEST_PORT||8779);
const browser=process.env.SOUNDGLOW_TEST_BROWSER||'chromium';
const group=process.env.SOUNDGLOW_TEST_GROUP||'all';
if(!['all','ui','timing'].includes(group))throw Error('Unknown visual group');
const outputSuffix=group==='all'?'':`-${group}`;
if(!['chromium','firefox','webkit'].includes(browser))throw Error('Choose chromium, firefox or webkit');
module.exports=defineConfig({
 // The serial regression includes throttled retina projects. Leave room for
 // those after the desktop/mobile suites, within CI's 20-minute command limit.
 testDir:'./tests/visual',testMatch:'*.spec.cjs',timeout:60000,globalTimeout:18*60*1000,workers:1,retries:0,
 outputDir:(browser==='chromium'?'test-results/browser':`test-results/browser-${browser}`)+outputSuffix,reporter:[['list'],['html',{outputFolder:(browser==='chromium'?'playwright-report':`test-results/report-${browser}`)+outputSuffix,open:'never'}]],
 snapshotPathTemplate:'{testDir}/baselines/{projectName}/{arg}{ext}',updateSnapshots:'none',
 expect:{toMatchSnapshot:{threshold:.08,maxDiffPixelRatio:.001}},
 use:{browserName:browser,headless:true,baseURL:origin,locale:'en-US',timezoneId:'UTC',colorScheme:'dark',reducedMotion:'reduce',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'desktop',use:{viewport:{width:671,height:867},deviceScaleFactor:1}},{name:'mobile-retina',use:{viewport:{width:390,height:844},deviceScaleFactor:2}},{name:'slow-retina',testMatch:'continuity.spec.cjs',grep:/sidebar and display/,metadata:{cpuSlowdown:4,viewport:{width:844,height:390}},use:{viewport:{width:844,height:390},deviceScaleFactor:2}},{name:'slow-desktop-retina',testMatch:'continuity.spec.cjs',grep:/sidebar and display/,metadata:{cpuSlowdown:4,viewport:{width:1280,height:900}},use:{viewport:{width:1280,height:900},deviceScaleFactor:2}},{name:'wide-retina',testMatch:'realtime.spec.cjs',use:{viewport:{width:1272,height:800},deviceScaleFactor:2}}],
 webServer:{command:'node tests/visual/server.cjs',url:origin+'/tests/visual/generated/harness.html',reuseExistingServer:false,timeout:10000}
});
