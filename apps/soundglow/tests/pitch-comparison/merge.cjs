// Replace invalid captures only after verifying the retry used identical decoded PCM.
const fs=require('node:fs'),path=require('node:path');const root=path.resolve(process.argv[2]||'outputs/pitch-comparison'),retry=path.resolve(process.argv[3]||path.join(root,'retry'));
const load=(p,n)=>JSON.parse(fs.readFileSync(path.join(p,n))),run=load(root,'run.json'),child=load(retry,'run.json'),parent=load(root,'captures.json'),replacement=load(retry,'captures.json');
for(const row of replacement.rows){const a=run.clips.find(c=>c.id===row.id),b=child.clips.find(c=>c.id===row.id);if(!a||a.pcmSha256!==b?.pcmSha256||row.pcmSha256!==a.pcmSha256||row.late)throw Error('Invalid or different retry input');row.sourceRun=path.relative(root,retry);}
if(!fs.existsSync(path.join(root,'original-captures.json')))fs.copyFileSync(path.join(root,'captures.json'),path.join(root,'original-captures.json'));
const map=new Map(parent.rows.map(r=>[r.id,r]));for(const row of replacement.rows){map.set(row.id,row);for(const app of ['voice-tools','soundglow'])fs.copyFileSync(path.join(retry,'live',row.id+'-'+app+'.png'),path.join(root,'live',row.id+'-'+app+'.png'))}
parent.rows=[...map.values()];fs.writeFileSync(path.join(root,'captures.json'),JSON.stringify(parent,null,2));console.log('Merged verified retry captures');
