// Research-only fixed-lag candidate decoder. Never invents/interpolates a frequency.
class CandidateTracker {
 constructor({lookaheadMs=50,jumpCost=.35,highCost=0,softTop=400}={}){
  if(!Number.isFinite(lookaheadMs)||lookaheadMs<0||lookaheadMs>200||![jumpCost,highCost].every(x=>Number.isFinite(x)&&x>=0)||!Number.isFinite(softTop)||softTop<50)throw Error('Invalid tracker settings');
  Object.assign(this,{delay:lookaheadMs/1000,jumpCost,highCost,softTop});this.pending=[];this.lastTime=-Infinity;this.anchor=null;
 }
 choices(r){const voiced=r.speech===false?[]:r.candidates.filter(c=>c.frequency>=50&&c.frequency<1200&&c.strength>=.45).map(c=>({hz:c.frequency,strength:c.strength}));return [{hz:0,strength:0},...voiced]}
 emission(c,r){return c.hz?c.strength-.01*Math.log2(1200/c.hz)-this.highCost*Math.max(0,Math.log2(c.hz/this.softTop)):.45+Math.max(0,2-r.relativeIntensity/(.03/1.45))}
 transition(a,b){if(!a.hz&&!b.hz)return 0;if(!a.hz||!b.hz)return .14;return this.jumpCost*Math.abs(Math.log2(a.hz/b.hz))}
 decide(){let prior=this.anchor?[{choice:this.anchor,score:0,path:[]}]:null;for(const r of this.pending){const next=[];for(const c of this.choices(r)){let best=-Infinity,path=[];if(prior){for(const p of prior){const v=p.score-this.transition(p.choice,c);if(v>best){best=v;path=p.path;}}}else best=0;next.push({choice:c,score:best+this.emission(c,r),path:[...path,c]});}const max=Math.max(...next.map(n=>n.score));for(const n of next)n.score-=max;prior=next;}return prior.reduce((a,b)=>a.score>=b.score?a:b).path[0]}
 push(rows){let last=this.lastTime;for(const r of rows){if(!Number.isFinite(r.time)||r.time<=last||last!==-Infinity&&Math.abs(r.time-last-.01)>1e-6||!Number.isFinite(r.relativeIntensity)||r.relativeIntensity<0||!Array.isArray(r.candidates)||r.candidates.length>32||r.candidates.some(c=>!Number.isFinite(c.frequency)||c.frequency<0||!Number.isFinite(c.strength)||c.strength<0||c.strength>1.00001))throw Error('Invalid candidate observations');last=r.time;}
 const out=[];for(const r of rows){this.lastTime=r.time;this.pending.push({...r,candidates:r.candidates.map(c=>({...c}))});while(this.pending.length&&this.lastTime-this.pending[0].time>=this.delay-1e-8){const c=this.decide(),r=this.pending.shift();this.anchor=c;out.push({...r,pitch:c.hz,strength:c.strength});}}return out;
 }
}
module.exports={CandidateTracker};
