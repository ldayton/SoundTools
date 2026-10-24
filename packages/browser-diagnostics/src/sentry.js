import {init,makeBrowserOfflineTransport,makeFetchTransport,captureEvent,close} from '@sentry/browser';
export function create({app,release,dsn,dbName,enabled}){
 const gated=options=>{const transport=makeFetchTransport(options);return {...transport,send(envelope){const event=envelope[1]?.[0]?.[1];if(!enabled()||(event?.timestamp&&Date.now()/1000-event.timestamp>86400))return Promise.resolve({statusCode:200});return transport.send(envelope)}}};
 init({dsn,release:app+'@'+release,environment:'production',defaultIntegrations:false,autoSessionTracking:false,maxBreadcrumbs:0,normalizeDepth:8,normalizeMaxBreadth:200,
  dataCollection:{userInfo:false,cookies:false,httpHeaders:false,httpBodies:[],urlQueryParams:false},
  transport:makeBrowserOfflineTransport(gated),transportOptions:{dbName,maxQueueSize:30,flushAtStartup:true,shouldStore:()=>enabled()},
  beforeSend:event=>enabled()?{event_id:event.event_id,timestamp:event.timestamp,platform:'javascript',release:app+'@'+release,environment:'production',level:event.level,fingerprint:event.fingerprint,message:event.message,exception:event.exception,tags:{app},contexts:event.contexts}:null
 });
 return {
  capture(error,report){if(!enabled())return;captureEvent({level:'error',exception:{values:[{type:error.name,value:error.code,stacktrace:{frames:error.frames.slice().reverse().map(frame=>({...frame,in_app:true}))}}]},contexts:{diagnostics:report},fingerprint:[app,error.code,error.name,error.frames[0]?.filename||'',String(error.frames[0]?.lineno||0)]})},
  summary(report){if(enabled())captureEvent({level:'info',message:'diagnostics.health_summary',contexts:{diagnostics:report}})},
  async close(){await close(0)}
 };
}
