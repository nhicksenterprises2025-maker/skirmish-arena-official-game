'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const launcher=path.resolve(__dirname,'..'),release=path.resolve(launcher,'..'),bundle=path.join(launcher,'backend-bundle');
const shell=JSON.parse(fs.readFileSync(path.join(bundle,'desktop-shell.json'),'utf8'));
assert.ok(shell.includes('desktop-entry.html'),'Fresh native bootstrap entry must ship with the backend');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const asset of shell)assert.equal(hash(path.join(bundle,asset)),hash(path.join(release,asset)),asset+' changed while packaging');
assert.equal(hash(path.join(bundle,'node.exe')),hash(process.execPath),'Packaged runtime must be the tested Node runtime');
for(const file of ['server/index.cjs','server/desktop-service.cjs','server/offline-bridge.cjs','server/local-ai.cjs','server/db.cjs','dev/simulate.cjs'])
  assert.equal(hash(path.join(bundle,file)),hash(path.join(release,file)),file+' changed while packaging');
function inspect(directory){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())inspect(file);
    else assert.equal(/\.sqlite(?:-|$)|updater\.key|\.env$|launcher-settings\.json$/i.test(entry.name),false,'User data/private file in backend bundle: '+file);
  }
}
inspect(bundle);
const smoke=spawnSync(path.join(bundle,'node.exe'),['-e',"require('./server/index.cjs');const {engine}=require('./dev/simulate.cjs');require('node:assert/strict').equal(Object.keys(engine().dev.inspect().SAVE.bots).length,50);"],{cwd:bundle,encoding:'utf8',timeout:15000,windowsHide:true});
assert.equal(smoke.status,0,'Bundled backend require closure must run without the release checkout: '+smoke.stderr);
console.log('PASS exact game shell/backend/runtime packaging, no account DB or private configuration in app resources.');
