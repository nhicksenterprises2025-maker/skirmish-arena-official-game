'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');

const MIGRATIONS=path.join(__dirname,'migrations');
const LATEST_DB_SCHEMA=5;
const isoNow=()=>Date.now();
const encoded=value=>JSON.stringify(value??{});

function createDatabase(file=process.env.SAR_DB_PATH||path.join(__dirname,'data','skirmish.sqlite')){
  if(file!==':memory:')fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});
  const db=new DatabaseSync(file,{timeout:5000});
  db.exec('PRAGMA foreign_keys=ON');
  if(file!==':memory:')db.exec('PRAGMA journal_mode=WAL');
  let version=db.prepare('PRAGMA user_version').get().user_version;
  if(version>LATEST_DB_SCHEMA)throw new Error('Database requires a newer Skirmish server');
  if(version>0&&version<LATEST_DB_SCHEMA&&file!==':memory:'){
    db.exec('PRAGMA wal_checkpoint(FULL)');
    const backup=file+'.pre-schema'+version+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite';
    fs.copyFileSync(file,backup);
  }
  for(let next=version+1;next<=LATEST_DB_SCHEMA;next++){
    const name=String(next).padStart(3,'0')+({1:'_core.sql',2:'_social.sql',3:'_local_ai.sql',4:'_live_circuit.sql',5:'_tactical_instinct.sql'}[next]);
    const sql=fs.readFileSync(path.join(MIGRATIONS,name),'utf8');
    db.exec('BEGIN IMMEDIATE');
    try{
      db.exec(sql);
      db.prepare('INSERT INTO save_migrations(version,applied_at,note) VALUES(?,?,?)').run(next,isoNow(),name);
      db.exec(`PRAGMA user_version=${next}`);
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  db.exec('PRAGMA foreign_keys=ON');
  return db;
}

function botId(name,bot){return bot?.profile?.id||'bot_'+crypto.createHash('sha256').update(name).digest('hex').slice(0,12);}

function upsertWorldTables(db,userId,world,now=isoNow()){
  const putBot=db.prepare(`INSERT INTO bots(user_id,bot_id,name,power,power_rank,playstyle,personality_json,form,familiarity_json,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,bot_id) DO UPDATE SET name=excluded.name,power=excluded.power,power_rank=excluded.power_rank,playstyle=excluded.playstyle,personality_json=excluded.personality_json,form=excluded.form,familiarity_json=excluded.familiarity_json,updated_at=excluded.updated_at`);
  const putCareer=db.prepare(`INSERT INTO bot_careers(user_id,bot_id,stats_json) VALUES(?,?,?) ON CONFLICT(user_id,bot_id) DO UPDATE SET stats_json=excluded.stats_json`);
  const putBotGun=db.prepare(`INSERT INTO bot_weapon_stats(user_id,bot_id,weapon,stats_json) VALUES(?,?,?,?) ON CONFLICT(user_id,bot_id,weapon) DO UPDATE SET stats_json=excluded.stats_json`);
  for(const [name,bot] of Object.entries(world.bots||{})){
    if(!bot?.profile)continue;const id=botId(name,bot),profile=bot.profile,career=bot.career||{};
    putBot.run(userId,id,name,Number(profile.power)||0,Number(profile.rank)||0,String(profile.archetype||'Flex'),encoded(profile.personality),Number(bot.recentForm)||0,encoded(bot.familiarity),now);
    // A stable social identity is initialized once; client combat profiles never
    // overwrite persistent dialogue identity, memories or relationships.
    const social=require('./social-personalities.cjs').personalityFor(name);
    if(social)db.prepare('INSERT OR IGNORE INTO bot_social_profiles(user_id,bot_id,personality_json,created_at) VALUES(?,?,?,?)').run(userId,id,encoded(social),now);
    putCareer.run(userId,id,encoded(career));
    for(const [weapon,stats] of Object.entries(career.weaponUsage||{}))putBotGun.run(userId,id,weapon,encoded(stats));
  }
  db.prepare(`INSERT INTO user_career_stats(user_id,stats_json) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET stats_json=excluded.stats_json`).run(userId,encoded(world.playerCareer));
  const putPlayerGun=db.prepare(`INSERT INTO user_weapon_stats(user_id,weapon,stats_json) VALUES(?,?,?) ON CONFLICT(user_id,weapon) DO UPDATE SET stats_json=excluded.stats_json`);
  for(const [weapon,stats] of Object.entries(world.playerCareer?.weapons||{}))putPlayerGun.run(userId,weapon,encoded(stats));
  const putSeason=db.prepare(`INSERT INTO seasons(user_id,number,start_at,end_at,winner_bot_id,finalized_at,stats_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,number) DO UPDATE SET start_at=excluded.start_at,end_at=excluded.end_at,winner_bot_id=excluded.winner_bot_id,finalized_at=excluded.finalized_at,stats_json=excluded.stats_json`);
  for(const season of [world.seasons?.current,...(world.seasons?.history||[])].filter(Boolean)){
    const winner=season.winner?.id||(season.winner?.name&&world.bots?.[season.winner.name]?botId(season.winner.name,world.bots[season.winner.name]):null);
    putSeason.run(userId,Number(season.number),Number(season.startAt),Number(season.endAt),winner,season.finalizedAt??null,encoded(season.stats));
  }
  const putPatch=db.prepare(`INSERT INTO balance_patches(user_id,patch_id,generation,fingerprint,started_at,ended_at,reason,data_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,patch_id) DO UPDATE SET generation=excluded.generation,fingerprint=excluded.fingerprint,started_at=excluded.started_at,ended_at=excluded.ended_at,reason=excluded.reason,data_json=excluded.data_json`);
  const putPatchGun=db.prepare(`INSERT INTO weapon_patch_stats(user_id,patch_id,weapon,stats_json) VALUES(?,?,?,?) ON CONFLICT(user_id,patch_id,weapon) DO UPDATE SET stats_json=excluded.stats_json`);
  for(const patch of [...(world.patchArchives||[]),world.patchState].filter(Boolean)){
    const id=String(patch.id||'legacy-unverified');
    putPatch.run(userId,id,patch.generation??null,patch.fingerprint??null,patch.startedAt??null,patch.endedAt??null,patch.reason??null,encoded(patch));
    for(const [weapon,stats] of Object.entries(patch.meta||{}))putPatchGun.run(userId,id,weapon,encoded(stats));
  }
}

module.exports={createDatabase,upsertWorldTables,botId,LATEST_DB_SCHEMA};
