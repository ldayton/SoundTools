// SPDX-License-Identifier: GPL-3.0-or-later
// Mirrors Spectrogram_paintInside: reference PSD, pre-emphasis, no compression.
(function(scope){
 function powerDb(power,frequency){return 10*Math.log10(power/4e-10+1e-308)+6*Math.log2(Math.max(0,frequency)/1000+1e-308)}
 function intensity(db,maximum,range=70,gain=0){return Math.max(0,Math.min(1,(db+gain-maximum+range)/range))}
 const api={powerDb,intensity};if(typeof module==='object'&&module.exports)module.exports=api;else scope.PraatDisplay=api;
})(typeof self==='object'?self:globalThis);
