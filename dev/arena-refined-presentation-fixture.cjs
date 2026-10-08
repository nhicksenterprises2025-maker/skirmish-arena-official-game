/* Audit 8 fixtures are persisted in isolated SQLite through the real series
   finalizer. They never use installed-account data or replace API responses. */
'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const Circuit=require('../server/tournaments.cjs');
const {fixture,fillTeams,snapshot}=require('./live-circuit-tournament-check.cjs');
const {game}=require('./arena-refined-tournament-series-check.cjs');
const OWNER='live-circuit-fixture',clone=value=>JSON.parse(JSON.stringify(value));

function variedGame(t,series,score){
 const result=game(t,series,score);
 for(let side=0;side<2;side++){
  const ids=t.teams.find(team=>team.id===series.teamIds[side]).participants.map(p=>p.id);
  ids.forEach((id,index)=>{
   const s=result.stats.find(p=>p.participantId===id),kills=index===0?score[side]-4:1;
   s.kills=kills;s.damage=kills*250+index*7;s.shots=kills*9+13+index;s.hits=kills*5+index;
   s.assists=index+1;s.headshots=Math.min(kills,index);s.weaponStats={'AR-15':Object.fromEntries(['kills','deaths','assists','damage','shots','hits','headshots'].map(key=>[key,s[key]]))};
  });
 }
 return result;
}
function record(db,t,series,score,at){return Circuit.recordGame(db,OWNER,t.id,series.id,variedGame(t,series,score),at);}
function fixtureForPresentation(){
 const f=fixture(),now=Date.now(),historicalSeason={id:'audit8-historical',startAt:now-16*86400000,endAt:now-86400000};
 const historicalEvent=Circuit.scheduleOfficial(f.db,OWNER,historicalSeason,historicalSeason.startAt)[0];
 // This archive predates fixed-clock scheduling. Keep its stored lineage while
 // resolving its original series through the same authoritative result ledger.
 const oldMetadata=JSON.parse(f.db.prepare('SELECT metadata_json FROM tournaments WHERE id=?').get(historicalEvent.id).metadata_json);delete oldMetadata.schedulePolicy;delete oldMetadata.scheduling;f.db.prepare('UPDATE tournaments SET metadata_json=? WHERE id=?').run(JSON.stringify(oldMetadata),historicalEvent.id);
 fillTeams(f.db,historicalEvent.id,historicalEvent.startsAt);
 let historical=Circuit.startTournament(f.db,OWNER,historicalEvent.id,historicalEvent.startsAt);
 for(let n=0;historical.status!=='COMPLETED'&&n<24;n++){
  const series=historical.series.find(s=>Circuit.canPlaySeries(s,historical));assert.ok(series);
  historical=record(f.db,historical,series,[50,31],historicalEvent.startsAt+n*300000);
 }
 assert.equal(historical.status,'COMPLETED');
 // Preserve a legitimately old title and an identity snapshot independently
 // from today's roster. Unknown legacy archives intentionally have no winner.
 f.db.prepare('UPDATE tournaments SET name=? WHERE id=?').run('Live Circuit — Archived Championship',historical.id);
 const state=JSON.parse(f.db.prepare('SELECT bracket_json FROM tournaments WHERE id=?').get(historical.id).bracket_json);
 state.teams[0].participants[0].name='Archived Player Name';
 f.db.prepare('UPDATE tournaments SET bracket_json=? WHERE id=?').run(JSON.stringify(state),historical.id);
 historical=Circuit.getTournament(f.db,OWNER,historical.id);
 const unknownId=crypto.randomUUID();
 f.db.prepare('INSERT INTO tournaments(id,user_id,name,starts_at,status,bracket_json,metadata_json,created_at,updated_at,kind,season_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(unknownId,OWNER,'Live Circuit — Recovered Legacy Record',now-30*86400000,'COMPLETED',JSON.stringify({teams:[],series:[],placements:[],earnings:[]}),'{}',now,now,'official','audit8-legacy');
 const legacyMapId=crypto.randomUUID(),legacyTeams=['winners','runners'].map((label,side)=>({id:'legacy-'+label,name:side?'Legacy Runners':'Legacy Winners',seed:side+1,participants:Array.from({length:5},(_,i)=>({id:'bot_'+String(41+side*5+i).padStart(4,'0'),name:'Archived '+label+' '+(i+1),kind:'bot'}))}));
 f.db.prepare('INSERT INTO tournaments(id,user_id,name,starts_at,status,bracket_json,metadata_json,created_at,updated_at,kind,season_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(legacyMapId,OWNER,'Live Circuit — Legacy Placement Map',now-45*86400000,'COMPLETED',JSON.stringify({teams:legacyTeams,series:[],placements:{'legacy-winners':1,'legacy-runners':2},earnings:[]}),'{}',now,now,'official','audit8-placement-map');
 const customEvent=Circuit.createCustom(f.db,OWNER,{name:'Noah’s Custom Circuit — Keep This Name',startsAt:now},now);
 fillTeams(f.db,customEvent.id,now);let active=Circuit.startTournament(f.db,OWNER,customEvent.id,now);
 const series=active.series.find(s=>s.teamIds.some(id=>active.teams.find(t=>t.id===id).participants.some(p=>p.id===OWNER)));
 active=record(f.db,active,series,[50,31],now);
 const official=Circuit.scheduleOfficial(f.db,OWNER,f.season,now);
 const token=crypto.randomBytes(32).toString('base64url');
 f.db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),OWNER,now,now+86400000,now);
 const before=snapshot(f.db);
 return {f,owner:OWNER,token,cookie:'sar_session='+token,now,historicalId:historical.id,unknownId,legacyMapId,activeId:active.id,seriesId:series.id,officialIds:official.map(e=>e.id),before,clone,record,history:historical};
}
module.exports={fixtureForPresentation,variedGame,OWNER,clone};
