'use strict';
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
const metadata=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8')),version=metadata.version;
if(!/^\d+\.\d+\.\d+$/.test(version)||!metadata.updateName||!Number.isFinite(Date.parse(metadata.releasedAt)))throw Error('Release version/name/date are required');
if(!metadata.shellRevision||!Object.values(metadata.categories||{}).some(items=>Array.isArray(items)&&items.length))throw Error('Release cache revision and categorized notes are required');
if((metadata.history||[]).some(item=>item.version===version))throw Error('Current release cannot duplicate a historical release');
const write=(file,data)=>fs.writeFileSync(path.join(root,file),data);
const displayDate=new Date(metadata.releasedAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).toUpperCase(),edition=metadata.applicationVersion||version;
const html=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
write('build-meta.js',`// Generated from version.json by dev/release-meta.cjs.\n(function(scope){scope.SARBuild=Object.freeze(${JSON.stringify(metadata)});})(typeof self!=='undefined'?self:window);\n`);
for(const file of ['package.json','package-lock.json','launcher/package.json','launcher/package-lock.json','launcher/src-tauri/tauri.conf.json']){const data=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));data.version=version;if(data.packages?.[''])data.packages[''].version=version;if(file==='package.json')data.description='Skirmish Arena game and persistent account server';if(data.app?.windows)for(const window of data.app.windows)window.title='Skirmish Arena';write(file,JSON.stringify(data,null,2)+'\n');}
write('launcher/src-tauri/Cargo.toml',fs.readFileSync(path.join(root,'launcher/src-tauri/Cargo.toml'),'utf8').replace(/^(version = ")[^"]+/m,'$1'+version).replace('Skirmish Arena Reimagined desktop launcher','Skirmish Arena desktop launcher'));
write('launcher/src-tauri/Cargo.lock',fs.readFileSync(path.join(root,'launcher/src-tauri/Cargo.lock'),'utf8').replace(/(name = "skirmish-launcher"\r?\nversion = ")[^"]+/,'$1'+version));
// A metadata-only pass is useful while separate UI work is in progress. Normal
// publication synchronizes only the literal shell identity, never UI content.
if(!process.argv.includes('--metadata-only')){
  write('game.js',fs.readFileSync(path.join(root,'game.js'),'utf8').replace(/window\.SAR\.getVersion=\(\)=>\(\{version:'[^']+',name:'[^']+',code:'[^']+'\}\);/,`window.SAR.getVersion=()=>({version:'${version}',name:'${metadata.updateName}',code:'${metadata.shellRevision}'});`).replace(/appVersion:window\.SARBuild\?\.version\|\|'[^']+'/,'appVersion:window.SARBuild?.version||\''+version+'\''));
  write('index.html',fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/BUILD [0-9.]+/,'BUILD '+version).replace(/<title>[^<]+<\/title>/,'<title>Skirmish Arena — '+html(edition)+' '+html(metadata.updateName)+'</title>').replace(/(class="eyebrow home-edition"[^\n]*?VERSION )[^<]+<span>[^<]+<\/span>/,'$1'+html(edition)+' <span>'+displayDate.replace(/ (\d{4})$/,' / $1')+'</span>'));
}
write('launcher/ui/index.html',fs.readFileSync(path.join(root,'launcher/ui/index.html'),'utf8').replace(/(<strong id="version">)[^<]+/,'$1'+version).replace(/(<span class="eyebrow">)[^<]+ \/ DESKTOP/,'$1'+html(metadata.updateName)+' / DESKTOP').replace(/(<span class="footer-mark">)SKIRMISH ARENA \/ [^<]+/,'$1SKIRMISH ARENA / '+html(metadata.updateName)).replace(/(<span class="date">)[^<]+/,'$1'+displayDate).replace(/(<ul id="news">)[\s\S]*?<\/ul>/,'$1'+Object.values(metadata.categories).flat().slice(0,3).map(note=>'<li>'+html(note)+'</li>').join('')+'</ul>'));
console.log('Release metadata generated: '+version+' — '+metadata.updateName);
