const fs = require('node:fs'), path = require('node:path');
const {diagnosticArtifact} = require('./evidence.cjs');
function collect(root, app, destination = path.join(root,'work/ci-failures',app)) {
  if (!['songalong','notewise','dorego','soundglow','tagaluya'].includes(app)) throw Error('Unknown app');
  if(fs.existsSync(destination))throw Error('Failure bundle already exists; retain the first bundle');
  fs.mkdirSync(destination,{recursive:true,mode:0o700});
  const sources=['work/browser-results',`apps/${app}/work`, `apps/${app}/test-results`];
  const appRoot=path.join(root,'apps',app);
  for(const name of fs.readdirSync(appRoot).filter(name=>/^playwright-report(?:-|$)/.test(name)))sources.push(`apps/${app}/${name}`);
  const files=[];
  for(const source of sources){
    const directory=path.join(root,source);
    if(!fs.existsSync(directory))continue;
    const report=!source.endsWith('/work');
    fs.cpSync(directory,path.join(destination,source),{recursive:true,filter(candidate){
      if(!diagnosticArtifact(root,candidate)||fs.lstatSync(candidate).isSymbolicLink())return false;
      const relative=path.relative(directory,candidate).split(path.sep).join('/');
      if (/(?:^|\/)(?:account-local(?:-status)?\.json|\.env[^/]*|node_modules|ci-private|ci-vite-cache|offline-release[^/]*|dist[^/]*|assets|models)(?:\/|$)/.test(relative))return false;
      if(fs.statSync(candidate).isDirectory())return true;
      if(!report && !/\.(?:png|jpe?g|webp|svg|json|txt|log|pdf|zip|wav)$/.test(candidate))return false;
      files.push({path:path.relative(root,candidate),bytes:fs.statSync(candidate).size});return true;
    }});
  }
  fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify({app,files,bytes:files.reduce((n,f)=>n+f.bytes,0)},null,2)+'\n');
  return destination;
}
module.exports={collect};
if(require.main===module)console.log(collect(path.resolve(__dirname,'../..'),process.argv[2]));
