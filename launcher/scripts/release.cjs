'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const [artifactArg, originArg, outputArg] = process.argv.slice(2);
if (!artifactArg || !originArg || !outputArg) {
  console.error('Usage: node scripts/release.cjs <signed-installer.exe> <https-server-origin> <release-output-directory>');
  process.exit(1);
}
const artifact = path.resolve(artifactArg);
const origin = new URL(originArg);
const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname);
if ((origin.protocol !== 'https:' && !(origin.protocol === 'http:' && loopback)) || origin.pathname !== '/' || origin.username || origin.password || origin.search || origin.hash) throw Error('Use an HTTPS origin, or a loopback origin for a local test.');
if (!/\.(exe|msi)$/i.test(artifact)) throw Error('Use an NSIS or MSI installer.');
if (!fs.existsSync(artifact + '.sig')) throw Error('The installer must already have a Tauri .sig file.');
if (!process.env.TAURI_SIGNING_PRIVATE_KEY_PATH) throw Error('Set TAURI_SIGNING_PRIVATE_KEY_PATH to your private updater key outside the release tree.');
const configuration = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const bytes = fs.readFileSync(artifact);
const filename = path.basename(artifact);
const releaseDirectory = path.resolve(outputArg);
fs.mkdirSync(releaseDirectory, {recursive: true});
const manifest = {
  version: configuration.version,
  notes: JSON.parse(fs.readFileSync(path.join(root, '../version.json'), 'utf8')).notes,
  pub_date: new Date().toISOString(),
  platforms: {'windows-x86_64': {
    url: new URL('/api/launcher/download/' + encodeURIComponent(filename), origin).href,
    signature: fs.readFileSync(artifact + '.sig', 'utf8').trim(),
    size: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  }}
};
const manifestPath = path.join(releaseDirectory, 'update.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
fs.copyFileSync(artifact, path.join(releaseDirectory, filename));
fs.copyFileSync(artifact + '.sig', path.join(releaseDirectory, filename + '.sig'));
const cli = path.join(root, 'node_modules/@tauri-apps/cli/tauri.js');
const signerEnv = {...process.env};
// The build accepts PRIVATE_KEY as a path; signer sign has mutually exclusive key options.
delete signerEnv.TAURI_SIGNING_PRIVATE_KEY;
const result = spawnSync(process.execPath, [cli, 'signer', 'sign', '--app-version', configuration.version, manifestPath], {cwd: root, env: signerEnv, stdio: 'inherit'});
if (result.status !== 0) process.exit(result.status || 1);
console.log('Signed release directory: ' + releaseDirectory);
console.log('Installer SHA-256: ' + manifest.platforms['windows-x86_64'].sha256);
