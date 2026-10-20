function speechAt(flags,row){
 if(!Number.isFinite(row.time)||!Number.isFinite(row.availableAt))throw Error('Missing emission clock');
 return flags.some(f=>f.speech&&f.time>=row.time-.1&&f.time<=row.time+.03&&f.time+.005<=row.availableAt+1e-8);
}
module.exports={speechAt};
