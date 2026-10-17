// SPDX-License-Identifier: GPL-3.0-or-later
(function(scope){
 class PerformanceSession {
  constructor({now=()=>performance.now(),limit=18000}={}){this.now=now;this.limit=limit;this.enabled=false;this.reset()}
  reset(){this.started=this.now();this.metrics={};this.counts={};this.events=[];this.break()}
  break(){this.previous=null;this.readyAt=this.now()+2000}
  add(name,value){if(!this.enabled||!Number.isFinite(value))return;const m=this.metrics[name]||(this.metrics[name]={samples:new Float64Array(this.limit),count:0,max:-Infinity,sum:0});m.samples[m.count%this.limit]=value;m.count++;m.sum+=value;m.max=Math.max(m.max,value)}
  count(name,n=1){if(this.enabled)this.counts[name]=(this.counts[name]||0)+n}
  event(name,details={}){if(!this.enabled)return;this.count(name);const warmup=this.now()<this.readyAt;if(!warmup)this.count(name+'AfterWarmup');this.events.push({name,elapsedMs:this.now()-this.started,warmup,...details});if(this.events.length>256)this.events.shift()}
  frame({time,cost,audioTime,plotted,active}){
   if(!this.enabled)return;
   if(!active){this.break();return}if(this.now()<this.readyAt)return;
   this.add('renderCallbackMs',cost);this.add('plottedAgeMs',(audioTime-plotted)*1000);
   if(this.previous){const gap=time-this.previous.time;this.add('animationIntervalMs',gap);if(gap>100)this.count('animationGapsOver100ms');
    if(plotted>this.previous.plotted+1e-6){this.add('plotAdvanceIntervalMs',time-this.previous.advance);this.previous.advance=time}
    else if(time-this.previous.advance>100&&!this.previous.stalled){this.count('plotStallsOver100ms');this.previous.stalled=true}
    if(plotted>this.previous.plotted+1e-6)this.previous.stalled=false;
    this.previous={...this.previous,time,plotted};
   }else this.previous={time,plotted,advance:time,stalled:false};
  }
  report(metadata={}){const metrics={};for(const [name,m]of Object.entries(this.metrics)){const a=Array.from(m.samples.subarray(0,Math.min(m.count,this.limit))).sort((a,b)=>a-b);metrics[name]={count:m.count,retained:a.length,mean:m.sum/m.count,p50:a[Math.floor((a.length-1)*.5)],p95:a[Math.floor((a.length-1)*.95)],p99:a[Math.floor((a.length-1)*.99)],max:m.max}}
   return {schemaVersion:1,enabled:this.enabled,elapsedMs:this.now()-this.started,currentPlotStallMs:this.previous?Math.max(0,this.now()-this.previous.advance):0,counts:{...this.counts},events:this.events.slice(),metrics,metadata,limitations:['Animation callbacks do not prove screen presentation.','Plotted age uses the audio context clock; microphone hardware and display latency are excluded.','Percentiles use bounded recent samples; counts, mean and maximum cover the full session.']};}
 }
 const api={PerformanceSession};if(typeof module==='object'&&module.exports)module.exports=api;else scope.SoundglowPerformance=api;
})(typeof globalThis==='object'?globalThis:this);
