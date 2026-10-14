'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
module.exports=function removeEmptyReplaySchema(db){
 const file=db.prepare('PRAGMA database_list').all().find(row=>row.name==='main').file;
 assert(!file||path.resolve(file).startsWith(path.resolve(os.tmpdir())+path.sep),'Only temporary test databases may reconstruct an old schema');
 for(const table of ['replay_access','replay_records','replay_captures','replay_preferences'])if(db.prepare('SELECT 1 FROM sqlite_schema WHERE name=?').get(table)){assert.equal(db.prepare('SELECT count(*) n FROM '+table).get().n,0,'Fixture must not discard '+table+' records');db.exec('DROP TABLE '+table);}
 db.exec('DELETE FROM save_migrations WHERE version=17');
};
