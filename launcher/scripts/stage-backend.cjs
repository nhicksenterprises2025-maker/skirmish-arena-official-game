'use strict';
// The installed desktop app must not depend on the release checkout, npm, or a PATH Node install.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const launcher = path.resolve(__dirname, '..');
const release = path.resolve(launcher, '..');
fs.copyFileSync(path.join(release,'theme.css'),path.join(launcher,'ui/theme.css'));
const destination = path.join(launcher, 'backend-bundle');
const version = spawnSync(process.execPath, ['--version'], {encoding:'utf8'});
const [major, minor] = version.stdout.trim().slice(1).split('.').map(Number);
if (version.status || major < 24 || major === 24 && minor < 15) throw Error('Backend bundling requires Node 24.15 or later.');
if (path.dirname(destination) !== launcher || path.basename(destination) !== 'backend-bundle') throw Error('Invalid staging directory.');
if (fs.existsSync(destination)) fs.rmSync(destination, {recursive:true});
fs.mkdirSync(destination, {recursive:true});
const copy = (relative, target=relative) => {
  const output = path.join(destination, target);
  fs.mkdirSync(path.dirname(output), {recursive:true});
  fs.cpSync(path.join(release, relative), output, {recursive:true});
};
fs.copyFileSync(process.execPath, path.join(destination, 'node.exe'));
for (const name of fs.readdirSync(path.join(release, 'server'))) {
  if (name.endsWith('.cjs')) copy('server/' + name);
}
copy('server/migrations');
// Existing authoritative server validation imports this exact engine harness.
copy('dev/simulate.cjs');
copy('node_modules/bcryptjs');
// Only the existing Node/CommonJS SDK runtime is shipped. No developer config,
// environment files, type declarations or alternate browser SDK is required.
const stripePackage=JSON.parse(fs.readFileSync(path.join(release,'node_modules/stripe/package.json'),'utf8'));
if(stripePackage.version!=='23.0.0'||Object.keys(stripePackage.dependencies||{}).length)throw Error('Review the pinned Stripe runtime dependency closure before packaging.');
for(const file of ['package.json','LICENSE','VERSION'])copy('node_modules/stripe/'+file);
fs.cpSync(path.join(release,'node_modules/stripe/cjs'),path.join(destination,'node_modules/stripe/cjs'),{recursive:true,filter:source=>fs.statSync(source).isDirectory()||source.endsWith('.js')||path.basename(source)==='package.json'});
const shell = [
  'index.html','styles.css','game.js','cloud.js','mode-entry.js','phone-ui.js','phone-ui.css','fullscreen.js','audio.js','assets/audio/LICENSES.json',
  'renderer-25d.mjs','environment-25d.mjs','models-25d.mjs','inspect-25d.mjs','asset-loader-25d.mjs',
  'updater.js','sw.js','version.json','manifest.webmanifest','app-icon.svg',
  'vendor/three.module.js','vendor/three.core.js','vendor/addons/loaders/GLTFLoader.js',
  'vendor/addons/utils/BufferGeometryUtils.js','vendor/addons/utils/SkeletonUtils.js',
  'assets/25d/manifest.json','assets/25d/brightfield-props.glb'
];
shell.push('theme.css','skyline.css','phone-apps.css','skyline-tournaments.css','phone-apps.js','team-presentation.js','exit-game.js','assets/branding/wordmark.svg','assets/branding/wordmark-mono.svg','assets/branding/monogram.svg','assets/branding/monogram-mono.svg','assets/branding/app-256.png','assets/branding/app-512.png','match-modes.js','progression.js','boot.js','boot.css','tactical-instinct.js','desktop-entry.html','desktop-launch.html','desktop-launch.js','build-meta.js','tournaments-ui.js','assets/25d/live-circuit-details.glb');
const audioManifest=JSON.parse(fs.readFileSync(path.join(release,'assets/audio/LICENSES.json'),'utf8'));
shell.push('profile-stats.js','distance-units.js');
shell.push('fonts.css','blue-circuit.css','assets/fonts/Inter-Variable.ttf','assets/fonts/Oxanium-Variable.ttf','assets/fonts/Inter-OFL.txt','assets/fonts/Oxanium-OFL.txt','assets/fonts/README.md','assets/fonts/manifest.json','assets/25d/ranks/manifest.json','assets/25d/ranks/blue-circuit-ranks.glb');
shell.push('commerce.js','commerce.css','cosmetics-25d.mjs','assets/25d/cosmetics/manifest.json');
const cosmetics=JSON.parse(fs.readFileSync(path.join(release,'assets/25d/cosmetics/manifest.json'),'utf8'));
const cosmeticFiles=new Set();
for(const item of Object.values(cosmetics.cosmetics||{}))for(const style of Object.values(item.styles||{})){
  if(!/^assets\/25d\/cosmetics\/[a-z0-9.-]+\.glb$/.test(style.file))throw Error('Invalid cosmetic asset path');
  const digest=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(release,style.file))).digest('hex');
  if(digest!==style.sha256)throw Error('Cosmetic asset hash mismatch: '+style.file);
  cosmeticFiles.add(style.file);
}
shell.push(...cosmeticFiles);
const rankAssets=JSON.parse(fs.readFileSync(path.join(release,'assets/25d/ranks/manifest.json'),'utf8'));
for(const entry of rankAssets.models){if(!/^[a-z-]+\.png$/.test(entry.thumbnail))throw Error('Invalid rank thumbnail path');shell.push('assets/25d/ranks/'+entry.thumbnail);}
for(const asset of Object.values(audioManifest.assets)){if(!/^(weapons|handling|combat|impacts|movement|ui|match|ambience)\/[a-z0-9_]+\.(wav|ogg)$/.test(asset.file))throw Error('Invalid audio asset path');shell.push('assets/audio/'+asset.file);}
for (const asset of shell) copy(asset);
fs.writeFileSync(path.join(destination, 'desktop-shell.json'), JSON.stringify(shell));
// Compile the expected essential payload into the launcher. An interrupted
// install must be identified before executing mixed modules or migrating saves.
const hashes={};
function hashFiles(directory){for(const item of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,item.name),relative=path.relative(destination,file).replaceAll('\\','/');if(item.isDirectory())hashFiles(file);else if(!relative.startsWith('assets/'))hashes[relative]=require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');}}
hashFiles(destination);
fs.writeFileSync(path.join(destination,'desktop-integrity.json'),JSON.stringify(hashes));
// Build resources contain no user databases, cookies, recovery codes, or signing keys.
console.log('Staged bundled Node, backend, and ' + shell.length + ' game shell assets.');
require('./backend-bundle-check.cjs');
