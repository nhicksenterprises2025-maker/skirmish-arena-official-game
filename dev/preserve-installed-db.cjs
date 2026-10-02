'use strict';
// Read-only snapshot and exact original-column hashes for the installed DB migration.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{DatabaseSync,backup}=require('node:sqlite');
const file=path.join(process.env.LOCALAPPDATA,'SkirmishArenaServer','skirmish.sqlite'),evidence=path.join(__dirname,'installed-db-1.5.2.json');
const quote=s=>'"'+s.replaceAll('"','""')+'"',hash=s=>crypto.createHash('sha256').update(s).digest('hex');
async function main(){const db=new DatabaseSync(file,{readOnly:true});try{
  if(process.argv[2]==='before'){
    const dir=path.join(path.dirname(file),'backups');fs.mkdirSync(dir,{recursive:true});const destination=path.join(dir,'pre-1.5.2-'+Date.now()+'.sqlite');await backup(db,destination);
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>{const columns=db.prepare('PRAGMA table_info('+quote(name)+')').all().map(c=>c.name),rows=db.prepare('SELECT '+columns.map(quote).join(',')+' FROM '+quote(name)+' ORDER BY rowid').all();return {name,columns,rows:rows.length,hash:hash(JSON.stringify(rows))};});
    const report={file,backup:destination,beforeSchema:db.prepare('PRAGMA user_version').get().user_version,integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,tables};fs.writeFileSync(evidence,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({schema:report.beforeSchema,integrity:report.integrity,backup:destination,counts:tables.map(t=>[t.name,t.rows])}));
  }else if(process.argv[2]==='after'){
    const report=JSON.parse(fs.readFileSync(evidence)),checks=report.tables.filter(t=>t.name!=='save_migrations').map(t=>{const rows=db.prepare('SELECT '+t.columns.map(quote).join(',')+' FROM '+quote(t.name)+' ORDER BY rowid').all();return {table:t.name,rows:rows.length,unchanged:hash(JSON.stringify(rows))===t.hash};});
    report.afterSchema=db.prepare('PRAGMA user_version').get().user_version;report.afterIntegrity=db.prepare('PRAGMA integrity_check').get().integrity_check;report.originalRecords=checks;report.socialProfiles=db.prepare('SELECT COUNT(*) AS n FROM bot_social_profiles').get().n;report.preserved=checks.every(c=>c.unchanged)&&report.afterSchema===3&&report.afterIntegrity==='ok';fs.writeFileSync(evidence,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({preserved:report.preserved,schema:report.afterSchema,integrity:report.afterIntegrity,socialProfiles:report.socialProfiles,changed:checks.filter(c=>!c.unchanged)}));if(!report.preserved)process.exitCode=1;
  }else throw Error('Use before or after');
}finally{db.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
