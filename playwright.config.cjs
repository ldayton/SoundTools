const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
 testDir:'./tests/visual',testMatch:'*.spec.cjs',timeout:60000,workers:1,retries:0,
 outputDir:'test-results/browser',reporter:[['list'],['html',{outputFolder:'playwright-report',open:'never'}]],
 snapshotPathTemplate:'{testDir}/baselines/{projectName}/{arg}{ext}',updateSnapshots:'none',
 expect:{toMatchSnapshot:{threshold:.08,maxDiffPixelRatio:.001}},
 use:{browserName:'chromium',headless:true,baseURL:'http://127.0.0.1:8779',locale:'en-US',timezoneId:'UTC',colorScheme:'dark',reducedMotion:'reduce',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'desktop',use:{viewport:{width:671,height:867},deviceScaleFactor:1}},{name:'mobile-retina',use:{viewport:{width:390,height:844},deviceScaleFactor:2}}],
 webServer:{command:'node tests/visual/server.cjs',url:'http://127.0.0.1:8779/tests/visual/generated/harness.html',reuseExistingServer:false,timeout:10000}
});
