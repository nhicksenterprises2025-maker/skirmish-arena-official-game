'use strict';
// A deployment administrator imports a consistent read-only local SQL snapshot.
// This endpoint never accepts a player's claimed rewards or creates sessions.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {LATEST_DB_SCHEMA}=require('./db.cjs');
const FORMAT='skirmish-trusted-cloud-bootstrap-v1',MAX_COMPRESSED=32*1024*1024,MAX_EXPANDED=64*1024*1024;
const OMITTED=new Set(['sessions','world_backups','world_versions','replay_records','replay_access','replay_captures','replay_preferences']);
const GENERATED=new Set(['save_migrations','game_versions','tournament_state_resets','map_pool_config']);
const q=name=>'"'+String(name).replaceAll('"','""')+'"';
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const record=v=>v&&typeof v==='object'&&!Array.isArray(v);
function tables(db){return db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);}
function columns(db,table){return db.prepare('PRAGMA table_info('+q(table)+')').all();}
function order(db,table){const c=columns(db,table),primary=c.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);return (primary.length?primary:c.map(c=>c.name)).map(q).join(',');}
function scalar(value){return value instanceof Uint8Array?{blob:Buffer.from(value).toString('base64')}:value;}
function decodeScalar(value){if(record(value)&&Object.keys(value).length===1&&typeof value.blob==='string'&&/^[A-Za-z0-9+/]*={0,2}$/.test(value.blob))return Buffer.from(value.blob,'base64');if(value===null||typeof value==='string'||typeof value==='number'&&Number.isFinite(value))return value;throw fail(400,'An imported SQL value is invalid');}
function exportSnapshot(db,{sourcePath,now=Date.now()}={}){
 if(typeof sourcePath!=='string'||!path.isAbsolute(sourcePath))throw Error('An explicit retained source database path is required');
 const schema=db.prepare('PRAGMA user_version').get().user_version;if(schema<11||schema>LATEST_DB_SCHEMA)throw Error('The source account database requires a compatible current release');
 const inventory=tables(db),output={},definitions={},rowCounts={},omissions=[];
 db.exec('BEGIN');try{
  for(const table of inventory){
   if(table==='cloud_bootstrap_receipts')continue;
   if(OMITTED.has(table)){const count=db.prepare('SELECT count(*) AS n FROM '+q(table)).get().n;omissions.push({table,rows:count,reason:table.startsWith('replay_')?'Replay recordings remain in the untouched source database and its private replay directory; they are not account or reward history.':table==='sessions'?'Fresh cloud sign-in uses the existing credentials; local sessions are never transferred.':'Redundant revision snapshots remain recoverable in the untouched original database.',retainedAt:sourcePath});continue;}
   definitions[table]=columns(db,table).map(c=>c.name);output[table]=db.prepare('SELECT * FROM '+q(table)+' ORDER BY '+order(db,table)).all().map(row=>Object.fromEntries(definitions[table].map(name=>[name,scalar(row[name])])));rowCounts[table]=output[table].length;
  }
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('The retained source database has unresolved references');
  const archives=(output.retired_feature_archives||[]).map(row=>({feature:row.feature,sha256:row.sha256,bytes:row.bytes,retainedAt:row.archive_file}));
  const manifest={schema:1,createdAt:now,source:{schemaVersion:schema,path:sourcePath,bytes:fs.statSync(sourcePath).size,originalRetained:true},rowCounts,columns:definitions,omissions,externalArchives:archives};
  const packageData={format:FORMAT,manifest,tables:output},raw=Buffer.from(JSON.stringify(packageData));if(raw.length>MAX_EXPANDED)throw Error('The trusted snapshot exceeds the supported expanded size');
  const compressed=zlib.gzipSync(raw,{level:6});if(compressed.length>MAX_COMPRESSED)throw Error('The trusted snapshot exceeds the supported compressed size');db.exec('COMMIT');return {packageData,raw,compressed,sha256:hash(raw),compressedSha256:hash(compressed)};
 }catch(error){db.exec('ROLLBACK');throw error;}
}
function parsePackage(buffer){
 if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>MAX_COMPRESSED)throw fail(413,'The trusted import exceeds the compressed size limit');let raw,value;
 try{raw=zlib.gunzipSync(buffer,{maxOutputLength:MAX_EXPANDED});}catch(error){throw fail(error.code==='ERR_BUFFER_TOO_LARGE'?413:400,'The trusted import is not valid bounded gzip data');}
 try{value=JSON.parse(raw.toString('utf8'));}catch{throw fail(400,'The trusted import is not valid JSON');}
 return {value,sha256:hash(raw)};
}
function verifyPackage(db,payload){
 const {manifest,tables:rows}=payload||{},available=new Set(tables(db));
 if(payload?.format!==FORMAT||!record(manifest)||manifest.schema!==1||!record(manifest.source)||manifest.source.originalRetained!==true||!Number.isInteger(manifest.source.schemaVersion)||manifest.source.schemaVersion<11||manifest.source.schemaVersion>LATEST_DB_SCHEMA||!record(manifest.columns)||!record(manifest.rowCounts)||!Array.isArray(manifest.omissions)||!record(rows))throw fail(400,'The trusted import manifest is incompatible');
 if(!Array.isArray(rows.users)||!rows.users.length||!Array.isArray(rows.worlds)||!rows.worlds.length)throw fail(400,'The trusted import must contain authenticated accounts and their saved worlds');
 for(const table of Object.keys(rows)){
  if(!/^[a-z][a-z0-9_]*$/.test(table)||!available.has(table)||OMITTED.has(table)||table==='cloud_bootstrap_receipts')throw fail(400,'The trusted import contains an unsupported table');
  const allowed=columns(db,table).map(c=>c.name),imported=manifest.columns[table];
  if(!Array.isArray(imported)||!imported.length||new Set(imported).size!==imported.length||imported.some(name=>!allowed.includes(name))||!Array.isArray(rows[table])||rows[table].length!==manifest.rowCounts[table])throw fail(400,'The trusted import table definition is inconsistent');
  for(const row of rows[table])if(!record(row)||Object.keys(row).length!==imported.length||imported.some(name=>!Object.hasOwn(row,name)))throw fail(400,'The trusted import row is inconsistent');
 }
 for(const name of ['sessions','world_backups'])if(!manifest.omissions.some(item=>item.table===name&&Number.isSafeInteger(item.rows)&&item.rows>=0&&typeof item.retainedAt==='string'&&item.retainedAt===manifest.source.path))throw fail(400,'The original recovery and session exclusions must be documented');
 for(const required of [...available].filter(name=>!name.startsWith('mp_')&&name!=='cloud_bootstrap_receipts'&&!OMITTED.has(name)&&!(name==='map_pool_config'&&manifest.source.schemaVersion<13)&&!((name==='factions'||name.startsWith('faction_'))&&manifest.source.schemaVersion<16)&&!(name.startsWith('weapon_mastery_')&&manifest.source.schemaVersion<15)&&!(manifest.source.schemaVersion<14&&['ranked_reward_claims','ranked_reward_definitions','ranked_reward_equipment','ranked_season_definitions','ranked_season_records'].includes(name))))if(!Object.hasOwn(rows,required))throw fail(400,'An authoritative history table is missing');
 if(manifest.source.schemaVersion>=12)for(const name of [...available].filter(name=>name.startsWith('mp_')))if(!Object.hasOwn(rows,name))throw fail(400,'An authoritative multiplayer table is missing');
 return {manifest,rows,available};
}
function receipt(db,digest){const row=db.prepare('SELECT * FROM cloud_bootstrap_receipts WHERE sha256=?').get(digest);return row?{id:row.id,sha256:row.sha256,sourceSchema:row.source_schema,rowCounts:JSON.parse(row.row_counts_json),omissions:JSON.parse(row.omissions_json),importedAt:row.imported_at}:null;}
function importSnapshot(db,buffer,{now=Date.now()}={}){
 const {value,sha256}=parsePackage(buffer),existing=receipt(db,sha256);if(existing)return {imported:false,replayed:true,receipt:existing};
 if(db.prepare('SELECT 1 FROM cloud_bootstrap_receipts LIMIT 1').get())throw fail(409,'This deployment has already consumed its trusted bootstrap');
 const {manifest,rows,available}=verifyPackage(db,value);
 for(const table of available)if(!GENERATED.has(table)&&table!=='cloud_bootstrap_receipts'&&db.prepare('SELECT 1 FROM '+q(table)+' LIMIT 1').get())throw fail(409,'Trusted bootstrap requires an empty account database');
 db.exec('BEGIN IMMEDIATE');try{
  db.exec('PRAGMA defer_foreign_keys=ON');
  // Transfer already-settled ledger rows as history. Replaying their live
  // balance triggers would award/debit the same money again. These two exact
  // existing trigger definitions are restored in this same transaction;
  // immutability guards stay active, and rollback restores every trigger.
  const balanceTriggers=['ac_ledger_valid_balance','ac_ledger_apply_balance'].map(name=>db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND name=?").get(name));
  if(balanceTriggers.some(trigger=>!trigger))throw fail(400,'The cloud wallet validation schema is incompatible');
  for(const trigger of balanceTriggers)db.exec('DROP TRIGGER '+q(trigger.name));
  for(const [table,data] of Object.entries(rows)){
   const fields=manifest.columns[table],primary=columns(db,table).filter(c=>c.pk).map(c=>c.name),updates=fields.filter(field=>!primary.includes(field));
   const statement=db.prepare('INSERT INTO '+q(table)+'('+fields.map(q).join(',')+') VALUES('+fields.map(()=>'?').join(',')+')'+(GENERATED.has(table)?' ON CONFLICT DO '+(updates.length?'UPDATE SET '+updates.map(field=>q(field)+'=excluded.'+q(field)).join(','):'NOTHING'):''));
   for(const row of data)statement.run(...fields.map(field=>decodeScalar(row[field])));
  }
  for(const trigger of balanceTriggers)db.exec(trigger.sql);
  if(db.prepare('PRAGMA foreign_key_check').all().length||db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw fail(400,'The trusted import did not pass database integrity validation');
  for(const table of Object.keys(rows))if(!GENERATED.has(table)&&db.prepare('SELECT count(*) AS n FROM '+q(table)).get().n!==manifest.rowCounts[table])throw fail(400,'The trusted import did not preserve its record counts');
  if(db.prepare('SELECT count(*) AS n FROM sessions').get().n!==0||db.prepare('SELECT count(*) AS n FROM world_backups').get().n!==0)throw fail(400,'Cloud bootstrap cannot transfer local sessions or redundant snapshots');
  const id=crypto.randomUUID();db.prepare('INSERT INTO cloud_bootstrap_receipts(id,sha256,source_schema,row_counts_json,omissions_json,imported_at) VALUES(?,?,?,?,?,?)').run(id,sha256,manifest.source.schemaVersion,JSON.stringify(manifest.rowCounts),JSON.stringify(manifest.omissions),now);db.exec('COMMIT');return {imported:true,replayed:false,receipt:receipt(db,sha256)};
 }catch(error){db.exec('ROLLBACK');if(error.status)throw error;throw fail(400,'The trusted import failed SQL validation; no account changes were committed');}
}
function authorized(req){
 const secret=process.env.SAR_CLOUD_BOOTSTRAP_TOKEN,provided=/^Bearer ([^\s]+)$/.exec(String(req.headers.authorization||''))?.[1];if(typeof secret!=='string'||secret.length<32||secret.length>256||typeof provided!=='string')return false;
 const a=Buffer.from(secret),b=Buffer.from(provided);return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function pending(db){return !!process.env.SAR_CLOUD_BOOTSTRAP_TOKEN&&!db.prepare('SELECT 1 FROM cloud_bootstrap_receipts LIMIT 1').get();}
function readCompressed(req){return new Promise((resolve,reject)=>{let size=0;const chunks=[];req.on('data',chunk=>{size+=chunk.length;if(size<=MAX_COMPRESSED)chunks.push(chunk);});req.on('end',()=>size>MAX_COMPRESSED?reject(fail(413,'The trusted import exceeds the compressed size limit')):resolve(Buffer.concat(chunks)));req.on('error',()=>reject(fail(400,'The trusted import connection was interrupted')));});}
function reply(res,status,data){const text=JSON.stringify(data);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(text);}
async function handle(req,res,db){
 if(new URL(req.url,'http://localhost').pathname!=='/api/admin/cloud-bootstrap')return false;
 try{
  if(req.method!=='POST')throw fail(405,'Trusted cloud bootstrap accepts POST only');
  if(!(req.socket.encrypted||process.env.SAR_TRUST_PROXY==='1'&&req.headers['x-forwarded-proto']==='https'))throw fail(403,'Trusted cloud bootstrap requires HTTPS');
  if(!authorized(req))throw fail(403,'Trusted cloud bootstrap is not authorized');
  if(String(req.headers['content-type']||'').split(';')[0]!=='application/gzip')throw fail(415,'The trusted import must use application/gzip');
  const result=importSnapshot(db,await readCompressed(req));reply(res,200,{ok:true,...result});
 }catch(error){reply(res,error.status||500,{error:error.status?error.message:'Trusted cloud bootstrap could not complete; original data is preserved'});}return true;
}
module.exports={handle,pending,exportSnapshot,importSnapshot,parsePackage,FORMAT,MAX_COMPRESSED,MAX_EXPANDED};
