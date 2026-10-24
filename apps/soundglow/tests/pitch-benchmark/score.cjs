// Interchange adapter: predictions can come from any algorithm; no engine dependency.
const fs=require('node:fs'),{score}=require('./metrics.cjs');
const [refFile,predFile,contractFile]=process.argv.slice(2);
if(!contractFile)throw Error('Usage: score.cjs reference.json predictions.json timing-contract.json');
const contract=JSON.parse(fs.readFileSync(contractFile));if(contract.verified!==true)throw Error('Unverified reference timing');
const prediction=JSON.parse(fs.readFileSync(predFile));console.log(JSON.stringify(score(JSON.parse(fs.readFileSync(refFile)),prediction.rows||prediction,contract),null,2));
