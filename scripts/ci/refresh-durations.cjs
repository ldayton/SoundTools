// Explicitly refresh reviewed estimates from successful, retained runner evidence.
const fs = require('node:fs'), path = require('node:path');
const {key} = require('./duration-plan.cjs');
function refresh(directory, base = require('./durations.json')) {
  const samples = new Map();
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
      const file = path.join(dir,entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name === 'results.json' && fs.existsSync(path.join(dir,'inventory.json'))) {
        const result=JSON.parse(fs.readFileSync(file)), inventory=JSON.parse(fs.readFileSync(path.join(dir,'inventory.json')));
        if (!result.passed || inventory.platform !== 'linux' || !inventory.app || !inventory.browser) continue;
        for (const row of result.results) {
          const task=inventory.tasks.find(task=>task.id===row.id);
          if (!task || row.status!=='success' || !row.elapsedMs || !task.id.includes(':nightly:')) continue;
          const command = path.basename(task.command).startsWith('node') ? 'node' : task.command;
          const id=key(inventory.app,inventory.browser,command,task.args);
          const values=samples.get(id)||[];values.push(row.elapsedMs/1000);samples.set(id,values);
        }
      }
    }
  }
  walk(directory);
  const seconds={...base.seconds};
  for(const [id,values] of samples) seconds[id]=Math.ceil(Math.max(...values));
  return {...base,seconds:Object.fromEntries(Object.entries(seconds).sort(([a],[b])=>a.localeCompare(b)))};
}
module.exports={refresh};
if(require.main===module){
  if(!process.argv[2])throw Error('Provide downloaded successful timing artifact directory');
  fs.writeFileSync(path.join(__dirname,'durations.json'),JSON.stringify(refresh(path.resolve(process.argv[2])),null,2)+'\n');
}
