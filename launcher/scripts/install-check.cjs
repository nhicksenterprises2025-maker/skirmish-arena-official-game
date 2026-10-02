'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {spawnSync}=require('node:child_process');
const [olderExeArg,origin='http://127.0.0.1:8806',dbArg,outputArg]=process.argv.slice(2);
if(!olderExeArg||!dbArg||!outputArg)throw Error('Usage: node scripts/install-check.cjs <1.4.99-test-launcher.exe> <test-origin> <test-database> <results.json>');
const driver=process.env.SAR_WEBDRIVER||'http://127.0.0.1:4450';
const profile=path.join(path.dirname(path.resolve(outputArg)),'native-webdriver-profile');
const installedExe=path.join(process.env.LOCALAPPDATA,'Skirmish Arena Reimagined','skirmish-launcher.exe');
let id;
const results={checks:{},fromVersion:'1.4.99',toVersion:'1.5.0',installedExe};
async function request(method,route,data){
 const r=await fetch(driver+route,{method,headers:{'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
 const j=await r.json();if(j.value?.error)throw Error(j.value.message);return j.value;
}
const run=(script,args=[])=>request('POST','/session/'+id+'/execute/sync',{script,args});
const asyncRun=(script,args=[])=>request('POST','/session/'+id+'/execute/async',{script,args});
async function poll(script,args=[],timeout=25000){const end=Date.now()+timeout;while(Date.now()<end){const r=await run(script,args);if(r)return r;await new Promise(resolve=>setTimeout(resolve,300));}throw Error('Native install test timed out');}
async function start(exe){const s=await request('POST','/session',{capabilities:{alwaysMatch:{'tauri:options':{application:path.resolve(exe),webviewOptions:{userDataFolder:profile}}}}});id=s.sessionId;await request('POST','/session/'+id+'/timeouts',{script:30000});}
async function game(){const end=Date.now()+25000;while(Date.now()<end){for(const handle of await request('GET','/session/'+id+'/window/handles')){await request('POST','/session/'+id+'/window',{handle});if((await request('GET','/session/'+id+'/url')).startsWith(origin))return;}await new Promise(resolve=>setTimeout(resolve,300));}throw Error('Game did not open');}
function worlds(){const db=new DatabaseSync(path.resolve(dbArg),{readOnly:true});const rows=db.prepare('SELECT user_id,revision,save_json FROM worlds').all();db.close();return rows.map(r=>({id:r.user_id,revision:r.revision,save:JSON.parse(r.save_json)}));}
async function stop(){if(!id)return;const handles=await request('GET','/session/'+id+'/window/handles').catch(()=>[]);for(const handle of handles.slice().reverse()){await request('POST','/session/'+id+'/window',{handle}).catch(()=>{});await request('DELETE','/session/'+id+'/window').catch(()=>{});}await request('DELETE','/session/'+id).catch(()=>{});id=null;}
(async()=>{
try{
 await start(olderExeArg);
 await poll('return document.querySelector("#update").textContent==="UPDATE";');
 assert.equal(await run('return document.querySelector("#version").textContent;'),'1.4.99');
 assert.equal(await run('return document.querySelector("#update-title").textContent;'),'Version 1.5.0');
 results.checks.newerSignedReleaseDetected=true;
 const main=(await request('GET','/session/'+id+'/window/handles'))[0];
 await run('document.querySelector("#play").click();');await game();
 await poll('return !!window.SAR && !document.querySelector("#cloudBadge").classList.contains("hidden");');
 const identity=await asyncRun('const done=arguments[arguments.length-1];fetch("/api/bootstrap").then(r=>r.json()).then(data=>done({id:data.account.id,name:data.account.username}));');
 const before=worlds().find(w=>w.id===identity.id);assert.ok(before);
 results.checks.existingAccountWorldOpen=true;
 await request('POST','/session/'+id+'/window',{handle:main});
 await run('document.querySelector("#update").click();');
 const deadline=Date.now()+60000;let resumedWindows=[];
 while(Date.now()<deadline){
   await new Promise(resolve=>setTimeout(resolve,500));
   if(fs.existsSync(installedExe)){
     const observed=spawnSync('powershell.exe',['-NoProfile','-File',path.join(__dirname,'window-count.ps1'),'-ExecutablePath',installedExe],{windowsHide:true,encoding:'utf8'});
     if(observed.status===0){resumedWindows=JSON.parse(observed.stdout);if(resumedWindows.some(row=>row.windows>=2))break;}
   }
   try{const notice=await run('return document.querySelector("#notice").textContent;');if(notice&&/cancelled|could not|restricted|not allowed|cannot|timed out/i.test(notice))throw Error(notice);}catch(error){if(/cancelled|restricted|not allowed|cannot|timed out/i.test(error.message))throw error;}
 }
 assert.ok(fs.existsSync(installedExe),'The verified updater should install the1.5.0 launcher');
 results.checks.verifiedUpdaterInstalled=true;
 assert.ok(resumedWindows.some(row=>row.windows>=2),'The installed launcher should restart with both launcher and resumed game windows');
 results.checks.automaticLauncherAndGameWindowsResumed=true;
 await request('DELETE','/session/'+id).catch(()=>{});id=null;
 // Close the automatically restarted app before attaching the native driver to the installed app.
 spawnSync('powershell.exe',['-NoProfile','-Command',"Get-CimInstance Win32_Process -Filter \"Name='skirmish-launcher.exe'\" | Where-Object { $_.ExecutablePath -eq '"+installedExe.replaceAll("'","''")+"' } | ForEach-Object { Stop-Process -Id $_.ProcessId }"],{windowsHide:true});
 await start(installedExe);
 await poll('return document.querySelector("#version").textContent==="1.5.0";');
 results.checks.installedVersionIs150=true;
 await run('document.querySelector("#play").click();');
 await game();
 await poll('return document.querySelector("#cloudBadge")?.textContent.includes(arguments[0].toUpperCase());',[identity.name]);
 results.checks.sameAccountAfterInstalledLauncherRestart=true;
 const after=worlds().find(w=>w.id===identity.id);
 assert.ok(after&&after.revision>=before.revision);
 for(const [name,bot] of Object.entries(before.save.bots)){
   assert.equal(after.save.bots[name].profile.id,bot.profile.id);
   assert.equal(after.save.bots[name].profile.power,bot.profile.power);
   for(const stat of ['kills','deaths','assists','damage','games','wins'])assert.ok((after.save.bots[name].career[stat]||0)>=(bot.career[stat]||0));
 }
 results.checks.botIdsPowersCareersAndRevisionPreserved=true;
 results.ok=true;
 console.log('PASS actual signed updater install1.4.99→1.5.0, account checkpoint, game resume, careers preserved.');
}catch(error){results.ok=false;results.error=error.message;results.uiStatus=await run('return document.querySelector("#notice")?.textContent;').catch(()=>null);console.error(error.stack);process.exitCode=1;}
finally{await stop();fs.writeFileSync(path.resolve(outputArg),JSON.stringify(results,null,2));}
})();
