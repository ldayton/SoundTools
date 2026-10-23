// SPDX-License-Identifier: GPL-3.0-or-later
// Bounded, chronological decisions over raw pitch observations. No replacement pitches.
(function(scope){
 class PitchContour {
  constructor({speechGate=false,confirmationMs=0,confidence=.45,ceiling=1200,breakUnconfirmedJumps=false}={}){
   if(typeof breakUnconfirmedJumps!=='boolean'||typeof speechGate!=='boolean'||![0,30,50].includes(confirmationMs)||!Number.isFinite(confidence)||confidence<0||confidence>1||!Number.isFinite(ceiling)||ceiling<=50)throw Error('Invalid pitch contour settings');
   this.breakUnconfirmedJumps=breakUnconfirmedJumps;this.previous=null;this.recent=[];this.speechGate=speechGate;this.delay=confirmationMs/1000;this.confidence=confidence;this.ceiling=ceiling;this.pending=[];this.history=[];this.last=-Infinity;
  }
  eligible(r){return Number.isFinite(r.pitch)&&r.pitch>=50&&r.pitch<this.ceiling&&Number.isFinite(r.strength)&&r.strength>=this.confidence}
  push(rows){
   // Validate the entire batch first: a rejected batch must not partially mutate state.
   let last=this.last;for(const r of rows){if(!Number.isFinite(r.time)||r.time<=last)throw Error('Unsorted pitch observations');last=r.time;}
   this.last=last;this.pending.push(...rows.map(r=>this.speechGate&&r.speech===false?{...r,pitch:0,strength:0}:{...r}));const out=[];
   while(this.pending.length&&(this.delay===0||this.last-this.pending[0].time>=this.delay-1e-8)){
    const r=this.pending.shift();this.history=this.history.filter(p=>r.time-p.time<=.5+1e-8);
    const sorted=this.history.map(p=>p.pitch).sort((a,b)=>a-b),reference=sorted[Math.floor(sorted.length/2)];
    let reject=false;
    if(this.delay&&this.eligible(r)&&this.history.length>=3&&1200*Math.log2(r.pitch/reference)>=1800){
     const count=Math.round(this.delay/.01),next=[r,...this.pending.slice(0,count)];
     const confirmed=next.length===count+1&&next.every((p,k)=>this.eligible(p)&&(!k||Math.abs(p.time-next[k-1].time-.01)<1e-6)&&Math.abs(1200*Math.log2(p.pitch/r.pitch))<=600);
     if(confirmed)this.history=[];else reject=true;
    }
    if(reject)out.push({...r,pitch:0,strength:0});
    else {
     if(this.breakUnconfirmedJumps&&this.eligible(r)&&this.previous){
      const jump=Math.abs(1200*Math.log2(r.pitch/this.previous.pitch));
      const count=Math.round(this.delay/.01),next=[r,...this.pending.slice(0,count)];
      // A line across an octave needs stable measurements on both sides. This
      // uses the existing confirmation buffer and never changes accepted pitch.
      const past=this.recent.slice(-count-1);
      const supported=this.delay>0&&past.length===count+1&&past.every((p,k)=>this.eligible(p)&&Math.abs(r.time-p.time-(count+1-k)*.01)<1e-6&&Math.abs(1200*Math.log2(p.pitch/this.previous.pitch))<=600)&&next.length===count+1&&next.every((p,k)=>this.eligible(p)&&(!k||Math.abs(p.time-next[k-1].time-.01)<1e-6)&&Math.abs(1200*Math.log2(p.pitch/r.pitch))<=600);
      if(supported)r.supportedTransitions=[{from:this.previous.pitch,to:r.pitch}];
      r.pitchSupported=supported&&past.every(p=>Math.abs(1200*Math.log2(p.pitch/r.pitch))<=600);
      if(jump>=1200-1e-8&&r.time-this.previous.time<=.2+1e-8&&!supported)r.breakBefore=true;
     }
     if(this.breakUnconfirmedJumps&&this.eligible(r)&&r.pitchSupported===undefined)r.pitchSupported=false;
     out.push(r);if(this.eligible(r))this.history.push(r);
    }
    if(!reject&&this.eligible(r))this.previous=r;
    if(this.breakUnconfirmedJumps){this.recent.push(out.at(-1));if(this.recent.length>6)this.recent.shift();}
   }
   return out;
  }
 }
 // Evidence is scoped to activation epochs, so late loading/re-enabling cannot rewrite old decisions.
 class NeuralEvidence {
  constructor(){this.frames=[];this.ranges=[];this.sequence=0;this.last=-Infinity}
  record(reply,start){
   if(!Number.isFinite(start)||start<this.last-1e-8)throw Error('Unsorted neural evidence');this.last=start;let range=this.ranges.at(-1);
   if(reply.neuralActive){if(!range||range.end!==Infinity){range={id:++this.sequence,start,end:Infinity};this.ranges.push(range)}for(const f of reply.neuralDecisions||[])this.frames.push({...f,epoch:range.id});}
   else if(range?.end===Infinity)range.end=start;
   this.frames=this.frames.filter(f=>f.end>=start-33);this.ranges=this.ranges.filter(r=>r.end>=start-33);
  }
  allows(time){const range=this.ranges.find(r=>time>=r.start&&time<r.end);return !range||this.frames.some(f=>f.epoch===range.id&&f.end>=time-.1&&f.start<=time+.03&&f.speech)}
 }
 const api={PitchContour,NeuralEvidence};
 if(typeof module==='object'&&module.exports)module.exports=api;else {scope.PitchContour=PitchContour;scope.NeuralEvidence=NeuralEvidence;}
})(typeof self==='object'?self:globalThis);
