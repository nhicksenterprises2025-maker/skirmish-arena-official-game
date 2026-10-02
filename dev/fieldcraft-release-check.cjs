'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8'),json=file=>JSON.parse(read(file));
const release=json('version.json');
assert.equal(release.version,'1.7.0');assert.equal(release.updateName,'FIELDCRAFT');assert.equal(release.shellRevision,'fieldcraft-2');
assert.ok(Number.isFinite(Date.parse(release.releasedAt)));assert.ok(Object.values(release.categories).every(items=>Array.isArray(items)&&items.length));assert.equal(release.categories.Balance,undefined,'presentation release must not claim a new balance patch');
assert.equal(release.history[0].version,'1.6.0');assert.equal(release.history[0].updateName,'LIVE CIRCUIT');assert.ok(release.history[0].categories['New Features'].length);
const scope={};vm.runInNewContext(read('build-meta.js'),{self:scope});assert.deepEqual(JSON.parse(JSON.stringify(scope.SARBuild)),release);
for(const file of ['package.json','package-lock.json','launcher/package.json','launcher/package-lock.json','launcher/src-tauri/tauri.conf.json']){const value=json(file);assert.equal(value.version,release.version,file);if(value.packages?.[''])assert.equal(value.packages[''].version,release.version,file+' root package');}
assert.match(read('launcher/src-tauri/Cargo.toml'),/^version = "1\.7\.0"$/m);assert.match(read('launcher/src-tauri/Cargo.lock'),/name = "skirmish-launcher"\r?\nversion = "1\.7\.0"/);
const native=json('launcher/src-tauri/tauri.conf.json');assert.equal(native.identifier,'com.skirmisharena.launcher');assert.equal(native.productName,'Skirmish Arena Reimagined','installer identity stays compatible with installed copies');assert.equal(native.app.windows[0].title,'Skirmish Arena');
assert.equal(native.bundle.windows.nsis.installerHooks,'installer-hooks.nsh');assert.match(read('launcher/src-tauri/installer-hooks.nsh'),/WriteRegStr SHCTX "\$\{UNINSTKEY\}" "DisplayName" "Skirmish Arena"/);assert.match(read('launcher/src-tauri/installer-hooks.nsh'),/IsShortcutTarget/);
assert.equal(native.bundle.windows.nsis.customLanguageFiles.English,'installer-english.nsh');assert.match(read('launcher/src-tauri/installer-english.nsh'),/^Name "Skirmish Arena"$/m);assert.doesNotMatch(read('launcher/src-tauri/installer-english.nsh'),/^LangString.*Reimagined/m);
assert.equal(json('manifest.webmanifest').name,'Skirmish Arena');for(const file of ['index.html','launcher/ui/index.html','desktop-entry.html','desktop-launch.html','README.md'])assert.doesNotMatch(read(file),/Skirmish Arena Reimagined|SKIRMISH ARENA\s*<br>\s*REIMAGINED/i,file+' public branding');
assert.match(read('launcher/src-tauri/src/main.rs'),/\.title\("Skirmish Arena"\)/);assert.match(read('launcher/ui/index.html'),/<strong id="version">1\.7\.0<\/strong>/);
const {engine}=require('./simulate.cjs'),e=engine();assert.deepEqual(JSON.parse(JSON.stringify(e.context.SAR.getVersion())),{version:release.version,name:release.updateName,code:release.shellRevision});
assert.equal(e.context.SAR.getUniverse().patchState.fingerprint,'b-2bec20b9','FIELDCRAFT preserves Balance 7.0');assert.deepEqual(JSON.parse(JSON.stringify(e.context.SAR.getWeapons())),json('dev/fixtures/balance-7.0.json').weapons,'all weapon constants remain unchanged');
console.log('PASS FIELDCRAFT metadata, package/native/runtime identity, prior release history, public branding, legacy install compatibility and unchanged Balance 7.0.');
