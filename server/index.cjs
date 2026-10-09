'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const bcrypt=require('bcryptjs');
const {createDatabase}=require('./db.cjs');
const {readWorld,refreshWorldSeason,migrateLocalWorld,writeWorld,MAX_WORLD_BYTES,fail}=require('./world.cjs');
const Circuit=require('./tournaments.cjs'),tournamentRuntime=require('./tournament-runtime.cjs');
const tournamentPresentation=require('./tournament-presentation.cjs');
const TournamentReset=require('./tournament-reset.cjs');
const ProfileParticipations=require('./profile-participations.cjs');
const Commerce=require('./commerce-catalog.cjs'),Wallet=require('./wallet.cjs');
const Payments=require('./payments.cjs');

const ROOT=path.resolve(__dirname,'..');
const SESSION_MS=30*24*60*60*1000;
const STATIC=new Set(['/','/index.html','/phone-ui.js','/phone-ui.css','/game.js','/cloud.js','/fullscreen.js','/audio.js','/assets/audio/LICENSES.json','/styles.css','/updater.js','/sw.js','/version.json','/manifest.webmanifest','/app-icon.svg','/renderer-25d.mjs','/environment-25d.mjs','/models-25d.mjs','/inspect-25d.mjs','/asset-loader-25d.mjs','/vendor/three.module.js','/vendor/three.core.js','/vendor/addons/loaders/GLTFLoader.js','/vendor/addons/utils/BufferGeometryUtils.js','/vendor/addons/utils/SkeletonUtils.js','/assets/25d/manifest.json','/assets/25d/brightfield-props.glb']);
const audioManifest=JSON.parse(fs.readFileSync(path.join(ROOT,'assets/audio/LICENSES.json'),'utf8'));
STATIC.add('/mode-entry.js');
STATIC.add('/profile-stats.js');
STATIC.add('/distance-units.js');
for(const asset of ['commerce.js','commerce.css','refined-ui.css','cosmetics-25d.mjs','assets/25d/cosmetics/manifest.json'])STATIC.add('/'+asset);
// Runtime cosmetic exports only; editable sources remain outside the server.
const cosmeticManifestFile=path.join(ROOT,'assets/25d/cosmetics/manifest.json');
if(fs.existsSync(cosmeticManifestFile)){
  try{
    const manifest=JSON.parse(fs.readFileSync(cosmeticManifestFile,'utf8'));
    for(const entry of Object.values(manifest.cosmetics||{}))for(const style of Object.values(entry.styles||{}))if(/^assets\/25d\/cosmetics\/[a-z0-9._-]+\.glb$/.test(style.file||''))STATIC.add('/'+style.file);
  }catch(error){console.error('Cosmetic asset catalog unavailable:',error.message);}
}
for(const asset of ['fonts.css','blue-circuit.css','assets/fonts/Inter-Variable.ttf','assets/fonts/Oxanium-Variable.ttf','assets/fonts/Inter-OFL.txt','assets/fonts/Oxanium-OFL.txt','assets/fonts/README.md','assets/fonts/manifest.json','assets/25d/ranks/manifest.json','assets/25d/ranks/blue-circuit-ranks.glb'])STATIC.add('/'+asset);
// Optional badge art must not become a prerequisite for starting the backend.
for(const rank of require('../progression.js').ranks)STATIC.add('/assets/25d/ranks/'+rank.name.toLowerCase().replaceAll(' ','-')+'.png');
for(const asset of ['theme.css','skyline.css','phone-apps.css','skyline-tournaments.css','phone-apps.js','team-presentation.js','exit-game.js','assets/branding/wordmark.svg','assets/branding/wordmark-mono.svg','assets/branding/monogram.svg','assets/branding/monogram-mono.svg','assets/branding/app-256.png','assets/branding/app-512.png','match-modes.js','progression.js','boot.js','boot.css','tactical-instinct.js','desktop-entry.html','desktop-launch.html','desktop-launch.js','build-meta.js','tournaments-ui.js','assets/25d/live-circuit-details.glb'])STATIC.add('/'+asset);
for(const asset of Object.values(audioManifest.assets)){if(/^(weapons|handling|combat|impacts|movement|ui|match|ambience)\/[a-z0-9_]+\.(wav|ogg)$/.test(asset.file))STATIC.add('/assets/audio/'+asset.file);}
const MIME={'.wav':'audio/wav','.ogg':'audio/ogg','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.glb':'model/gltf-binary','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const cookieName='sar_session';
const usernameKey=value=>String(value||'').trim().toLocaleLowerCase('en-US');
const validUsername=value=>/^[A-Za-z0-9_]{3,24}$/.test(String(value||''));
const validPassword=value=>typeof value==='string'&&Buffer.byteLength(value,'utf8')>=10&&Buffer.byteLength(value,'utf8')<=72;
const recoveryAlphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function recoveryCode(){return Array.from(crypto.randomBytes(16),x=>recoveryAlphabet[x%recoveryAlphabet.length]).join('').match(/.{1,4}/g).join('-');}
function secureRequest(req){return !!req.socket.encrypted||(process.env.SAR_TRUST_PROXY==='1'&&req.headers['x-forwarded-proto']==='https');}
function sessionCookie(token,req){return cookieName+'='+token+'; HttpOnly; SameSite=Lax; Path=/; Max-Age='+Math.floor(SESSION_MS/1000)+(secureRequest(req)?'; Secure':'');}
function expiredCookie(req){return cookieName+'=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'+(secureRequest(req)?'; Secure':'');}
function cookies(req){return Object.fromEntries(String(req.headers.cookie||'').split(';').map(p=>p.trim().split('=')).filter(a=>a.length===2));}
function json(res,status,data,headers={}){
  const payload=JSON.stringify(data);
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers});res.end(payload);
}
function readBody(req,limit=MAX_WORLD_BYTES+32768){
  return new Promise((resolve,reject)=>{
    let size=0,tooLarge=false;const chunks=[];
    req.on('data',chunk=>{size+=chunk.length;if(size>limit){tooLarge=true;return;}chunks.push(chunk);});
    req.on('end',()=>{if(tooLarge){reject(fail(413,'Request body is too large'));return;}try{resolve(size?JSON.parse(Buffer.concat(chunks).toString('utf8')):{});}catch{reject(fail(400,'Invalid JSON request'));}});
    req.on('error',reject);
  });
}
function readPaymentBody(req){
  return new Promise((resolve,reject)=>{
    const chunks=[];let size=0,tooLarge=false;
    req.on('data',chunk=>{size+=chunk.length;if(size>262144){tooLarge=true;return;}chunks.push(chunk);});
    req.on('end',()=>tooLarge?reject(fail(413,'Payment event is too large')):resolve(Buffer.concat(chunks)));
    req.on('error',reject);req.on('aborted',()=>reject(fail(400,'Payment event was interrupted')));
  });
}
function clientIp(req){return process.env.SAR_TRUST_PROXY==='1'?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0].trim():req.socket.remoteAddress||'unknown';}
function throttle(map,req,kind,limit,windowMs){
  const key=clientIp(req)+'|'+kind,now=Date.now(),old=map.get(key)||[],recent=old.filter(t=>now-t<windowMs);
  if(recent.length>=limit)throw fail(429,'Too many requests. Try again later.');
  recent.push(now);map.set(key,recent);
}
function checkOrigin(req){
  if(!['POST','PUT','PATCH','DELETE'].includes(req.method))return;
  if(req.headers['sec-fetch-site']==='cross-site')throw fail(403,'Cross-origin write request rejected');
  if(req.method!=='DELETE'&&!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))throw fail(415,'Write requests must use application/json');
  const origin=req.headers.origin;if(!origin)return;
  const inferred=(secureRequest(req)?'https://':'http://')+req.headers.host;
  const allowed=process.env.SAR_PUBLIC_ORIGIN||inferred;
  if(origin!==allowed)throw fail(403,'Cross-origin write request rejected');
}
function session(db,req){
  const token=cookies(req)[cookieName];if(!token||token.length>128)return null;
  const row=db.prepare('SELECT s.token_hash,s.expires_at,u.id,u.username,u.created_at,u.disabled_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?').get(sha(token));
  if(!row||row.disabled_at)return null;
  if(row.expires_at<=Date.now()){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(row.token_hash);return null;}
  return {tokenHash:row.token_hash,id:row.id,username:row.username,createdAt:row.created_at,expiresAt:row.expires_at};
}
function requireSession(db,req){return session(db,req)||(()=>{throw fail(401,'Sign in to use cloud progress');})();}
function newSession(db,userId,req,res){
  const token=crypto.randomBytes(32).toString('base64url'),now=Date.now();
  db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)').run(sha(token),userId,now,now+SESSION_MS,now);
  res.setHeader('set-cookie',sessionCookie(token,req));
}
function staticFile(req,res,pathname){
  if(req.method!=='GET'&&req.method!=='HEAD')throw fail(405,'Method not allowed');
  if(!STATIC.has(pathname))throw fail(404,'File not found');
  const file=path.join(ROOT,pathname==='/'?'index.html':pathname.slice(1));
  if(!fs.existsSync(file))throw fail(404,'This build asset is not installed');
  const info=fs.statSync(file),type=MIME[path.extname(file)]||'application/octet-stream';
  const cache=pathname==='/version.json'||pathname==='/'||pathname==='/index.html'||pathname==='/desktop-entry.html'||pathname==='/desktop-launch.js'?'no-store':'public, max-age=0, must-revalidate';
  res.writeHead(200,{'content-type':type,'content-length':info.size,'cache-control':cache,'x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});
  if(req.method==='HEAD'){res.end();return;}
  fs.createReadStream(file).pipe(res);
}
function accountJson(db,user){
  const world=refreshWorldSeason(db,user.id);
  return {id:user.id,username:user.username,createdAt:user.createdAt,status:'ACTIVE',cloudSave:world?'SYNCED':'EMPTY',lastCloudSync:world?.updatedAt||null,revision:world?.revision||0};
}
function versionInfo(){
  const version=JSON.parse(fs.readFileSync(path.join(ROOT,'version.json'),'utf8'));
  return {version:version.version,channel:version.channel,updateName:version.updateName,releasedAt:version.releasedAt,news:version.notes};
}
function adminAuthorized(req){
  const secret=process.env.SAR_ADMIN_TOKEN,token=req.headers['x-sar-admin-token'];
  if(!secret||!token)return false;
  const a=Buffer.from(secret),b=Buffer.from(String(token));
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function createServer({db=createDatabase(),paymentOptions={}}={}){
  const runtimeVersion=versionInfo().version;
  const commerceEnvironment=Wallet.environment();
  const payments=Payments.createPayments({db,...paymentOptions});
  const limits=new Map();
  const server=http.createServer(async(req,res)=>{
    try{
      const requestUrl=new URL(req.url,'http://localhost'),pathname=requestUrl.pathname;
      // Stripe signatures authenticate this one public endpoint. Preserve the
      // original raw bytes; browser/session write routes still enforce Origin.
      if(pathname==='/api/payments/stripe/webhook'&&req.method==='POST'){
        throttle(limits,req,'payment-webhook',240,60000);
        json(res,200,await payments.webhook(await readPaymentBody(req),req.headers['stripe-signature']));return;
      }
      checkOrigin(req);
      if(pathname==='/shop/return'&&req.method==='GET'){
        const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Skirmish Arena — Test checkout</title><body><h1>Return to Skirmish Arena</h1><p>This was a Sandbox test checkout. Return to the Shop and check payment status. This page does not confirm a payment or deliver credits.</p></body></html>';
        res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",'x-content-type-options':'nosniff'});res.end(html);return;
      }
      if(!pathname.startsWith('/api/')){staticFile(req,res,pathname);return;}
      if(pathname==='/api/status'&&req.method==='GET'){json(res,200,{ok:true,version:runtimeVersion,serverNow:Date.now(),databaseSchema:db.prepare('PRAGMA user_version').get().user_version});return;}
      if(pathname==='/api/version'&&req.method==='GET'){json(res,200,{...versionInfo(),serverNow:Date.now()});return;}
      if(['/api/launcher/update','/api/launcher/update.sig'].includes(pathname)&&req.method==='GET'){
        const manifest=path.join(__dirname,'releases',pathname.endsWith('.sig')?'update.json.sig':'update.json');
        if(!fs.existsSync(manifest)){res.writeHead(204,{'cache-control':'no-store'});res.end();return;}
        const data=fs.readFileSync(manifest);res.writeHead(200,{'content-type':pathname.endsWith('.sig')?'text/plain; charset=utf-8':'application/json','content-length':data.length,'cache-control':'no-store'});res.end(data);return;
      }
      if(pathname.startsWith('/api/launcher/download/')&&['GET','HEAD'].includes(req.method)){
        let name;try{name=decodeURIComponent(pathname.slice('/api/launcher/download/'.length));}catch{throw fail(400,'Invalid installer name');}
        if(!/^[A-Za-z0-9][A-Za-z0-9 ._-]{1,180}\.(exe|msi)$/i.test(name)||name.includes('..'))throw fail(400,'Invalid installer name');
        const releaseDir=path.join(__dirname,'releases'),manifest=path.join(releaseDir,'update.json');
        if(!fs.existsSync(manifest))throw fail(404,'No launcher release is published');
        const platforms=JSON.parse(fs.readFileSync(manifest,'utf8')).platforms||{};
        const allowed=Object.values(platforms).some(platform=>{try{return decodeURIComponent(new URL(platform.url).pathname.split('/').at(-1))===name;}catch{return false;}});
        const file=path.join(releaseDir,name);
        if(!allowed||!fs.existsSync(file)||path.dirname(fs.realpathSync(file))!==fs.realpathSync(releaseDir)||!fs.statSync(file).isFile())throw fail(404,'Installer not found in the published release');
        const bytes=fs.statSync(file).size;res.writeHead(200,{'content-type':'application/octet-stream','content-length':bytes,'cache-control':'public, max-age=86400','x-content-type-options':'nosniff'});
        if(req.method==='HEAD'){res.end();return;}fs.createReadStream(file).pipe(res);return;
      }
      if(pathname==='/api/bootstrap'&&req.method==='GET'){
        const user=session(db,req);
        if(user)Wallet.ensureWallet(db,user.id,commerceEnvironment);
        json(res,200,{authenticated:!!user,account:user?accountJson(db,user):null,serverNow:Date.now(),version:versionInfo().version});return;
      }
      if(pathname==='/api/auth/signup'&&req.method==='POST'){
        throttle(limits,req,'signup',6,3600000);
        const body=await readBody(req,4096),username=String(body.username||'').trim(),password=body.password;
        if(!validUsername(username))throw fail(400,'Username must be 3–24 letters, numbers, or underscores');
        if(!validPassword(password))throw fail(400,'Password must be 10–72 UTF-8 bytes');
        const key=usernameKey(username),now=Date.now();
        if(db.prepare('SELECT 1 AS yes FROM users WHERE username_key=?').get(key))throw fail(409,'Username is taken');
        const id=crypto.randomUUID(),code=recoveryCode(),hash=await bcrypt.hash(password,12),recoveryHash=await bcrypt.hash(code,12);
        try{db.prepare('INSERT INTO users(id,username,username_key,password_hash,recovery_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,username,key,hash,recoveryHash,now,now);}
        catch(error){if(db.prepare('SELECT 1 AS yes FROM users WHERE username_key=?').get(key))throw fail(409,'Username is taken','USERNAME_TAKEN');throw error;}
        newSession(db,id,req,res);
        json(res,201,{account:{id,username,createdAt:now,status:'ACTIVE',cloudSave:'EMPTY',revision:0},recoveryCode:code,serverNow:now});return;
      }
      if(pathname==='/api/auth/login'&&req.method==='POST'){
        throttle(limits,req,'login',12,15*60000);
        const body=await readBody(req,4096),key=usernameKey(body.username);
        if(!validUsername(String(body.username||'').trim())||!validPassword(body.password))throw fail(401,'Username or password is incorrect');
        const row=db.prepare('SELECT id,password_hash,disabled_at FROM users WHERE username_key=?').get(key);
        const dummy='$2b$12$uBXVgUPxTJsxNfEAtBmeAOVCJFo7.SSl67NIa03XqxC7f9Z87zfDC';
        const okay=await bcrypt.compare(String(body.password||''),row?.password_hash||dummy);
        if(!row||row.disabled_at||!okay)throw fail(401,'Username or password is incorrect');
        const current=db.prepare('SELECT password_hash,disabled_at FROM users WHERE id=?').get(row.id);
        if(!current||current.disabled_at||current.password_hash!==row.password_hash)throw fail(401,'Username or password is incorrect');
        const now=Date.now();db.prepare('UPDATE users SET updated_at=? WHERE id=?').run(now,row.id);newSession(db,row.id,req,res);
        const user=session(db,{headers:{cookie:res.getHeader('set-cookie')},socket:req.socket});
        json(res,200,{account:accountJson(db,user),serverNow:now});return;
      }
      if(pathname==='/api/auth/recover'&&req.method==='POST'){
        throttle(limits,req,'recovery',5,3600000);
        const body=await readBody(req,4096);
        if(!validPassword(body.newPassword))throw fail(400,'New password must be 10–72 UTF-8 bytes');
        const row=db.prepare('SELECT id,recovery_hash,disabled_at FROM users WHERE username_key=?').get(usernameKey(body.username));
        const dummy='$2b$12$uBXVgUPxTJsxNfEAtBmeAOVCJFo7.SSl67NIa03XqxC7f9Z87zfDC';
        const okay=await bcrypt.compare(String(body.recoveryCode||'').toUpperCase(),row?.recovery_hash||dummy);
        if(!row||row.disabled_at||!okay)throw fail(401,'Username or recovery code is incorrect');
        const hash=await bcrypt.hash(body.newPassword,12),now=Date.now(),newCode=recoveryCode(),newHash=await bcrypt.hash(newCode,12);
        db.exec('BEGIN IMMEDIATE');
        try{
          const changed=db.prepare('UPDATE users SET password_hash=?,recovery_hash=?,updated_at=? WHERE id=? AND recovery_hash=? AND disabled_at IS NULL').run(hash,newHash,now,row.id,row.recovery_hash);
          if(Number(changed.changes)!==1)throw fail(401,'Username or recovery code is incorrect');
          db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.id);db.exec('COMMIT');
        }catch(error){db.exec('ROLLBACK');throw error;}
        newSession(db,row.id,req,res);
        json(res,200,{account:accountJson(db,session(db,{headers:{cookie:res.getHeader('set-cookie')},socket:req.socket})),recoveryCode:newCode,serverNow:now});return;
      }
      if(pathname==='/api/auth/logout'&&req.method==='POST'){
        const user=session(db,req);if(user)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(user.tokenHash);
        res.setHeader('set-cookie',expiredCookie(req));json(res,200,{ok:true});return;
      }
      const user=requireSession(db,req);
      Wallet.ensureWallet(db,user.id,commerceEnvironment);
      if(pathname==='/api/commerce/catalog'&&req.method==='GET'){
        Wallet.ensureWallet(db,user.id,commerceEnvironment);
        try{await payments.verifyConfiguration();}catch{/* Optional checkout stays unavailable; gameplay and wallet remain usable. */}
        json(res,200,{...Commerce.catalog(commerceEnvironment),...payments.availability()});return;
      }
      if(pathname==='/api/wallet'&&req.method==='GET'){json(res,200,Wallet.snapshot(db,user.id,commerceEnvironment));return;}
      if(pathname==='/api/store/purchase'&&req.method==='POST'){throttle(limits,req,'store-purchase',60,60000);json(res,200,Wallet.purchase(db,user.id,await readBody(req,2048),commerceEnvironment));return;}
      if(pathname==='/api/store/equip'&&req.method==='POST'){json(res,200,Wallet.equip(db,user.id,await readBody(req,2048),commerceEnvironment));return;}
      if(pathname==='/api/wallet/match-report'&&req.method==='POST'){throttle(limits,req,'wallet-report',120,60000);json(res,202,Wallet.reportMatch(db,user.id,await readBody(req,2048),commerceEnvironment));return;}
      if(pathname==='/api/shop/checkout'&&req.method==='POST'){throttle(limits,req,'checkout:'+user.id,20,60000);json(res,200,await payments.checkout(user.id,await readBody(req,2048)));return;}
      if(pathname==='/api/shop/orders'&&req.method==='GET'){throttle(limits,req,'payment-status:'+user.id,120,60000);json(res,200,payments.list(user.id));return;}
      const paymentOrder=pathname.match(/^\/api\/shop\/orders\/([a-f0-9-]{36})(\/reconcile)?$/);
      if(paymentOrder&&req.method==='GET'&&!paymentOrder[2]){throttle(limits,req,'payment-status:'+user.id,120,60000);json(res,200,payments.status(user.id,paymentOrder[1]));return;}
      if(paymentOrder&&req.method==='POST'&&paymentOrder[2]){throttle(limits,req,'payment-reconcile:'+user.id,20,60000);Wallet.onlyFields(await readBody(req,2048),[]);json(res,200,await payments.reconcile(user.id,paymentOrder[1]));return;}
      if(pathname==='/api/account'&&req.method==='GET'){json(res,200,{account:accountJson(db,user),serverNow:Date.now()});return;}
      if(pathname==='/api/world'&&req.method==='GET'){
        const now=Date.now(),world=refreshWorldSeason(db,user.id,now);
        if(world)Circuit.scheduleOfficial(db,user.id,world.save.seasons.current,now);
        const rows=db.prepare("SELECT id FROM tournaments WHERE user_id=? AND kind IN ('official','custom') AND status NOT IN ('COMPLETED','CANCELLED') AND deleted_at IS NULL AND (status='ACTIVE' OR starts_at<=?) ORDER BY starts_at,id").all(user.id,now+7*60000);
        const reservations=rows.map(row=>Circuit.prepareReservations(db,user.id,row.id,now)).filter(t=>t.status==='ACTIVE'||t.scheduling?.reservations?.length||t.scheduling?.conflicts?.length);
        json(res,200,{world,tournamentResetId:db.prepare('SELECT reset_id FROM tournament_state_resets WHERE reset_id=?').get(TournamentReset.RESET_ID)?.reset_id||null,tournamentReservations:reservations.map(t=>tournamentPresentation.publicTournament(t)),serverNow:now});return;
      }
      if(pathname==='/api/world'&&req.method==='PUT'){
        throttle(limits,req,'world',240,60000);
        const body=await readBody(req),baseRevision=Number(body.baseRevision);
        if(!Number.isInteger(baseRevision)||baseRevision<0)throw fail(400,'A cloud revision is required');
        const result=writeWorld(db,user.id,body.save,baseRevision);
        json(res,200,result);return;
      }
      if(pathname==='/api/world/import'&&req.method==='POST'){
        throttle(limits,req,'import',10,3600000);
        const body=await readBody(req);
        const migrated=migrateLocalWorld(body.save);
        const result=writeWorld(db,user.id,migrated,0,{importing:true,originalSave:body.save});
        json(res,201,{...result,save:migrated});return;
      }
      if(pathname==='/api/profile/participations'&&req.method==='GET'){
        json(res,200,{...ProfileParticipations.official(db,user.id),serverNow:Date.now()});return;
      }
      if(pathname==='/api/profile'&&req.method==='GET'){
        const world=refreshWorldSeason(db,user.id)?.save;
        json(res,200,{account:accountJson(db,user),career:world?.playerCareer||null,seasons:world?.seasons||null,playerSeasons:world?.playerSeasons||null,preferences:world?.config||null,loadout:world?.config?{primary:world.config.primary,sidearm:world.config.sidearm,skin:world.config.skin}:null});return;
      }
      if(pathname.startsWith('/api/bots/')&&req.method==='GET'){
        refreshWorldSeason(db,user.id);
        const id=decodeURIComponent(pathname.slice('/api/bots/'.length));if(!/^[a-z0-9_]{4,32}$/i.test(id))throw fail(400,'Invalid bot ID');
        const row=db.prepare('SELECT bot_id AS id,name,power,power_rank AS powerRank,playstyle,personality_json AS personality,form,familiarity_json AS familiarity FROM bots WHERE user_id=? AND bot_id=?').get(user.id,id);
        if(!row)throw fail(404,'Bot profile not found');
        const career=db.prepare('SELECT stats_json FROM bot_careers WHERE user_id=? AND bot_id=?').get(user.id,id);
        const weapons=db.prepare('SELECT weapon,stats_json FROM bot_weapon_stats WHERE user_id=? AND bot_id=?').all(user.id,id);
        const seasons=db.prepare('SELECT number,start_at AS startAt,end_at AS endAt,stats_json AS stats FROM seasons WHERE user_id=? ORDER BY number DESC').all(user.id).map(s=>({...s,stats:JSON.parse(s.stats)[row.name]||null}));
        json(res,200,{bot:{...row,personality:JSON.parse(row.personality),familiarity:JSON.parse(row.familiarity),career:career?JSON.parse(career.stats_json):null,weapons:Object.fromEntries(weapons.map(w=>[w.weapon,JSON.parse(w.stats_json)])),seasons}});return;
      }
      if(pathname==='/api/tournaments'&&req.method==='GET'){
        // Resolve an expired season before reading the calendar. The background
        // runtime may not have refreshed its cache yet after a long closure.
        const now=Date.now(),world=refreshWorldSeason(db,user.id,now);if(world)Circuit.scheduleOfficial(db,user.id,world.save.seasons.current,now);
        const rows=db.prepare('SELECT id FROM tournaments WHERE user_id=? AND deleted_at IS NULL ORDER BY starts_at DESC').all(user.id);
        const events=rows.map(row=>Circuit.getTournament(db,user.id,row.id));
        json(res,200,{tournaments:events.map(t=>tournamentPresentation.publicTournament(t)),tournamentResetId:db.prepare('SELECT reset_id FROM tournament_state_resets WHERE reset_id=?').get(TournamentReset.RESET_ID)?.reset_id||null,officialHistory:tournamentPresentation.officialHistory(db,events),earnings:db.prepare('SELECT participant_id AS participantId,SUM(amount) AS amount FROM tournament_earnings e JOIN tournaments t ON t.id=e.tournament_id WHERE t.user_id=? GROUP BY participant_id').all(user.id),serverNow:now});return;
      }
      if(pathname==='/api/tournaments'&&req.method==='POST'){
        const body=await readBody(req,8192),now=Date.now(),t=Circuit.createCustom(db,user.id,body,now);
        Circuit.registerTeam(db,user.id,t.id,{name:user.username+' Circuit',participantIds:[user.id]},now);json(res,201,{tournament:tournamentPresentation.publicTournament(Circuit.getTournament(db,user.id,t.id))});return;
      }
      const circuitRoute=pathname.match(/^\/api\/tournaments\/([a-zA-Z0-9-]+)(?:\/(team|invite|start|play|check-in|ready|heartbeat|result))?$/);
      if(circuitRoute){const [,id,action]=circuitRoute,now=Date.now();
        if(req.method==='DELETE'&&!action){const body=await readBody(req,8192),value=Circuit.deleteCustom(db,user.id,id,body.confirmedName,now,adminAuthorized(req));tournamentRuntime.cancel(db,id);json(res,200,value);return;}
        if(req.method==='GET'&&!action){const t=Circuit.getTournament(db,user.id,id);json(res,200,{...tournamentPresentation.detail(db,t,tournamentRuntime.presentationGames(db,t.id),now),serverNow:now});return;}
        if(req.method==='POST'){const body=await readBody(req,262144);let value;
          if(action==='team')value=Circuit.registerTeam(db,user.id,id,{name:body.name,participantIds:[user.id]},now);
          else if(action==='invite'){const team=Circuit.getTournament(db,user.id,id).teams.find(team=>team.id===body.teamId);if(!team?.participants.some(p=>p.id===user.id))throw fail(403,'You may invite bots to your own team');value=Circuit.inviteBot(db,user.id,id,body,now);}
          else if(action==='start'){let t=Circuit.getTournament(db,user.id,id);if(t.kind==='custom')value=Circuit.advanceCustom(db,user.id,id,now);else{t=tournamentRuntime.fillBots(db,user.id,t,now);value=Circuit.startTournament(db,user.id,id,now);}}
          else if(action==='check-in'){value=Circuit.checkIn(db,user.id,id,{gameId:body.gameId},now);}
          else if(action==='play'){json(res,200,{context:tournamentRuntime.playContext(db,user.id,id,now,body),serverNow:now});return;}
          else if(action==='ready'){json(res,200,{context:tournamentRuntime.ready(db,user.id,id,body,now),serverNow:now});return;}
          else if(action==='heartbeat'){json(res,200,{...tournamentRuntime.heartbeat(db,user.id,id,body,now),serverNow:now});return;}
          else if(action==='result'){Circuit.getTournament(db,user.id,id);const recorded=db.prepare('SELECT series_id FROM tournament_matches WHERE tournament_id=? AND id=?').get(id,body.result?.id||'');if(!recorded){tournamentRuntime.validateClientResult(db,user.id,id,body.seriesId,body.result,body,now);}else if(recorded.series_id!==body.seriesId)throw fail(409,'This result belongs to a different series');value=Circuit.recordGame(db,user.id,id,body.seriesId,body.result,now);}
          else throw fail(404,'Tournament action not found');json(res,200,{tournament:tournamentPresentation.publicTournament(value),serverNow:now});return;
        }
      }
      if(pathname==='/api/admin/tournaments'&&req.method==='POST'){
        if(!adminAuthorized(req))throw fail(403,'Admin token is required');
        const body=await readBody(req,32768),status=String(body.status||'ANNOUNCED'),name=String(body.name||'').trim().replace(/[<>]/g,'').slice(0,100),startsAt=Number(body.startsAt);
        if(!name||!Number.isFinite(startsAt)||startsAt<=0||!['ANNOUNCED','REGISTRATION','UPCOMING','ACTIVE','COMPLETED'].includes(status))throw fail(400,'Invalid tournament details');
        const id=crypto.randomUUID(),now=Date.now(),participants=Array.isArray(body.participants)?body.participants.slice(0,50):[];
        if(new Set(participants).size!==participants.length||participants.some(botId=>typeof botId!=='string'))throw fail(400,'Tournament participants must be unique bot IDs');
        db.exec('BEGIN IMMEDIATE');
        try{
          db.prepare('INSERT INTO tournaments(id,user_id,name,starts_at,status,bracket_json,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,user.id,name,startsAt,status,JSON.stringify(body.bracket||{}),JSON.stringify(body.metadata||{}),now,now);
          const results=body.metadata?.results;
          if(status==='COMPLETED'&&results){const winner=results.winnerBotId,eliminated=results.eliminatedBotIds||[];if(typeof winner!=='string'||!participants.includes(winner)||!Array.isArray(eliminated)||eliminated.some(bot=>!participants.includes(bot)||bot===winner)||new Set(eliminated).size!==eliminated.length)throw fail(400,'Tournament results must identify actual registered bots')}
          for(const [index,botId] of participants.entries()){
            const exists=db.prepare('SELECT 1 AS yes FROM bots WHERE user_id=? AND bot_id=?').get(user.id,String(botId));if(!exists)throw fail(400,'Tournament includes an unknown bot');
            db.prepare('INSERT INTO tournament_participants(tournament_id,bot_id,seed,state) VALUES(?,?,?,?)').run(id,botId,index+1,'INVITED');
          }
          db.exec('COMMIT');
        }catch(error){db.exec('ROLLBACK');throw error;}
        json(res,201,{id,name,startsAt,status,participants});return;
      }
      throw fail(404,'API route not found');
    }catch(error){
      if(res.headersSent){res.destroy();return;}
      const status=Number(error.status)||500;
      if(status>=500)console.error(error.paymentSafe?'Payment service: '+error.code:'Server error:',error.paymentSafe?'':error);
      json(res,status,{error:status>=500&&!error.paymentSafe?'Server error':error.message,...(error.code?{code:error.code}:{}),serverNow:Date.now()});
    }
  });
  let stopTournaments=()=>{};server.on('listening',()=>{stopTournaments=tournamentRuntime.start(db);payments.verifyConfiguration().catch(error=>{if(error.code!=='CHECKOUT_UNAVAILABLE')console.error('Sandbox checkout unavailable: '+error.code);});});
  server.on('close',()=>{stopTournaments();});
  return {server,db,payments};
}
if(require.main===module){
  const host=process.env.SAR_HOST||'127.0.0.1',port=Number(process.env.SAR_PORT||8803);
  const app=createServer();
  app.server.listen(port,host,()=>console.log('Skirmish server listening on '+host+':'+port+' (database schema '+app.db.prepare('PRAGMA user_version').get().user_version+')'));
}
module.exports={createServer};
