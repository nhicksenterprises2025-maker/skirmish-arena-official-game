'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const [exeArg,origin='http://127.0.0.1:8806',dbArg,outputArg,releasesArg]=process.argv.slice(2);
if(!exeArg||!dbArg||!outputArg)throw Error('Usage: node scripts/update-check.cjs <launcher.exe> <origin> <test-database.sqlite> <results.json>');
const root=path.resolve(__dirname,'..');
const releases=path.resolve(releasesArg || path.resolve(root,'../server/releases'));
const manifestPath=path.join(releases,'update.json');
const signaturePath=manifestPath+'.sig';
const original=fs.readFileSync(manifestPath),originalSig=fs.readFileSync(signaturePath);
const manifest=JSON.parse(original);
const target=manifest.platforms['windows-x86_64'];
const filename=decodeURIComponent(new URL(target.url).pathname.split('/').pop());
const installerPath=path.join(releases,filename);
const installer=fs.readFileSync(installerPath);
const output=path.resolve(outputArg);
const diagnosticFile=path.join(path.dirname(output),'update-diagnostic.json');
const checks={};
function worldDigest(){
  const db=new DatabaseSync(path.resolve(dbArg),{readOnly:true});
  const rows=db.prepare('SELECT user_id,revision,save_json FROM worlds ORDER BY user_id').all();
  db.close();return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
function diagnostic(){
  if(fs.existsSync(diagnosticFile))fs.unlinkSync(diagnosticFile);
  const result=spawnSync(path.resolve(exeArg),['--verify-update',origin,diagnosticFile],{windowsHide:true,timeout:30000});
  if(result.error)throw result.error;
  if(!fs.existsSync(diagnosticFile))throw Error('Native update diagnostic returned no result');
  return JSON.parse(fs.readFileSync(diagnosticFile,'utf8'));
}
function signManifest(value){
  fs.writeFileSync(manifestPath,JSON.stringify(value,null,2)+'\n');
  const cli=path.join(root,'node_modules/@tauri-apps/cli/tauri.js');
  const signerEnv={...process.env};delete signerEnv.TAURI_SIGNING_PRIVATE_KEY;
  const result=spawnSync(process.execPath,[cli,'signer','sign','--app-version',value.version,manifestPath],{cwd:root,env:signerEnv,windowsHide:true,stdio:'pipe'});
  if(result.status!==0)throw Error('Manifest signing failed: '+result.stderr);
}
const before=worldDigest();
try{
  assert.equal(diagnostic().ok,true);checks.validSignedDownload=true;
  fs.writeFileSync(manifestPath,original.toString('utf8').replace(JSON.stringify(manifest.version),'"9.9.9"'));
  assert.equal(diagnostic().ok,false);checks.tamperedManifestRejected=true;
  fs.writeFileSync(manifestPath,original);
  const damaged=Buffer.from(installer);damaged[damaged.length-1]^=1;fs.writeFileSync(installerPath,damaged);
  assert.equal(diagnostic().ok,false);checks.tamperedInstallerRejected=true;
  fs.writeFileSync(installerPath,installer);
  const badChecksum=structuredClone(manifest);badChecksum.platforms['windows-x86_64'].sha256='0'.repeat(64);signManifest(badChecksum);
  assert.equal(diagnostic().ok,false);checks.signedChecksumMismatchRejected=true;
  const wrongVersion=structuredClone(manifest);wrongVersion.version='9.9.9';signManifest(wrongVersion);
  assert.equal(diagnostic().ok,false);checks.installerSignedVersionMismatchRejected=true;
  const insecure=structuredClone(manifest);insecure.platforms['windows-x86_64'].url='http://public.example.com/installer.exe';signManifest(insecure);
  assert.equal(diagnostic().ok,false);checks.publicHttpDownloadRejected=true;
}finally{
  fs.writeFileSync(manifestPath,original);fs.writeFileSync(signaturePath,originalSig);fs.writeFileSync(installerPath,installer);
}
assert.equal(worldDigest(),before);checks.databaseProgressUnchanged=true;
fs.writeFileSync(output,JSON.stringify({ok:true,checks,packageSize:target.size,packageSha256:target.sha256},null,2));
console.log('PASS native signed download, manifest/artifact tamper rejection, checksum, signed version, transport, and database preservation.');
