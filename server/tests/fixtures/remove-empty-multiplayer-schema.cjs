'use strict';
// Reconstruct old isolated fixture databases accurately when testing a previous
// migration. This helper cannot delete populated networking records or touch
// an installed database.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
module.exports=function removeEmptyMultiplayerSchema(db,{fromVersion=12}={}){
 assert([12,13].includes(fromVersion),'Only known previous test schema boundaries may be reconstructed');
 const file=db.prepare('PRAGMA database_list').all().find(row=>row.name==='main').file;
 assert(!file||path.resolve(file).startsWith(path.resolve(os.tmpdir())+path.sep),'Only temporary test databases may reconstruct an old schema');
 const source=['012_human_multiplayer.sql','013_map_ecosystem.sql','014_competitive_progression.sql','015_weapon_mastery.sql','016_factions.sql','017_replays.sql'].filter(name=>Number(name.slice(0,3))>=fromVersion).map(name=>fs.readFileSync(path.join(__dirname,'../../migrations',name),'utf8')).join('\n'),tables=[...source.matchAll(/CREATE TABLE (\w+)\s*\(/g)].map(match=>match[1]);
 for(const table of tables)if(db.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(table))assert.equal(db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n,0,'Fixture must not discard '+table+' records');
 for(const table of tables.reverse())db.exec('DROP TABLE IF EXISTS '+table);
 db.prepare('DELETE FROM save_migrations WHERE version>=?').run(fromVersion);
};
