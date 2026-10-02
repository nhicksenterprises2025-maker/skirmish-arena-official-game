'use strict';
// Disposable loopback-only browser fixture. Old release bytes stay in memory;
// the actual installed project supplies the new release and account API.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),bcrypt=require('bcryptjs');
const {createDatabase,upsertWorldTables}=require('../server/db.cjs'),{createServer}=require('../server/index.cjs'),{engine}=require('./simulate.cjs');
const zip=fs.readFileSync(path.resolve(__dirname,'../../skirmish-arena-reimagined-live-update-1.5.0-pwa.zip'));
let end=zip.length-22;while(end>=Math.max(0,zip.length-65557)&&zip.readUInt32LE(end)!==0x06054b50)end--;
if(end<0)throw Error('Original release archive is unavailable');
const entries=[];let offset=zip.readUInt32LE(end+16);
for(let i=0;i<zip.readUInt16LE(end+10);i++){
  if(zip.readUInt32LE(offset)!==0x02014b50)throw Error('Invalid ZIP directory');
  const length=zip.readUInt16LE(offset+28),extra=zip.readUInt16LE(offset+30),comment=zip.readUInt16LE(offset+32);
  entries.push({name:zip.subarray(offset+46,offset+46+length).toString('utf8').replaceAll('\\','/'),method:zip.readUInt16LE(offset+10),size:zip.readUInt32LE(offset+20),at:zip.readUInt32LE(offset+42)});offset+=46+length+extra+comment;
}
function oldFile(name){
  const entry=entries.filter(e=>e.name===name||e.name.endsWith('/'+name)).sort((a,b)=>a.name.length-b.name.length)[0];if(!entry)return null;
  const at=entry.at+30+zip.readUInt16LE(entry.at+26)+zip.readUInt16LE(entry.at+28),data=zip.subarray(at,at+entry.size);
  if(entry.method===0)return data;if(entry.method===8)return zlib.inflateRawSync(data);throw Error('Unsupported ZIP method');
}
const oldSource=oldFile('game.js').toString('utf8'),old=engine({},oldSource);for(let i=0;i<300;i++)old.step();const save=JSON.parse(JSON.stringify(old.context.SAR.getUniverse()));
const db=createDatabase(':memory:'),id='pwa-upgrade-fixture',now=Date.now();
db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,'UpdateAudit','updateaudit',bcrypt.hashSync('Local-Update-Check-151',4),now,now);
db.prepare('INSERT INTO worlds(user_id,revision,schema_version,save_json,updated_at,season_start_at,season_end_at) VALUES(?,?,?,?,?,?,?)').run(id,1,save.schema,JSON.stringify(save),now,save.seasons.current.startAt,save.seasons.current.endAt);upsertWorldTables(db,id,save,now);
const app=createServer({db}),handler=app.server.listeners('request')[0];app.server.removeAllListeners('request');let published=false;
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
app.server.on('request',(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/__fixture/publish'&&req.method==='POST'){published=true;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({published:true,version:'1.5.1'}));return;}
  if(url.pathname==='/__fixture/status'){const row=db.prepare('SELECT revision,save_json FROM worlds WHERE user_id=?').get(id),world=JSON.parse(row.save_json);res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({published,revision:row.revision,weapons:Object.keys(world.patchState.weaponStats).length,patch:world.patchState.id,archives:world.patchArchives.length,kills:Object.values(world.bots).reduce((n,b)=>n+b.career.kills,0)}));return;}
  if(!published&&!url.pathname.startsWith('/api/')){
    const name=url.pathname==='/'?'index.html':url.pathname.slice(1),bytes=oldFile(name);
    if(bytes){res.writeHead(200,{'content-type':types[path.extname(name)]||'application/octet-stream','cache-control':'no-store'});res.end(bytes);return;}
  }
  handler(req,res);
});
app.server.listen(8805,'127.0.0.1',()=>console.log('Disposable PWA upgrade fixture ready: http://127.0.0.1:8805/; UpdateAudit / Local-Update-Check-151; original11 weapons → new12.'));
