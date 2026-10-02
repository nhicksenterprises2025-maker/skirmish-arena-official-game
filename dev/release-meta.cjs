'use strict';
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
const metadata=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8')),version=metadata.version;
if(!/^\d+\.\d+\.\d+$/.test(version)||!metadata.updateName||!Number.isFinite(Date.parse(metadata.releasedAt)))throw Error('Release version/name/date are required');
if(!metadata.shellRevision||!Object.values(metadata.categories||{}).some(items=>Array.isArray(items)&&items.length))throw Error('Release cache revision and categorized notes are required');
if((metadata.history||[]).some(item=>item.version===version))throw Error('Current release cannot duplicate a historical release');
const write=(file,data)=>fs.writeFileSync(path.join(root,file),data);
write('build-meta.js',`// Generated from version.json by dev/release-meta.cjs.\n(function(scope){scope.SARBuild=Object.freeze(${JSON.stringify(metadata)});})(typeof self!=='undefined'?self:window);\n`);
for(const file of ['package.json','package-lock.json','launcher/package.json','launcher/package-lock.json','launcher/src-tauri/tauri.conf.json']){const data=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));data.version=version;if(data.packages?.[''])data.packages[''].version=version;if(file==='package.json')data.description='Skirmish Arena game and persistent account server';if(data.app?.windows)for(const window of data.app.windows)window.title='Skirmish Arena';write(file,JSON.stringify(data,null,2)+'\n');}
write('launcher/src-tauri/Cargo.toml',fs.readFileSync(path.join(root,'launcher/src-tauri/Cargo.toml'),'utf8').replace(/^(version = ")[^"]+/m,'$1'+version).replace('Skirmish Arena Reimagined desktop launcher','Skirmish Arena desktop launcher'));
write('launcher/src-tauri/Cargo.lock',fs.readFileSync(path.join(root,'launcher/src-tauri/Cargo.lock'),'utf8').replace(/(name = "skirmish-launcher"\r?\nversion = ")[^"]+/,'$1'+version));
// A metadata-only pass is useful while separate UI work is in progress. Normal
// publication synchronizes only the literal shell identity, never UI content.
if(!process.argv.includes('--metadata-only')){
  write('game.js',fs.readFileSync(path.join(root,'game.js'),'utf8').replace(/window\.SAR\.getVersion=\(\)=>\(\{version:'[^']+',name:'[^']+',code:'[^']+'\}\);/,`window.SAR.getVersion=()=>({version:'${version}',name:'${metadata.updateName}',code:'${metadata.shellRevision}'});`));
  write('index.html',fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/BUILD [0-9.]+/,'BUILD '+version).replace(/<title>[^<]+<\/title>/,'<title>Skirmish Arena — '+(metadata.applicationVersion||version)+' '+metadata.updateName+'</title>'));
}
write('launcher/ui/index.html',fs.readFileSync(path.join(root,'launcher/ui/index.html'),'utf8').replace(/(<strong id="version">)[^<]+/,'$1'+version));
console.log('Release metadata generated: '+version+' — '+metadata.updateName);
