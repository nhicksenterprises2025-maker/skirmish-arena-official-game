'use strict';
const Maps=require('../map-data.js');
const Units=require('../distance-units.js');
const POOLS=Object.freeze(['casual','ranked','tournament','ltm','custom']);
const clone=value=>JSON.parse(JSON.stringify(value));
const fail=message=>Object.assign(new Error(message),{status:400});
function registered(id,revision){
 const map=Maps.get(id);if(!map||revision!==undefined&&String(map.revision)!==String(revision))throw fail('This map version is not available');return map;
}
function validate(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['revision','season','pools'].includes(key))||typeof value.revision!=='string'||!value.revision||value.revision.length>80||value.season!==undefined&&(typeof value.season!=='string'||value.season.length>80)||!value.pools||typeof value.pools!=='object'||Array.isArray(value.pools)||Object.keys(value.pools).some(key=>!POOLS.includes(key)))throw fail('Invalid map pool configuration');
 const pools={};for(const pool of POOLS){const ids=value.pools[pool];if(!Array.isArray(ids)||!ids.length||ids.length>Maps.list().length||new Set(ids).size!==ids.length)throw fail('Every map pool requires unique registered maps');for(const id of ids){if(typeof id!=='string')throw fail('Invalid map identity');registered(id);}pools[pool]=ids.slice();}
 return {revision:value.revision,...(value.season===undefined?{}:{season:value.season}),pools};
}
function configuration(db,environment=process.env.SAR_MAP_POOLS){
 const row=db.prepare("SELECT configuration_json FROM map_pool_config WHERE id='active'").get();
 if(environment!==undefined&&environment!==''){
  let input;try{input=JSON.parse(environment);}catch{throw fail('SAR_MAP_POOLS must contain a valid JSON configuration');}const next=validate(input);
  if(!row||JSON.stringify(next)!==row.configuration_json)db.prepare("INSERT INTO map_pool_config(id,configuration_json,updated_at) VALUES('active',?,?) ON CONFLICT(id) DO UPDATE SET configuration_json=excluded.configuration_json,updated_at=excluded.updated_at").run(JSON.stringify(next),Date.now());return next;
 }
 if(row)return validate(JSON.parse(row.configuration_json));
 const ids=Maps.list().map(map=>map.id),initial={revision:'map-ecosystem-1',pools:Object.fromEntries(POOLS.map(pool=>[pool,ids.slice()]))};
 return initial;
}
function remember(db,config){db.prepare("INSERT OR IGNORE INTO map_pool_config(id,configuration_json,updated_at) VALUES('active',?,?)").run(JSON.stringify(validate(config)),Date.now());}
function candidates(config,pool,previous,limit=Infinity){
 if(!POOLS.includes(pool))throw fail('Unknown map pool');const ids=config.pools[pool],eligible=ids.length>1?ids.filter(id=>id!==previous):ids;
 const start=ids.indexOf(previous);return eligible.slice().sort((a,b)=>((ids.indexOf(a)-start-1+ids.length)%ids.length)-((ids.indexOf(b)-start-1+ids.length)%ids.length)).slice(0,limit);
}
function selection(config,pool,id){
 if(!config.pools[pool]?.includes(id))throw fail('Choose a map from the current pool');const map=registered(id);
 return {mapId:map.id,mapVersion:map.revision,mapSelection:{pool,poolRevision:config.revision,...(config.season?{season:config.season}:{}),mapId:map.id,mapVersion:map.revision,world:clone(map.world),grid:clone(map.grid)}};
}
function previousMultiplayer(db,pool){
 return db.prepare("SELECT json_extract(state_json,'$.mapSelection.mapId') AS mapId FROM mp_matches WHERE json_extract(state_json,'$.mapSelection.pool')=? ORDER BY created_at DESC,rowid DESC LIMIT 1").get(pool)?.mapId||null;
}
function metaProvenance(actual,reference){
 const a=actual?.distanceUnit==='world-unit'?Units.resolveDistanceMeters(1,actual):null,b=reference?.distanceUnit==='world-unit'?Units.resolveDistanceMeters(1,reference):null;
 return clone(a!==null&&b!==null&&Number.isFinite(a)&&Number.isFinite(b)&&a===b?reference:actual||null);
}
function tournamentSelection(db,tournamentId,gameId,config=configuration(db)){
 const row=db.prepare('SELECT metadata_json FROM tournaments WHERE id=?').get(tournamentId);if(!row)throw fail('Tournament unavailable');const metadata=JSON.parse(row.metadata_json||'{}');metadata.mapSelections||={};
 const saved=metadata.mapSelections[gameId];if(saved){registered(saved.mapId,saved.mapVersion);return clone(saved);}
 // A pre-update checkpoint already has Brightfield geometry. Preserve that
 // physical match instead of applying a seasonal choice while resuming it.
 const oldCheckpoint=metadata.runtimeGames?.[gameId],mp=db.prepare('SELECT state_json FROM mp_matches WHERE id=?').get(gameId);
 const legacy=()=>{const map=registered('brightfield-blocks');return {mapId:map.id,mapVersion:map.revision,mapSelection:{pool:'tournament',poolRevision:'legacy-brightfield',mapId:map.id,mapVersion:map.revision,world:clone(map.world),grid:clone(map.grid)}};};
 let next;if(mp){const state=JSON.parse(mp.state_json);next=state.mapSelection?{mapId:state.mapSelection.mapId,mapVersion:state.mapSelection.mapVersion,mapSelection:state.mapSelection}:legacy();}
 else if(oldCheckpoint)next=legacy();
 else{const previous=Object.values(metadata.mapSelections).at(-1)?.mapId;next=selection(config,'tournament',candidates(config,'tournament',previous)[0]);}
 registered(next.mapId,next.mapVersion);remember(db,config);metadata.mapSelections[gameId]=next;db.prepare('UPDATE tournaments SET metadata_json=? WHERE id=?').run(JSON.stringify(metadata),tournamentId);return clone(next);
}
module.exports={POOLS,registered,validate,configuration,remember,candidates,selection,previousMultiplayer,metaProvenance,tournamentSelection};
