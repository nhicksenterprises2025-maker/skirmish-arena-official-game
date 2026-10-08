'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const startup=require('./startup-status.cjs');
const TABLES=Object.freeze(['messages','conversation_summaries','structured_events','ai_preferences','bot_social_profiles','ai_jobs','ai_generations','ai_training_feedback']);
// Called while the migration owns BEGIN IMMEDIATE: no writer can change the
// rows between their durable export and table retirement. The archive is kept
// beside the private database, never served or included in application assets.
function archiveMessages(db,file){
  startup.forDatabase(file,'archive');
  const tables=TABLES.filter(table=>db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(table));
  const counts=Object.fromEntries(tables.map(table=>[table,db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n]));
  if(!Object.values(counts).some(Boolean))return null;
  if(file===':memory:')throw new Error('A persistent archive location is required before retiring saved messages');
  const at=Date.now(),target=path.resolve(file)+'.pre-messages-retirement9-'+new Date(at).toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID()+'.jsonl';
  const partial=target+'.partial';
  startup.forDatabase(file,'archive',{artifactPath:partial});
  const fd=fs.openSync(partial,'wx',0o600),hash=crypto.createHash('sha256');let bytes=0,closed=false;
  const write=value=>{const line=Buffer.from(JSON.stringify(value)+'\n');let offset=0;while(offset<line.length)offset+=fs.writeSync(fd,line,offset,line.length-offset);hash.update(line);bytes+=line.length;};
  try{
    write({type:'archive',format:1,feature:'messages',sourceSchema:db.prepare('PRAGMA user_version').get().user_version,createdAt:at,rowCounts:counts});
    for(const table of tables){write({type:'table',table,sql:db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").get(table).sql});for(const row of db.prepare('SELECT * FROM '+table).iterate())write({type:'row',table,row});}
    const digest=hash.digest('hex');fs.fsyncSync(fd);fs.closeSync(fd);closed=true;
    startup.forDatabase(file,'archive-verify',{artifactPath:partial});
    const verify=crypto.createHash('sha256'),check=fs.openSync(partial,'r'),chunk=Buffer.alloc(65536);let total=0;
    try{let n;while((n=fs.readSync(check,chunk,0,chunk.length,null))>0){verify.update(chunk.subarray(0,n));total+=n;}}finally{fs.closeSync(check);}
    if(total!==bytes||verify.digest('hex')!==digest)throw new Error('Message archive verification failed; original tables were retained');
    fs.renameSync(partial,target);
    return {file:path.basename(target),sha256:digest,bytes,rowCounts:counts,createdAt:at};
  }finally{if(!closed)fs.closeSync(fd);}
}
module.exports={archiveMessages,TABLES};
