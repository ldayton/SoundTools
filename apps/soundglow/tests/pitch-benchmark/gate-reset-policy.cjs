// Research only. Reset decisions precede inference and use only earlier model scores.
class QuietReset {
 constructor(){this.quietSamples=0;this.resets=0}
 before(){if(this.quietSamples>=16384){this.quietSamples=0;this.resets++;return true}return false}
 after(probability){if(!Number.isFinite(probability)||probability<0||probability>1)throw Error('Invalid probability');this.quietSamples=probability<.2?this.quietSamples+512:0}
}
const variants=[{id:'continuous',on:.2,historyMs:100},{id:'quiet-reset',on:.2,historyMs:100}];
module.exports={QuietReset,variants};
