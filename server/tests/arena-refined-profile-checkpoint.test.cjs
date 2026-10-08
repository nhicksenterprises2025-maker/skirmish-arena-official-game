'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),zlib=require('node:zlib'),v8=require('node:v8'),Module=require('node:module');
const {createDatabase}=require('../db.cjs'),{writeWorld,readWorld}=require('../world.cjs'),Circuit=require('../tournaments.cjs'),Runtime=require('../tournament-runtime.cjs');
const root=path.resolve(__dirname,'../..'),runtimeFile=path.join(root,'server/tournament-runtime.cjs'),runtimeSource=fs.readFileSync(runtimeFile,'utf8'),archive=require('./fixtures/arena-refined-pre-profile-sources.json');
const copy=v=>JSON.parse(JSON.stringify(v)),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function writeFiles(directory,legacy){
 for(const file of ['dev/simulate.cjs','game.js','progression.js','tactical-instinct.js','match-modes.js','team-presentation.js','profile-stats.js','distance-units.js']){
  let bytes;if(legacy&&archive.files[file]){const record=archive.files[file];bytes=zlib.inflateSync(Buffer.from(record.deflate,'base64'));assert.equal(bytes.length,record.bytes);assert.equal(hash(bytes),record.sha256);}else bytes=fs.readFileSync(path.join(root,file));
  const output=path.join(directory,file);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,bytes);
 }
}
function fixtureRuntime(directory){
 // Only environment paths differ: execute the real runtime against the actual
 // archived engine/helpers, including its normal checkpoint/finalizer paths.
 const filename=path.join(root,'server/.isolated-profile-checkpoint-'+crypto.randomUUID()+'.cjs'),instance=new Module(filename,module);instance.filename=filename;instance.paths=Module._nodeModulePaths(path.dirname(filename));
 let source=runtimeSource.replace("require('../dev/simulate.cjs')",'require('+JSON.stringify(path.join(directory,'dev/simulate.cjs'))+')').replace("const gamePath=path.join(__dirname,'../game.js');",'const gamePath='+JSON.stringify(path.join(directory,'game.js'))+';').replace("path.join(__dirname,'..',file)",'path.join('+JSON.stringify(directory)+',file)');
 if(hash(fs.readFileSync(path.join(directory,'dev/simulate.cjs')))===archive.files['dev/simulate.cjs'].sha256)source=source.replace("'team-presentation.js','distance-units.js']","'team-presentation.js']");
 assert.notEqual(source,runtimeSource);instance._compile(source,filename);return instance.exports;
}
function fixture(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sar-profile-checkpoint-')),legacyDirectory=path.join(directory,'legacy');writeFiles(legacyDirectory,true);const previous=fixtureRuntime(legacyDirectory),engine=require(path.join(legacyDirectory,'dev/simulate.cjs')).engine,world=engine().context.SAR.getUniverse(),now=world.seasons.current.startAt+3600000,owner='checkpoint-profile-fixture',file=path.join(directory,'original.sqlite'),db=createDatabase(file);
 db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(owner,owner,owner,'isolated-placeholder',now,now);// Seed the exact already-installed Balance 8 world before the updated validator
 // opens it; a fresh old-patch upload is intentionally rejected in production.
 db.prepare('INSERT INTO worlds(user_id,revision,schema_version,save_json,updated_at,season_start_at,season_end_at) VALUES(?,?,?,?,?,?,?)').run(owner,1,world.schema,JSON.stringify(world),now,world.seasons.current.startAt,world.seasons.current.endAt);writeWorld(db,owner,world,1);let t=Circuit.createCustom(db,owner,{name:'Preserved Checkpoint',startsAt:now},now);t=previous.fillBots(db,owner,t,now);t=Circuit.startTournament(db,owner,t.id,now);previous.advance(db,{now,budget:300});const active=previous.activeGames(db)[0];assert.ok(active);assert.equal(active.steps,300);
 const original=metadata(db,t.id);assert.equal(original.runtimeGames[active.gameId].sourceHash,archive.files['game.js'].sha256);for(const name of ['dev/simulate.cjs','progression.js'])assert.equal(original.runtimeGames[active.gameId].dependencies[name],archive.files[name].sha256);
 const opened=[],open=file=>{const result=createDatabase(file);opened.push(result);return result;};return {directory,legacyDirectory,previous,db,owner,t,now,active,original,world,open,clone(name,record=original){const recorded=JSON.stringify(record);db.prepare('UPDATE tournaments SET metadata_json=? WHERE id=?').run(recorded,t.id);const target=path.join(directory,name+'.sqlite');db.prepare('VACUUM INTO ?').run(target);db.prepare('UPDATE tournaments SET metadata_json=? WHERE id=?').run(JSON.stringify(original),t.id);return open(target);},close(){for(const item of opened)if(item.isOpen)item.close();db.close();assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});}};
}
function metadata(db,id){return JSON.parse(db.prepare('SELECT metadata_json FROM tournaments WHERE id=?').get(id).metadata_json);}
function payload(db,t,id){return v8.deserialize(zlib.inflateSync(Buffer.from(metadata(db,t).runtimeGames[id].data,'base64')));}
test('Exact pre-profile helpers resume the actual old-source checkpoint identically and finalize its result once',()=>{
 const f=fixture();try{
  let reopened=f.clone('updated');const before=payload(f.db,f.t.id,f.active.gameId);Runtime.advance(reopened,{now:f.now+5000,budget:0});const restored=Runtime.activeGames(reopened)[0];assert.equal(restored.resumed,true);assert.deepEqual({...restored,resumed:false},f.active);assert.deepEqual(payload(reopened,f.t.id,f.active.gameId),before,'No rewritten snapshot counters/references on compatibility conversion');
  const promoted=metadata(reopened,f.t.id).runtimeGames[f.active.gameId];for(const name of ['dev/simulate.cjs','progression.js'])assert.equal(promoted.dependencies[name],hash(fs.readFileSync(path.join(root,name))));assert.equal(promoted.sourceHash,f.original.runtimeGames[f.active.gameId].sourceHash);assert.equal(promoted.format,f.original.runtimeGames[f.active.gameId].format);assert.equal(promoted.bindingVersion,f.original.runtimeGames[f.active.gameId].bindingVersion);
  const secondFile=path.join(f.directory,'promoted-restart.sqlite');reopened.prepare('VACUUM INTO ?').run(secondFile);reopened.close();reopened=f.open(secondFile);Runtime.advance(reopened,{now:f.now+5500,budget:0});assert.equal(Runtime.activeGames(reopened)[0].resumed,true);assert.deepEqual(payload(reopened,f.t.id,f.active.gameId),before,'A second restart restores the promoted identity without another conversion or lost state');assert.deepEqual(metadata(reopened,f.t.id).runtimeGames[f.active.gameId].dependencies,promoted.dependencies);
  f.previous.advance(f.db,{now:f.now+6000,budget:90});Runtime.advance(reopened,{now:f.now+6000,budget:90});assert.deepEqual(payload(reopened,f.t.id,f.active.gameId),payload(f.db,f.t.id,f.active.gameId),'Old-source combat with reviewed new helpers equals uninterrupted old helpers');
  f.previous.advance(f.db,{now:f.now+7000,budget:12000});Runtime.advance(reopened,{now:f.now+7000,budget:12000});const oldResult=f.db.prepare('SELECT result_json FROM tournament_matches WHERE id=?').get(f.active.gameId),newResult=reopened.prepare('SELECT result_json FROM tournament_matches WHERE id=?').get(f.active.gameId);assert.ok(oldResult);assert.deepEqual(newResult,oldResult);assert.deepEqual(Circuit.getTournament(reopened,f.owner,f.t.id),Circuit.getTournament(f.db,f.owner,f.t.id));assert.equal(metadata(reopened,f.t.id).runtimeGames,undefined);
  const final=JSON.parse(newResult.result_json),state=copy(Circuit.getTournament(reopened,f.owner,f.t.id));Circuit.recordGame(reopened,f.owner,f.t.id,f.active.gameId.split(':game')[0],final,f.now+8000);assert.equal(reopened.prepare('SELECT count(*) n FROM tournament_matches WHERE id=?').get(f.active.gameId).n,1);assert.deepEqual(Circuit.getTournament(reopened,f.owner,f.t.id),state);assert.deepEqual(readWorld(reopened,f.owner).save,readWorld(f.db,f.owner).save,'Headless restoration changes no normal XP/rank/career/meta records');
 }finally{f.close();}
});
test('Unknown saved helper fingerprints and unchanged source identity checks retain the original old checkpoint',()=>{
 const f=fixture();try{for(const [index,variant]of ['harness','progression','tactics','source','binding'].entries()){
  const recorded=copy(f.original),cp=recorded.runtimeGames[f.active.gameId];if(variant==='harness')cp.dependencies['dev/simulate.cjs']='unknown-harness';else if(variant==='progression')cp.dependencies['progression.js']='unknown-progression';else if(variant==='tactics')cp.dependencies['tactical-instinct.js']='unknown-tactics';else if(variant==='source')cp.sourceHash='unknown-source';else cp.bindingVersion=99;
  const db=f.clone('rejected-'+index,recorded);assert.throws(()=>Runtime.advance(db,{now:f.now+5000,budget:0}),variant==='source'?/checkpoint identity/:variant==='binding'?/Unsupported tournament checkpoint/:/engine dependencies changed.*saved game retained/);assert.deepEqual(metadata(db,f.t.id),recorded);assert.equal(Runtime.activeGames(db).length,0);assert.equal(db.prepare('SELECT count(*) n FROM tournament_matches').get().n,0);
 }}finally{f.close();}
});
test('Approved legacy fingerprints cannot bypass module-bound or subsequently changed-on-disk helper guards',()=>{
 const f=fixture();try{for(const when of ['before-load','after-load']){
  const helpers=path.join(f.directory,when);writeFiles(helpers,false);const target=path.join(helpers,'progression.js');let isolated;if(when==='after-load')isolated=fixtureRuntime(helpers);fs.appendFileSync(target,'\n// Unknown isolated helper revision.\n');if(!isolated)isolated=fixtureRuntime(helpers);
  const db=f.clone(when);assert.throws(()=>isolated.advance(db,{now:f.now+5000,budget:0}),/engine dependencies changed.*saved game retained/);assert.deepEqual(metadata(db,f.t.id),f.original);assert.equal(isolated.activeGames(db).length,0);assert.equal(db.prepare('SELECT count(*) n FROM tournament_matches').get().n,0);
 }}finally{f.close();}
});
