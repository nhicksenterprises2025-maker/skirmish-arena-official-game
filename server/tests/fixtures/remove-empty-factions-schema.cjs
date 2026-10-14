'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
module.exports=function removeEmptyFactionsSchema(db){
 require('./remove-empty-replays-schema.cjs')(db);
 const file=db.prepare('PRAGMA database_list').all().find(row=>row.name==='main').file;
 assert(!file||path.resolve(file).startsWith(path.resolve(os.tmpdir())+path.sep),'Only temporary test databases may reconstruct an old schema');
 const tables=[...fs.readFileSync(path.join(__dirname,'../../migrations/016_factions.sql'),'utf8').matchAll(/CREATE TABLE (\w+)\(/g)].map(m=>m[1]);
 for(const table of tables)if(db.prepare('SELECT 1 FROM sqlite_schema WHERE name=?').get(table))assert.equal(db.prepare('SELECT COUNT(*) n FROM '+table).get().n,0,'Fixture must not discard '+table+' records');
 for(const table of tables.reverse())db.exec('DROP TABLE IF EXISTS '+table);
 db.exec('DELETE FROM save_migrations WHERE version=16');
};
