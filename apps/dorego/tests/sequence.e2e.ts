import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {verifySequence} from './sequence.browser';
import {launchBrowser,waitForServer,captureFailure,closeBrowser} from '../../../scripts/ci/browser-harness.cjs';
const vite=createRequire(import.meta.url).resolve('vite/package.json').replace(/package\.json$/,'bin/vite.js');
const base='http://127.0.0.1:4339/DoReGo/';
const server=spawn(process.execPath,[vite,'preview','--mode','pages','--outDir','dist-pages','--host','127.0.0.1','--port','4339','--strictPort'],{stdio:'ignore'});
let browser;
try {await waitForServer(base,{server});browser=await launchBrowser();await verifySequence(browser,base);}
catch(error){await captureFailure(browser,error);throw error;}
finally{await closeBrowser(browser);server.kill('SIGTERM');}
