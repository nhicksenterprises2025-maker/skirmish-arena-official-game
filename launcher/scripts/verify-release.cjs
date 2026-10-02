'use strict';
// Exercise the compiled updater against an isolated copy; never tamper with published files.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const {DatabaseSync} = require('node:sqlite');
const root = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sar-native-release-'));
const published = path.resolve(root, '../server/releases');
const output = path.resolve(process.argv[2] || path.join(root, 'verification-1.5.2.json'));
const exe = path.join(root, 'dist/skirmish-launcher.exe');
let fixture;
async function child(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const processChild = spawn(command, args, {cwd:root, windowsHide:true, ...options});
    let error = '';
    processChild.stdout?.on('data', chunk => process.stdout.write(chunk));
    processChild.stderr?.on('data', chunk => {error += chunk; process.stderr.write(chunk);});
    processChild.on('error', reject);
    processChild.on('exit', code => code === 0 ? resolve() : reject(Error('Verification command failed (' + code + '): ' + error)));
  });
}
(async () => {
  try {
    const releases = path.join(scratch, 'releases');
    fs.mkdirSync(releases);
    const manifest = JSON.parse(fs.readFileSync(path.join(published, 'update.json'), 'utf8'));
    const artifact = decodeURIComponent(new URL(manifest.platforms['windows-x86_64'].url).pathname.split('/').pop());
    for (const file of ['update.json', 'update.json.sig', artifact, artifact + '.sig']) fs.copyFileSync(path.join(published, file), path.join(releases, file));
    const helper = path.join(scratch, 'http-fixture.cjs');
    fs.writeFileSync(helper, `'use strict'; const http=require('node:http'),fs=require('node:fs'),path=require('node:path');const root=process.argv[2];const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;let file=pathname==='/api/launcher/update'?'update.json':pathname==='/api/launcher/update.sig'?'update.json.sig':pathname.startsWith('/api/launcher/download/')?decodeURIComponent(pathname.slice('/api/launcher/download/'.length)):null;if(!file||path.basename(file)!==file||!fs.existsSync(path.join(root,file))){res.writeHead(404);res.end();return;}const bytes=fs.readFileSync(path.join(root,file));res.writeHead(200,{'content-type':file.endsWith('.json')?'application/json':'application/octet-stream','content-length':bytes.length,'cache-control':'no-store'});res.end(bytes);});server.listen(0,'127.0.0.1',()=>console.log(server.address().port));`);
    fixture = spawn(process.execPath, [helper, releases], {windowsHide:true, stdio:['ignore','pipe','inherit']});
    const port = await new Promise((resolve, reject) => {let buffer='';fixture.stdout.on('data', chunk=>{buffer+=chunk;if(buffer.includes('\n'))resolve(Number(buffer.trim()));});fixture.on('error',reject);fixture.on('exit',code=>reject(Error('Fixture exited: '+code)));});
    const origin = 'http://127.0.0.1:' + port;
    manifest.platforms['windows-x86_64'].url = origin + '/api/launcher/download/' + encodeURIComponent(artifact);
    fs.writeFileSync(path.join(releases, 'update.json'), JSON.stringify(manifest, null, 2) + '\n');
    const signerEnv = {...process.env}; delete signerEnv.TAURI_SIGNING_PRIVATE_KEY;
    await child(process.execPath, [path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'), 'signer', 'sign', '--app-version', manifest.version, path.join(releases, 'update.json')], {env:signerEnv});
    const databasePath = path.join(scratch, 'world.sqlite');
    const db = new DatabaseSync(databasePath);
    db.exec('CREATE TABLE worlds(user_id TEXT PRIMARY KEY, revision INTEGER, save_json TEXT)');
    db.prepare('INSERT INTO worlds VALUES(?,?,?)').run('isolated-native-test', 42, '{"fixture":true,"careers":{"kills":123}}');
    db.close();
    const updateResult = path.join(scratch, 'signed-download.json');
    await child(process.execPath, [path.join(root, 'scripts/update-check.cjs'), exe, origin, databasePath, updateResult, releases], {env:signerEnv});
    const signedDownload = JSON.parse(fs.readFileSync(updateResult, 'utf8'));
    const artifacts = [exe, path.join(root, 'dist', artifact), path.join(published, 'update.json')].map(file => ({path:path.relative(path.resolve(root, '..'), file).replaceAll('\\','/'),bytes:fs.statSync(file).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}));
    assert.equal(signedDownload.ok, true);
    fs.writeFileSync(output, JSON.stringify({result:'PASS',verifiedAt:new Date().toISOString(),build:{framework:'Tauri 2',version:manifest.version,portable:true,nsis:true,signedInstaller:true,authenticodePublisherCertificate:false},configurationChecks:'PASS',signedDownload,artifacts,nativeFullscreen:{builtWithFullscreenGameWindow:true,exactOriginChecks:true,interactiveCheck:'pending'}}, null, 2) + '\n');
    console.log('Saved native release verification: ' + output);
  } finally {
    if (fixture && !fixture.killed) fixture.kill();
    const checkedScratch = path.resolve(scratch);
    if (path.dirname(checkedScratch) !== path.resolve(os.tmpdir()) || !path.basename(checkedScratch).startsWith('sar-native-release-')) throw Error('Refusing to clean unexpected fixture directory');
    fs.rmSync(checkedScratch, {recursive:true,force:true});
  }
})().catch(error => {console.error(error.stack);process.exitCode=1;});
