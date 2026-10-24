// Fixed research candidates. No pitch values are changed or manufactured.
const variants=[{id:'current',on:.3,off:.3,releaseMs:0,historyMs:100},{id:'lower',on:.2,off:.2,releaseMs:0,historyMs:100},{id:'stateful',on:.3,off:.15,releaseMs:96,historyMs:0}];
class DecisionPolicy{
 constructor(spec){this.spec=spec;this.active=false;this.below=null;this.last=-Infinity}
 push(frame){if(!Number.isFinite(frame.probability)||frame.probability<0||frame.probability>1||!Number.isFinite(frame.start)||!Number.isFinite(frame.end)||frame.end<=frame.start||frame.start<this.last-1e-7)throw Error('Invalid policy frame');this.last=frame.end;const p=this.spec;
 if(!p.releaseMs)return {...frame,speech:frame.probability>=p.on};
 if(frame.probability>=p.on){this.active=true;this.below=null}
 else if(this.active&&frame.probability<p.off){if(this.below===null)this.below=frame.start;if(frame.end-this.below>=p.releaseMs/1000-1e-8)this.active=false}
 else if(this.active)this.below=null;
 return {...frame,speech:this.active};
 }
}
module.exports={variants,DecisionPolicy};
