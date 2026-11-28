// Executed in the failed page. Capture control state, never arbitrary form values
// or the complete storage/account database.
function failurePageState() {
  const element = document.activeElement;
  const describe = node => node ? {tag:node.tagName,id:node.id,role:node.getAttribute('role'),label:node.getAttribute('aria-label')} : null;
  const controls = [...document.querySelectorAll('input[type="number"], [role="slider"], [role="spinbutton"], select')].slice(0,80)
    .filter(node => !/password|token|code|email|phone|otp/i.test([node.id,node.getAttribute('name'),node.getAttribute('aria-label')].join(' ')))
    .map(node => ({...describe(node),value:node.getAttribute('aria-valuenow') ?? node.value,disabled:node.disabled ?? node.getAttribute('aria-disabled')}));
  const savedPreferences = {};
  try {
    const spec = JSON.parse(localStorage.getItem('dorego.current') || 'null');
    if(spec)for(const key of ['pattern','bpm','volume','low','high','direction','countIn'])if(['string','number'].includes(typeof spec[key]))savedPreferences[key]=spec[key];
  } catch {}
  return {url:location.href,title:document.title,startup:!!window.__soundtoolsStartup?.ready,
    focused:describe(element),controls,saved:document.querySelector('#saved')?.textContent,
    account:document.querySelector('[data-account-status]')?.getAttribute('data-account-status'),savedPreferences};
}
function redactState(value, clean) {
  if (typeof value === 'string') return clean(value.slice(0, 2000));
  if (Array.isArray(value)) return value.map(item=>redactState(item,clean));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,redactState(item,clean)]));
  return value;
}
module.exports = {failurePageState, redactState};
