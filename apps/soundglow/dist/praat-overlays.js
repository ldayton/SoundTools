// SPDX-License-Identifier: GPL-3.0-or-later
// Conservative display gating, not a replacement for Praat's measurements.
(function(scope){
 function formants(row){return row.formants.map((frequency,i)=>frequency>=90&&frequency<7500&&row.bandwidths[i]>0&&row.bandwidths[i]<Math.min(700,frequency*.45)?frequency:0)}
 function connected(a,b){return a&&b&&b.time-a.time>0&&b.time-a.time<=.025&&Math.abs(Math.log2(b.value/a.value))<.22}
 const api={formants,connected};if(typeof module==='object'&&module.exports)module.exports=api;else scope.PraatOverlays=api;
})(typeof self==='object'?self:globalThis);
