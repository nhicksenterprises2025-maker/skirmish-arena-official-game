'use strict';
// Called within schema 11's transaction, after the opener has integrity-checked
// the recoverable original database. No shared world/account data is rewritten.
const Schedule=require('./tournament-schedule.cjs');
const RESET_ID='arena-refined-followup-tournaments-v1';
const children=['tournament_invites','tournament_registrations','tournament_participants','tournament_matches','tournament_stats','tournament_placements','tournament_earnings','tournament_series','tournament_teams'];
function apply(db,{recoveryFile=null,now=Date.now()}={}){
 if(db.prepare('SELECT 1 FROM tournament_state_resets WHERE reset_id=?').get(RESET_ID))return false;
 const events=db.prepare("SELECT * FROM tournaments ORDER BY starts_at,id").all(),anchors=new Map();
 for(const row of events.filter(row=>row.kind==='official')){
  const meta=JSON.parse(row.metadata_json||'{}'),stored=meta.officialSchedule;
  if(!anchors.has(row.user_id))anchors.set(row.user_id,{anchor:Schedule.anchorRecord({id:row.id,startsAt:row.starts_at,timezone:Schedule.APPROVED_POLICY.timezone}),policy:Schedule.APPROVED_POLICY,configuredAt:now});
  if(stored?.anchor)anchors.set(row.user_id,{anchor:stored.anchor,policy:Schedule.confirmedPolicy(stored.policy),configuredAt:stored.configuredAt||now});
 }
 for(const [userId,schedule] of anchors)db.prepare('INSERT OR IGNORE INTO tournament_schedule_anchors VALUES(?,?,?,?)').run(userId,JSON.stringify(schedule.anchor),JSON.stringify(schedule.policy),schedule.configuredAt);
 const retired=events.filter(row=>row.status!=='COMPLETED'),removed={},archives=[];
 for(const row of retired.filter(row=>row.kind==='official')){
  const matches=db.prepare('SELECT * FROM tournament_matches WHERE tournament_id=? ORDER BY completed_at,id').all(row.id),stats=db.prepare('SELECT * FROM tournament_stats WHERE tournament_id=? ORDER BY participant_id').all(row.id),earnings=db.prepare('SELECT * FROM tournament_earnings WHERE tournament_id=? ORDER BY participant_id').all(row.id);
  if(matches.length||stats.length||earnings.length)archives.push({id:row.id,userId:row.user_id,snapshot:{event:{...row,metadata_json:JSON.stringify({retiredByReset:RESET_ID})},teams:db.prepare('SELECT * FROM tournament_teams WHERE tournament_id=? ORDER BY seed').all(row.id),matches,stats,earnings,placements:db.prepare('SELECT * FROM tournament_placements WHERE tournament_id=? ORDER BY placement').all(row.id)}});
 }
 for(const table of children){const statement=db.prepare('DELETE FROM '+table+" WHERE tournament_id IN (SELECT id FROM tournaments WHERE status<>'COMPLETED')");removed[table]=Number(statement.run().changes);}
 db.prepare("DELETE FROM tournaments WHERE status<>'COMPLETED'").run();
 db.prepare('INSERT INTO tournament_state_resets VALUES(?,?,?,?)').run(RESET_ID,now,recoveryFile,JSON.stringify({events:retired.length,removed,preservedCompleted:events.length-retired.length,preservedOfficial:events.filter(row=>row.status==='COMPLETED'&&row.kind==='official').length,archivedIncompleteOfficial:archives.length,anchorUsers:anchors.size}));
 for(const archive of archives)db.prepare('INSERT INTO tournament_reset_archives VALUES(?,?,?,?,?)').run(RESET_ID,archive.id,archive.userId,JSON.stringify(archive.snapshot),now);
 return true;
}
module.exports={RESET_ID,apply};
