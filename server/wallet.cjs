'use strict';
const crypto=require('node:crypto');
const Catalog=require('./commerce-catalog.cjs');
const fail=(status,message,code)=>Object.assign(new Error(message),{status,code});
const environments=new Set(['production','sandbox','test']);
function environment(value=process.env.SAR_COMMERCE_ENV||'production'){
  if(!environments.has(value))throw new Error('SAR_COMMERCE_ENV must be production, sandbox or test');
  return value;
}
function onlyFields(body,allowed){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!allowed.includes(key)))throw fail(400,'Unexpected purchase or account fields','INVALID_COMMERCE_REQUEST');
}
function ensureWallet(db,userId,env,now=Date.now()){
  environment(env);
  db.prepare('INSERT OR IGNORE INTO ac_wallets(user_id,environment,created_at,initial_world_revision,updated_at) VALUES(?,?,?,COALESCE((SELECT revision FROM worlds WHERE user_id=?),0),?)').run(userId,env,now,userId,now);
  return db.prepare('SELECT * FROM ac_wallets WHERE user_id=? AND environment=?').get(userId,env);
}
function snapshot(db,userId,env=environment()){
  const row=ensureWallet(db,userId,env);
  const entitlements=db.prepare('SELECT cosmetic_id AS cosmeticId,purchased_at AS purchasedAt FROM cosmetic_entitlements WHERE user_id=? AND environment=? ORDER BY purchased_at,cosmetic_id').all(userId,env);
  const equipped=Object.fromEntries(db.prepare('SELECT operator_id AS operatorId,cosmetic_id AS cosmeticId,style_id AS styleId FROM cosmetic_equipment WHERE user_id=? AND environment=? ORDER BY operator_id').all(userId,env).map(({operatorId,...selection})=>[operatorId,selection]));
  const pending=db.prepare("SELECT COALESCE(SUM(units),0) AS units,COUNT(*) AS count FROM ac_match_reports WHERE user_id=? AND environment=? AND status='PENDING_VALIDATION'").get(userId,env);
  return {accountId:userId,environment:env,balanceUnits:row.balance_units,entitlements,equipped,pendingEarnUnits:pending.units,pendingEarnCount:pending.count,earningStatus:'validation-required'};
}
function atomic(db,action){db.exec('BEGIN IMMEDIATE');try{const result=action();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
const orderJson=row=>({id:row.id,requestId:row.request_id,cosmeticId:row.cosmetic_id,priceUnits:row.price_units,status:row.status});
function purchase(db,userId,body,env=environment()){
  onlyFields(body,['cosmeticId','requestId']);
  if(typeof body.requestId!=='string'||!/^[a-zA-Z0-9:_-]{8,128}$/.test(body.requestId))throw fail(400,'A stable purchase request identifier is required','INVALID_REQUEST_ID');
  const item=Catalog.cosmetics.find(item=>item.id===body.cosmeticId);
  if(!item)throw fail(404,'Cosmetic not found','UNKNOWN_COSMETIC');
  ensureWallet(db,userId,env);
  return atomic(db,()=>{
    const old=db.prepare('SELECT * FROM cosmetic_orders WHERE user_id=? AND environment=? AND request_id=?').get(userId,env,body.requestId);
    if(old){if(old.cosmetic_id!==item.id)throw fail(409,'That request identifies a different purchase','REQUEST_CONFLICT');return {order:orderJson(old),wallet:snapshot(db,userId,env),replayed:true};}
    if(db.prepare('SELECT 1 FROM cosmetic_entitlements WHERE user_id=? AND environment=? AND cosmetic_id=?').get(userId,env,item.id))throw fail(409,'You already own this cosmetic','ALREADY_OWNED');
    if(item.saleStatus!=='active')throw fail(409,'This appearance is no longer offered for sale','COSMETIC_RETIRED');
    if(!Catalog.assetReadiness()[item.id])throw fail(409,'This cosmetic is not available yet','COSMETIC_UNAVAILABLE');
    const wallet=ensureWallet(db,userId,env);
    if(wallet.balance_units<item.priceUnits)throw fail(409,'Not enough Arena Credits','INSUFFICIENT_CREDITS');
    const now=Date.now(),id=crypto.randomUUID(),ledgerId=crypto.randomUUID();
    db.prepare('INSERT INTO ac_ledger(id,user_id,environment,idempotency_key,delta_units,source,source_id,created_at) VALUES(?,?,?,?,?,?,?,?)').run(ledgerId,userId,env,JSON.stringify([userId,body.requestId,'cosmetic-purchase']),-item.priceUnits,'cosmetic-purchase',id,now);
    db.prepare("INSERT INTO cosmetic_orders(id,user_id,environment,request_id,cosmetic_id,price_units,ledger_id,status,created_at) VALUES(?,?,?,?,?,?,?,'COMPLETED',?)").run(id,userId,env,body.requestId,item.id,item.priceUnits,ledgerId,now);
    db.prepare('INSERT INTO cosmetic_entitlements(user_id,environment,cosmetic_id,order_id,purchased_at) VALUES(?,?,?,?,?)').run(userId,env,item.id,id,now);
    return {order:{id,requestId:body.requestId,cosmeticId:item.id,priceUnits:item.priceUnits,status:'COMPLETED'},wallet:snapshot(db,userId,env),replayed:false};
  });
}
function equip(db,userId,body,env=environment()){
  onlyFields(body,['cosmeticId','operatorId','styleId']);
  if(!Catalog.operators.some(op=>op.id===body.operatorId))throw fail(400,'Choose a known operator','UNKNOWN_OPERATOR');
  ensureWallet(db,userId,env);
  return atomic(db,()=>{
    if(body.cosmeticId===null){
      if(body.styleId!==undefined&&body.styleId!=='main')throw fail(400,'The base operator has no paid style','INVALID_STYLE');
      db.prepare('DELETE FROM cosmetic_equipment WHERE user_id=? AND environment=? AND operator_id=?').run(userId,env,body.operatorId);
    }else{
      const item=Catalog.cosmetics.find(item=>item.id===body.cosmeticId),styleId=body.styleId||'main';
      if(!item||item.operatorId!==body.operatorId)throw fail(400,'Cosmetic does not fit this operator','OPERATOR_MISMATCH');
      if(!item.styles.some(style=>style.id===styleId))throw fail(400,'Style is not included','INVALID_STYLE');
      if(!db.prepare('SELECT 1 FROM cosmetic_entitlements WHERE user_id=? AND environment=? AND cosmetic_id=?').get(userId,env,item.id))throw fail(403,'This account does not own the cosmetic','NOT_OWNED');
      db.prepare('INSERT INTO cosmetic_equipment(user_id,environment,operator_id,cosmetic_id,style_id,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,environment,operator_id) DO UPDATE SET cosmetic_id=excluded.cosmetic_id,style_id=excluded.style_id,updated_at=excluded.updated_at').run(userId,env,body.operatorId,item.id,styleId,Date.now());
    }
    return {wallet:snapshot(db,userId,env)};
  });
}

// Rates are shared by report interpretation and the internal validation adapter.
// Consistent XP records prove neither human input nor server-observed completion.
function rewardForParticipation(receipt,userId){
  if(!receipt||receipt.participantId!==userId||receipt.participantType==='bot'||receipt.type==='bot'||receipt.spectating===true||receipt.cancelled===true||receipt.completed===false||receipt.practice!==false||receipt.eligible!==true)return 0;
  if(receipt.kind==='standard'&&receipt.sessionType==='standard'&&['tdm','deathmatch'].includes(receipt.mode))return 100;
  if(receipt.kind==='ranked'&&receipt.sessionType==='ranked'&&receipt.mode==='tdm')return 150;
  return 0;
}
const reportJson=row=>({matchId:row.match_id,units:row.units,status:row.status});
function reportMatch(db,userId,body,env=environment()){
  onlyFields(body,['matchId']);
  const matchId=body.matchId;
  if(typeof matchId!=='string'||!matchId.startsWith('match:')||matchId.length>200)throw fail(400,'A completed match identifier is required','INVALID_MATCH_ID');
  ensureWallet(db,userId,env);
  return atomic(db,()=>{
    const old=db.prepare("SELECT * FROM ac_match_reports WHERE user_id=? AND environment=? AND match_id=? AND reward_type='match-completion'").get(userId,env,matchId);
    if(old)return {report:reportJson(old),wallet:snapshot(db,userId,env),replayed:true};
    const wallet=ensureWallet(db,userId,env),world=db.prepare('SELECT revision,save_json FROM worlds WHERE user_id=?').get(userId);
    const receipt=world?JSON.parse(world.save_json).progression?.awards?.[matchId]:null;
    if(!receipt)throw fail(409,'Wait for this match to synchronize','MATCH_NOT_SYNCED');
    const units=rewardForParticipation(receipt,userId);
    if(!units||receipt.transactionKey!==JSON.stringify([userId,matchId,'xp']))throw fail(409,'This match is not eligible for Arena Credits','MATCH_INELIGIBLE');
    if(!Number.isFinite(receipt.at)||receipt.at<wallet.created_at||world.revision<=wallet.initial_world_revision)throw fail(409,'Earlier matches do not earn Arena Credits retroactively','HISTORICAL_MATCH');
    db.prepare("INSERT INTO ac_match_reports(user_id,environment,match_id,reward_type,units,status,receipt_json,world_revision,created_at) VALUES(?,?,?,'match-completion',?,'PENDING_VALIDATION',?,?,?)").run(userId,env,matchId,units,JSON.stringify(receipt),world.revision,Date.now());
    return {report:{matchId,units,status:'PENDING_VALIDATION'},wallet:snapshot(db,userId,env),replayed:false};
  });
}

// There is no authoritative human-match host/anti-AFK validator in this build.
// This internal adapter exercises settlement in isolated fixtures only. It is
// never an HTTP route, never accepts a client trust flag, and refuses real or
// sandbox wallets until a future server-owned result validator is implemented.
function settleVerifiedMatch(db,userId,matchId,validatedParticipation,env=environment()){
  environment(env);
  if(env!=='test')throw fail(503,'Server-validated match rewards are not configured','RESULT_VALIDATION_UNAVAILABLE');
  if(typeof matchId!=='string'||!matchId.startsWith('match:')||matchId.length>200)throw fail(400,'Invalid match identity','INVALID_MATCH_ID');
  const units=rewardForParticipation(validatedParticipation,userId);
  if(!units||validatedParticipation.completed!==true||validatedParticipation.participantType!=='human'||validatedParticipation.activeParticipation!==true)return {credited:false,wallet:snapshot(db,userId,env)};
  ensureWallet(db,userId,env);
  return atomic(db,()=>{
    const key=JSON.stringify([userId,matchId,'match-completion']);
    const old=db.prepare('SELECT delta_units,source_id FROM ac_ledger WHERE user_id=? AND environment=? AND idempotency_key=?').get(userId,env,key);
    if(old){if(old.delta_units!==units||old.source_id!==matchId)throw fail(409,'Validated match identity changed','MATCH_CONFLICT');return {credited:true,replayed:true,wallet:snapshot(db,userId,env)};}
    db.prepare('INSERT INTO ac_ledger(id,user_id,environment,idempotency_key,delta_units,source,source_id,created_at) VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),userId,env,key,units,'match-completion',matchId,Date.now());
    db.prepare("UPDATE ac_match_reports SET status='CREDITED' WHERE user_id=? AND environment=? AND match_id=? AND reward_type='match-completion'").run(userId,env,matchId);
    return {credited:true,replayed:false,wallet:snapshot(db,userId,env)};
  });
}
function checkout(db,userId,body,env=environment()){
  onlyFields(body,['packId','requestId']);
  if(!Catalog.packs.some(pack=>pack.id===body.packId))throw fail(404,'Arena Credits pack not found','UNKNOWN_PACK');
  if(body.requestId!==undefined&&(typeof body.requestId!=='string'||!/^[a-zA-Z0-9:_-]{8,128}$/.test(body.requestId)))throw fail(400,'Invalid checkout request identifier','INVALID_REQUEST_ID');
  ensureWallet(db,userId,env);
  return {available:false,code:'CHECKOUT_UNAVAILABLE',error:'Money checkout is not available yet. No payment was taken.',environment:env};
}
module.exports={environment,onlyFields,ensureWallet,snapshot,purchase,equip,rewardForParticipation,reportMatch,settleVerifiedMatch,checkout};
