// SPDX-License-Identifier: GPL-3.0-or-later
(function(){
 const release=document.querySelector('meta[name="soundglow-release"]')?.content||'local-source';
 const dsn=window.SoundglowDiagnosticsConfig?.dsn||document.querySelector('meta[name="soundglow-sentry-dsn"]')?.content||'';
 const environment=document.querySelector('meta[name="soundglow-diagnostics-environment"]')?.content||'development';
 const client=BrowserDiagnostics.create({app:'soundglow',release,dsn,environment,enabled:environment==='production',sdkUrl:document.getElementById('diagnosticsCore').dataset.reporter,
  fields:{preset:['soundglow','praat','voice','custom'],method:['raw','filtered','corroborated'],confirmationMs:'number',state:['MIC OFF','STOPPED','CONNECTING','LIVE','INTERRUPTED','LOADING','EXAMPLE','PAUSED'],analysisRate:'number',windowMs:'number',workerMs:'number',pendingMs:'number'},
  snapshot(){const host=window.soundglowSession,s=host?.state(),feature=host?.featureState?.();return {view:feature?.active,source:document.getElementById('device').textContent.startsWith('TEST INPUT')?'speech':'mic',running:s?.running,paused:s?.paused,sampleRate:s?.sampleRate,audioState:s?.audioState,state:document.getElementById('state').textContent,analysisRate:Number(document.getElementById('analysisRate').value),windowMs:Number(document.getElementById('window').value)*1000,method:feature?.pitch?.method,confirmationMs:feature?.pitch?.confirmationMs,preset:['Soundglow','Praat','Voice Tools'].includes(document.getElementById('resolution').textContent)?document.getElementById('resolution').textContent.toLowerCase().replace('voice tools','voice'):'custom'}}
 });
 window.SoundglowDiagnostics=client;
 BrowserDiagnostics.attachPanel(client,document.getElementById('developerSettings'));
 for(const id of ['start','begin','freeze','demo','restart','settings','openSettings','collapseSettings','spectrogramTab','pitchTab'])document.getElementById(id)?.addEventListener('click',()=>client.event('control.'+id.toLowerCase()));
 document.getElementById('pitchPreset')?.addEventListener('change',()=>client.event('pitch.preset'));
 document.getElementById('pitchSettings')?.addEventListener('change',()=>client.event('pitch.settings_changed'));
 document.getElementById('presetSettings')?.addEventListener('change',()=>client.event('spectrogram.settings_changed'));
})();
