// Inventory aliases without shell execution. Keep original commands intact:
// their npm hooks and ordered setup steps remain part of coverage.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
function key(app, command, args) { return `${app}:${command}:${args.join(' ')}`; }
function leaves(command, args, cwd = root, seen = []) {
  const workspace = command === 'npm' && args.find(arg => arg.startsWith('--workspace='))?.split('=')[1];
  if (workspace) cwd = path.join(root, workspace.startsWith('@ldayton/') ? 'packages' : 'apps', workspace.replace('@ldayton/', ''));
  if (command !== 'npm' || !['run', 'test'].includes(args[0])) return [{ command, args, cwd: path.relative(root, cwd) }];
  const scripts = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'))).scripts;
  const task = args[0] === 'test' ? 'test' : args[1], id = `${cwd}:${task}`;
  if (!scripts[task] || seen.includes(id)) throw Error(`Missing or cyclic alias: ${id}`);
  return [`pre${task}`, task, `post${task}`].filter(name => scripts[name]).flatMap(name => scripts[name].split(/\s*&&\s*/).flatMap(part => {
    // The inventory is intentionally fail-closed for unsupported shell syntax.
    if (/[|;<>]/.test(part)) throw Error(`Declare shell setup explicitly: ${part}`);
    const tokens = part.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g).map(token => token.replace(/^['"]|['"]$/g, ''));
    return leaves(tokens[0], tokens.slice(1), cwd, [...seen, id]);
  }));
}
function sources(entries) {
  const seen = new Set();
  function visit(file) {
    if (!file || seen.has(file) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return;
    seen.add(file);
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:from\s*|require\(|import\()\s*['"](\.[^'"]+)['"]/g)) {
      const base = path.resolve(path.dirname(file), match[1]);
      const target = ['', '.ts', '.mts', '.tsx', '.cjs', '.mjs', '.js'].map(ext => base + ext).find(p => fs.existsSync(p) && fs.statSync(p).isFile());
      // Application imports are covered by the build. Scan test/server helpers.
      if (target && /(?:tests?|scripts|browser-tests)\//.test(target) && (!target.includes('/scripts/ci/') || target.endsWith('/browser-harness.cjs'))) visit(target);
    }
  }
  for (const entry of entries) for (const arg of entry.args) if (/\.(?:[cm]?js|[cm]?tsx?)$/.test(arg)) visit(path.resolve(root, entry.cwd, arg));
  return [...seen];
}
function observedPorts(entries) {
  // Conservative inventory check, not a port allocator. False positives lock
  // extra resources; new literal ports cannot bypass the reviewed declaration.
  return [...new Set(sources(entries).flatMap(file => [...fs.readFileSync(file, 'utf8').matchAll(/\b([48]\d{3})\b/g)].map(m => +m[1])))].sort((a, b) => a - b);
}
function declaration(app, command, args) {
  const catalog = require('./resources.json'), id = key(app, command, args), entry = catalog[id];
  if (!entry) throw Error(`Missing resource declaration: ${id}`);
  const coverage = leaves(command, args);
  const ports = observedPorts(coverage);
  if (ports.some(port => !entry.ports.includes(port))) throw Error(`New port in ${id}: update scripts/ci/resources.json after auditing isolation`);
  if (JSON.stringify(entry.coverage) !== JSON.stringify(coverage)) throw Error(`Coverage changed in ${id}: review and update its resource declaration`);
  return { coverage, locks: [...entry.ports.map(port => `port:${port}`), ...entry.locks], kind: entry.kind, ...(entry.partition ? { partition: entry.partition } : {}), ...(entry.visual ? { visual: entry.visual } : {}) };
}
module.exports = { key, leaves, sources, observedPorts, declaration };
