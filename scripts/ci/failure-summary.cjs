const fs=require('node:fs'),path=require('node:path');
const {clean}=require('./redact.cjs');
function recordFailure(directory,manifest,event) {
  const task=manifest.tasks.find(task=>task.id===event.id);
  let excerpt='';
  if(task?.privateLogDirectory || /ci-private/.test(event.log||''))excerpt='Private backend log retained locally.';
  else if(event.log && fs.existsSync(event.log)){
    const text=fs.readFileSync(event.log,'utf8').replace(/\u001b\[[\d;]*m/g,'');
    const first=text.search(/AssertionError|ExpectError|TimeoutError|Error:|failed/i);
    excerpt=clean(text.slice(Math.max(0,first-200),Math.max(0,first-200)+6000));
  }
  const report={sha:manifest.sha,id:event.id,command:task?.command,args:task?.args,
    elapsedMs:event.elapsedMs,exitCode:event.exitCode,signal:event.signal,timedOut:event.timedOut,
    locks:task?.locks,log:event.log?path.relative(directory,event.log):undefined,error:clean(event.error||''),excerpt};
  const file=path.join(directory,`failure-${event.id.replace(/[^\w.-]/g,'_')}.json`);
  fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `\n### Failed: ${event.id}\n\nCommand: \`${[task?.command,...task?.args||[]].join(' ')}\`\n\n`+
    '```text\n'+excerpt.replaceAll('```','` ` `')+'\n```\n');
  return report;
}
module.exports={recordFailure};
