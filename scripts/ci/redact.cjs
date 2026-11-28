function clean(value) {
  return String(value)
    .replace(/([?&#](?:token_hash|access_token|refresh_token|code)=)[^&#\s]+/g,'$1[redacted]')
    .replace(/("(?:token_hash|access_token|refresh_token|password)"\s*:\s*")[^"]*/gi,'$1[redacted]')
    .replace(/(authorization:\s*bearer\s+)[^\s"']+/gi,'$1[redacted]');
}
module.exports={clean};
