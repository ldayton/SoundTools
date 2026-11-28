const path = require('node:path');
const {spawn} = require('node:child_process');
const variants = [
  {name:'regular',args:['build','--outDir','dist']},
  {name:'pages',args:['build','--mode','pages','--outDir','dist-pages']},
];
function bundle(variant) {
  const vite = require.resolve('vite/package.json').replace(/package.json$/, 'bin/vite.js');
  return new Promise((resolve,reject)=>{
    const child = spawn(process.execPath,[vite,...variant.args],{cwd:path.resolve(__dirname,'../../apps/dorego'),stdio:'inherit'});
    child.once('error',reject);
    child.once('close',(code,signal)=>code===0?resolve():reject(Error(`DoReGo ${variant.name} bundle failed: ${signal || code}`)));
  });
}
async function buildBundles(run = bundle) {
  // Both variants read prepared inputs and write disjoint output directories.
  // Settle both children before returning, including when one fails.
  const results = await Promise.allSettled(variants.map(variant=>run(variant)));
  const errors = results.filter(result=>result.status==='rejected').map(result=>result.reason);
  if(errors.length)throw new AggregateError(errors,'DoReGo bundle generation failed');
}
module.exports={buildBundles,variants};
if(require.main===module)buildBundles().catch(error=>{console.error(error);process.exitCode=1;});
