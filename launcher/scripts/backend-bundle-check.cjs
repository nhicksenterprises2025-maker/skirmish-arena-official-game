'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const launcher=path.resolve(__dirname,'..'),release=path.resolve(launcher,'..'),bundle=path.join(launcher,'backend-bundle');
const shell=JSON.parse(fs.readFileSync(path.join(bundle,'desktop-shell.json'),'utf8'));
const integrity=JSON.parse(fs.readFileSync(path.join(bundle,'desktop-integrity.json'),'utf8'));
const nativeBackend=fs.readFileSync(path.join(launcher,'src-tauri/src/backend.rs'),'utf8');
assert.equal(Number(nativeBackend.match(/const DATABASE_SCHEMA: u64 = (\d+);/)?.[1]),require(path.join(bundle,'server/db.cjs')).LATEST_DB_SCHEMA,'Native health/handoff contract must match the packaged database schema');
assert.equal(Number(fs.readFileSync(path.join(bundle,'desktop-launch.js'),'utf8').match(/health\.databaseSchema!==(\d+)/)?.[1]),require(path.join(bundle,'server/db.cjs')).LATEST_DB_SCHEMA,'Desktop preflight must match the packaged database schema');
assert.ok(shell.includes('desktop-entry.html'),'Fresh native bootstrap entry must ship with the backend');
assert.ok(shell.includes('phone-ui.js')&&shell.includes('phone-ui.css'),'Retained Phone shell must ship');
assert.ok(shell.includes('mode-entry.js'),'Required match-entry controller must ship');
assert.ok(shell.includes('profile-stats.js'),'Shared profile projection must ship');
assert.ok(shell.includes('distance-units.js'),'Confirmed map calibration and conversions must ship');
assert.equal(integrity['mode-entry.js'],crypto.createHash('sha256').update(fs.readFileSync(path.join(bundle,'mode-entry.js'))).digest('hex'),'Match-entry controller must be verified before installed startup');
for(const retired of ['ai-ui.js','ai-ui.css','server/offline-bridge.cjs','server/local-ai.cjs']){
  assert.equal(shell.includes(retired),false,'Retired feature cannot remain in the shell');
  assert.equal(fs.existsSync(path.join(bundle,retired)),false,'Retired runtime cannot remain in installed resources: '+retired);
}
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const asset of shell)assert.equal(hash(path.join(bundle,asset)),hash(path.join(release,asset)),asset+' changed while packaging');
assert.equal(hash(path.join(bundle,'node.exe')),hash(process.execPath),'Packaged runtime must be the tested Node runtime');
for(const file of ['server/index.cjs','server/desktop-service.cjs','server/db.cjs','server/wallet.cjs','server/commerce-catalog.cjs','dev/simulate.cjs'])
  assert.equal(hash(path.join(bundle,file)),hash(path.join(release,file)),file+' changed while packaging');
assert.equal(JSON.parse(fs.readFileSync(path.join(bundle,'node_modules/stripe/package.json'),'utf8')).version,'23.0.0','Ship the reviewed exact server SDK');
let sdkFiles=0;
function inspect(directory){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())inspect(file);
    else {
      assert.equal(/\.sqlite(?:-|$)|updater\.key|^\.env(?:\.|$)|launcher-settings\.json$/i.test(entry.name),false,'User data/private file in backend bundle: '+file);
      const relative=path.relative(bundle,file).replaceAll('\\','/');
      if(relative.startsWith('server/')||relative.startsWith('node_modules/')){
        assert.equal(hash(file),hash(path.join(release,relative)),relative+' changed while packaging');
        assert.equal(integrity[relative],hash(file),relative+' must be covered by native startup integrity verification');
      }
      if(relative.startsWith('node_modules/stripe/'))sdkFiles++;
    }
  }
}
inspect(bundle);
assert.ok(sdkFiles>20,'Stripe CommonJS runtime closure must be bundled');
const smokeEnvironment=Object.fromEntries(Object.entries(process.env).filter(([name])=>!/stripe|payment/i.test(name)));
const smoke=spawnSync(path.join(bundle,'node.exe'),['-e',"const assert=require('node:assert/strict');const Stripe=require('stripe');assert.equal(Stripe.PACKAGE_VERSION,'23.0.0');const stripe=new Stripe('not-a-credential');assert.equal(typeof stripe.checkout.sessions.create,'function');assert.equal(typeof stripe.webhooks.constructEvent,'function');require('./server/index.cjs');const {engine}=require('./dev/simulate.cjs');assert.equal(Object.keys(engine().dev.inspect().SAVE.bots).length,50);"],{cwd:bundle,encoding:'utf8',timeout:15000,windowsHide:true,env:smokeEnvironment});
assert.equal(smoke.status,0,'Bundled backend require closure must run without the release checkout: '+smoke.stderr);
console.log('PASS exact game shell/backend/runtime packaging, '+sdkFiles+' pinned Stripe runtime files under integrity verification, no account DB or private configuration in app resources.');
