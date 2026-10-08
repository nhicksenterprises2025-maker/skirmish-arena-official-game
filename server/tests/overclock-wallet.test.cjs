'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {Worker}=require('node:worker_threads'),{DatabaseSync}=require('node:sqlite');
const {createDatabase,LATEST_DB_SCHEMA}=require('../db.cjs'),Wallet=require('../wallet.cjs'),Catalog=require('../commerce-catalog.cjs');
const ROOT=path.resolve(__dirname,'../..');
const seedUser=(db,id)=>{db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,id,id,'fixture-not-login',Date.now(),Date.now());return id;};
function fundFixture(db,id,units){Wallet.ensureWallet(db,id,'test');db.prepare('INSERT INTO ac_ledger(id,user_id,environment,idempotency_key,delta_units,source,source_id,created_at) VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),id,'test',crypto.randomUUID(),units,'test-fixture','isolated-test',Date.now());}
// Reproduce an order completed before sale retirement; never bypass purchase
// policy in application code or change existing production ownership records.
function legacyPurchaseFixture(db,userId,cosmeticId,requestId){
  const item=Catalog.cosmetics.find(row=>row.id===cosmeticId),id=crypto.randomUUID(),ledgerId=crypto.randomUUID(),at=Date.now()-1000;
  db.exec('BEGIN IMMEDIATE');try{
    db.prepare('INSERT INTO ac_ledger(id,user_id,environment,idempotency_key,delta_units,source,source_id,created_at) VALUES(?,?,?,?,?,?,?,?)').run(ledgerId,userId,'test',JSON.stringify([userId,requestId,'cosmetic-purchase']),-item.priceUnits,'cosmetic-purchase',id,at);
    db.prepare("INSERT INTO cosmetic_orders(id,user_id,environment,request_id,cosmetic_id,price_units,ledger_id,status,created_at) VALUES(?,?,?,?,?,?,?,'COMPLETED',?)").run(id,userId,'test',requestId,cosmeticId,item.priceUnits,ledgerId,at);
    db.prepare('INSERT INTO cosmetic_entitlements(user_id,environment,cosmetic_id,order_id,purchased_at) VALUES(?,?,?,?,?)').run(userId,'test',cosmeticId,id,at);
    db.exec('COMMIT');return id;
  }catch(error){db.exec('ROLLBACK');throw error;}
}
function readyFixture(fn){const original=Catalog.assetReadiness;Catalog.assetReadiness=()=>Object.fromEntries(Catalog.cosmetics.map(item=>[item.id,true]));try{return fn();}finally{Catalog.assetReadiness=original;}}
const receipt=(id,kind='standard',extra={})=>({participantId:id,participantType:'human',kind,sessionType:kind,mode:'tdm',eligible:true,practice:false,completed:true,activeParticipation:true,at:Date.now(),...extra});
function saveReceipt(db,id,matchId,value,revision=2){const save={progression:{totalXPUnits:98765,awards:{[matchId]:{...value,transactionKey:JSON.stringify([id,matchId,'xp'])}}},unchanged:{level:12,career:18}};db.prepare('INSERT INTO worlds(user_id,revision,schema_version,save_json,updated_at,season_start_at,season_end_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,save_json=excluded.save_json').run(id,revision,17,JSON.stringify(save),Date.now(),1,9999999999999);return save;}

test('catalog preserves all 35 ownership definitions but offers only the three distinct modeled outfits',()=>{
  assert.deepEqual(Catalog.packs.map(p=>[p.id,p.moneyCents,p.creditUnits]),[['ac-500',699,50000],['ac-1000',1099,100000],['ac-1500',1499,150000],['ac-3000',2499,300000],['ac-7500',4999,750000],['ac-17500',9999,1750000]]);
  assert.equal(Catalog.cosmetics.length,35);assert.equal(new Set(Catalog.cosmetics.map(c=>c.id)).size,35);
  assert.deepEqual([50000,100000,150000,250000].map(price=>Catalog.cosmetics.filter(c=>c.priceUnits===price).length),[24,4,4,3]);
  for(const operator of Catalog.operators)assert.equal(Catalog.cosmetics.filter(c=>c.operatorId===operator.id&&c.priceUnits===50000).length,3);
  for(const item of Catalog.cosmetics){assert.ok(item.id.startsWith(item.operatorId+'.'));assert.ok(Catalog.operators.some(o=>o.id===item.operatorId));assert.equal(item.styles.length,item.priceUnits===250000?2:1);assert.equal(!!item.lobbyPose,item.priceUnits===250000);}
  const live=Catalog.catalog('test');assert.equal(live.checkoutAvailable,false);assert.equal(live.earningStatus,'validation-required');assert.equal(live.cosmetics.length,35);
  const kept=['urban-assault.containment','steel-recon.aegis','crimson-guard.monarch'];
  assert.deepEqual(live.cosmetics.filter(row=>row.storeListed).map(row=>row.id),kept);
  assert.equal(live.cosmetics.filter(row=>row.saleStatus==='retired').length,32);
  for(const item of live.cosmetics){assert.equal(item.storeListed,item.saleStatus==='active');assert.equal(item.available,item.storeListed&&item.assetStatus==='READY');}
  assert.equal(live.cosmetics.find(row=>row.id==='urban-assault.polar-camo').saleStatus,'retired');
  assert.throws(()=>Wallet.environment('live-typo'),/SAR_COMMERCE_ENV/);
});

test('retired appearances reject new purchases in every environment while existing ownership, styles and order retries remain valid',()=>readyFixture(()=>{
  const db=createDatabase(':memory:'),id=seedUser(db,'retired-collector'),retired=Catalog.cosmetics.filter(row=>row.saleStatus==='retired');
  try{
    fundFixture(db,id,5000000);
    for(const env of ['test','sandbox','production']){
      const before=Wallet.snapshot(db,id,env);
      for(const item of retired)assert.throws(()=>Wallet.purchase(db,id,{cosmeticId:item.id,requestId:'retired-'+item.id.replaceAll('.','-')},env),e=>e.code==='COSMETIC_RETIRED');
      assert.deepEqual(Wallet.snapshot(db,id,env),before);
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cosmetic_orders').get().n,0);
    for(const item of retired){
      const requestId='legacy-'+item.id.replaceAll('.','-'),orderId=legacyPurchaseFixture(db,id,item.id,requestId);
      const before=Wallet.snapshot(db,id,'test'),replay=Wallet.purchase(db,id,{cosmeticId:item.id,requestId},'test');
      assert.equal(replay.replayed,true);assert.equal(replay.order.id,orderId);assert.deepEqual(replay.wallet,before);
      for(const style of item.styles){
        const result=Wallet.equip(db,id,{operatorId:item.operatorId,cosmeticId:item.id,styleId:style.id},'test');
        assert.deepEqual(result.wallet.equipped[item.operatorId],{cosmeticId:item.id,styleId:style.id});
      }
    }
    assert.equal(Wallet.snapshot(db,id,'test').entitlements.length,32);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cosmetic_orders').get().n,32);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ac_ledger WHERE source='cosmetic-purchase'").get().n,32);
  }finally{db.close();}
}));

test('standard and ranked units are exact, exclusions pay zero, identity and retry keys never depend on code versions',()=>{
  const db=createDatabase(':memory:'),id=seedUser(db,'earner');
  try{
    assert.equal(Wallet.snapshot(db,id,'test').balanceUnits,0);
    for(const [kind,mode,expected] of [['standard','tdm',100],['standard','deathmatch',100],['ranked','tdm',150]]){
      const matchId='match:'+kind+mode,r=receipt(id,kind,{mode});assert.equal(Wallet.rewardForParticipation(r,id),expected);
      assert.equal(Wallet.settleVerifiedMatch(db,id,matchId,r,'test').replayed,false);assert.equal(Wallet.settleVerifiedMatch(db,id,matchId,{...r,codeVersion:'future'},'test').replayed,true);
    }
    assert.equal(Wallet.snapshot(db,id,'test').balanceUnits,350);
    for(const extra of [{kind:'official',sessionType:'tournament'},{kind:'custom',sessionType:'custom'},{practice:true},{eligible:false},{spectating:true},{cancelled:true},{completed:false},{participantType:'bot'},{participantId:'other'}, {kind:'ranked',sessionType:'ranked',mode:'deathmatch'}])assert.equal(Wallet.rewardForParticipation(receipt(id,'standard',extra),id),0);
    assert.equal(Wallet.settleVerifiedMatch(db,id,'match:afk',receipt(id,'standard',{activeParticipation:false}),'test').credited,false);
    assert.throws(()=>Wallet.settleVerifiedMatch(db,id,'match:standardtdm',receipt(id,'ranked'),'test'),e=>e.code==='MATCH_CONFLICT');
    for(const env of ['production','sandbox'])assert.throws(()=>Wallet.settleVerifiedMatch(db,id,'match:real',receipt(id),env),e=>e.code==='RESULT_VALIDATION_UNAVAILABLE');
    assert.equal(Wallet.snapshot(db,id,'production').balanceUnits,0);assert.equal(Wallet.snapshot(db,id,'sandbox').balanceUnits,0);
  }finally{db.close();}
});

test('client reports remain pending; no historical award, cross-account proof, duplicate, or client amount can become spendable',()=>{
  const db=createDatabase(':memory:'),id=seedUser(db,'pending');
  try{
    saveReceipt(db,id,'match:old',receipt(id,'standard',{at:1}),7);Wallet.snapshot(db,id,'test');
    assert.throws(()=>Wallet.reportMatch(db,id,{matchId:'match:old'},'test'),e=>e.code==='HISTORICAL_MATCH');
    const walletRow=db.prepare('SELECT created_at FROM ac_wallets WHERE user_id=? AND environment=?').get(id,'test');
    const original=saveReceipt(db,id,'match:new',receipt(id,'ranked',{at:walletRow.created_at+1}),8);
    const result=Wallet.reportMatch(db,id,{matchId:'match:new'},'test');assert.equal(result.report.units,150);assert.equal(result.report.status,'PENDING_VALIDATION');assert.equal(result.wallet.balanceUnits,0);assert.equal(result.wallet.pendingEarnUnits,150);
    assert.equal(Wallet.reportMatch(db,id,{matchId:'match:new'},'test').replayed,true);assert.equal(Wallet.snapshot(db,id,'test').pendingEarnCount,1);
    assert.throws(()=>Wallet.reportMatch(db,id,{matchId:'match:new',units:10000000,accountId:'other'},'test'),e=>e.code==='INVALID_COMMERCE_REQUEST');
    assert.throws(()=>Wallet.reportMatch(db,id,{matchId:'match:missing'},'test'),e=>e.code==='MATCH_NOT_SYNCED');
    assert.deepEqual(JSON.parse(db.prepare('SELECT save_json FROM worlds WHERE user_id=?').get(id).save_json),original);
    const bot=receipt(id,'standard',{participantType:'bot',at:walletRow.created_at+2});saveReceipt(db,id,'match:bot',bot,9);assert.throws(()=>Wallet.reportMatch(db,id,{matchId:'match:bot'},'test'),e=>e.code==='MATCH_INELIGIBLE');
  }finally{db.close();}
});

test('atomic debit, entitlement, owned conflict, style inclusion, free base equip and isolated account/environment state',()=>readyFixture(()=>{
  const db=createDatabase(':memory:'),id=seedUser(db,'buyer'),other=seedUser(db,'other');
  try{
    fundFixture(db,id,300000);
    const request={cosmeticId:'crimson-guard.monarch',requestId:'request-monarch'},result=Wallet.purchase(db,id,request,'test');
    assert.equal(result.wallet.balanceUnits,50000);assert.equal(result.wallet.entitlements.length,1);assert.equal(result.order.priceUnits,250000);
    const retried=Wallet.purchase(db,id,request,'test');assert.equal(retried.order.id,result.order.id);assert.equal(retried.replayed,true);assert.equal(retried.wallet.balanceUnits,50000);
    assert.throws(()=>Wallet.purchase(db,id,{...request,requestId:'another-request'},'test'),e=>e.code==='ALREADY_OWNED');
    assert.throws(()=>Wallet.purchase(db,id,{...request,cosmeticId:'urban-assault.polar-camo'},'test'),e=>e.code==='REQUEST_CONFLICT');
    assert.throws(()=>Wallet.purchase(db,id,{cosmeticId:'steel-recon.aegis',requestId:'request-expensive'},'test'),e=>e.code==='INSUFFICIENT_CREDITS');
    const selection=Wallet.equip(db,id,{operatorId:'crimson-guard',cosmeticId:request.cosmeticId,styleId:'monarch-platinum'},'test').wallet.equipped['crimson-guard'];assert.deepEqual(selection,{cosmeticId:request.cosmeticId,styleId:'monarch-platinum'});
    assert.throws(()=>Wallet.equip(db,id,{operatorId:'crimson-guard',cosmeticId:request.cosmeticId,styleId:'aegis-arctic'},'test'),e=>e.code==='INVALID_STYLE');
    assert.throws(()=>Wallet.equip(db,id,{operatorId:'steel-recon',cosmeticId:request.cosmeticId},'test'),e=>e.code==='OPERATOR_MISMATCH');
    assert.throws(()=>Wallet.equip(db,other,{operatorId:'crimson-guard',cosmeticId:request.cosmeticId},'test'),e=>e.code==='NOT_OWNED');
    assert.equal(Wallet.snapshot(db,id,'production').balanceUnits,0);assert.deepEqual(Wallet.snapshot(db,id,'production').entitlements,[]);assert.equal(Wallet.snapshot(db,other,'test').balanceUnits,0);
    assert.deepEqual(Wallet.equip(db,id,{operatorId:'crimson-guard',cosmeticId:null},'test').wallet.equipped,{});
    for(const body of [{...request,priceUnits:1},{...request,balanceUnits:999999},{...request,accountId:other},{...request,owned:true},{...request,environment:'production'}])assert.throws(()=>Wallet.purchase(db,id,body,'test'),e=>e.code==='INVALID_COMMERCE_REQUEST');
  }finally{db.close();}
}));

test('unfinished assets are unavailable and interruption inside entitlement write rolls back every deduction and order',()=>{
  const db=createDatabase(':memory:'),id=seedUser(db,'interrupt'),original=Catalog.assetReadiness;
  try{
    fundFixture(db,id,150000);const request={cosmeticId:'urban-assault.containment',requestId:'request-recover'};
    Catalog.assetReadiness=()=>({});assert.throws(()=>Wallet.purchase(db,id,request,'test'),e=>e.code==='COSMETIC_UNAVAILABLE');
    Catalog.assetReadiness=()=>({[request.cosmeticId]:true});
    db.exec("CREATE TRIGGER fixture_interrupt BEFORE INSERT ON cosmetic_entitlements BEGIN SELECT RAISE(ABORT,'fixture interruption'); END");
    assert.throws(()=>Wallet.purchase(db,id,request,'test'),/fixture interruption/);assert.equal(Wallet.snapshot(db,id,'test').balanceUnits,150000);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cosmetic_orders').get().n,0);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ac_ledger WHERE source='cosmetic-purchase'").get().n,0);
    db.exec('DROP TRIGGER fixture_interrupt');const completed=Wallet.purchase(db,id,request,'test');assert.equal(completed.wallet.balanceUnits,0);
    assert.equal(Wallet.purchase(db,id,request,'test').order.id,completed.order.id,'lost response/reconnect does not deduct again');
  }finally{Catalog.assetReadiness=original;db.close();}
});

test('ledger is immutable, exact and refuses negative/overflow balances or production fixture credits',()=>{
  const db=createDatabase(':memory:'),id=seedUser(db,'ledger');
  try{
    fundFixture(db,id,150);Wallet.ensureWallet(db,id,'production');
    assert.throws(()=>db.exec('UPDATE ac_ledger SET delta_units=999'),/immutable/);assert.throws(()=>db.exec('DELETE FROM ac_ledger'),/immutable/);
    const insert=(env,delta,source='test-fixture')=>db.prepare('INSERT INTO ac_ledger(id,user_id,environment,idempotency_key,delta_units,source,source_id,created_at) VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),id,env,crypto.randomUUID(),delta,source,'fixture',Date.now());
    assert.throws(()=>insert('test',-151),/balance/);assert.throws(()=>insert('test',0.5),/balance|CHECK/);assert.throws(()=>insert('test',Number.MAX_SAFE_INTEGER),/balance/);assert.throws(()=>insert('production',50000),/CHECK/);
    assert.equal(Wallet.snapshot(db,id,'test').balanceUnits,150);
  }finally{db.close();}
});

test('simultaneous independent SQLite connections cannot double spend a wallet',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sar-wallet-concurrent-')),file=path.join(dir,'fixture.sqlite');let db=createDatabase(file);
  const workers=[];
  try{
    const id=seedUser(db,'parallel');fundFixture(db,id,375000);db.close();db=null;
    const barrier=new SharedArrayBuffer(4),source=`const {parentPort,workerData:w}=require('node:worker_threads');const {createDatabase}=require(w.root+'/server/db.cjs'),Catalog=require(w.root+'/server/commerce-catalog.cjs'),Wallet=require(w.root+'/server/wallet.cjs');Catalog.assetReadiness=()=>({[w.cosmetic]:true});const db=createDatabase(w.file);parentPort.postMessage({ready:true});Atomics.wait(new Int32Array(w.barrier),0,0);try{parentPort.postMessage({ok:true,value:Wallet.purchase(db,'parallel',{cosmeticId:w.cosmetic,requestId:w.request},'test')});}catch(e){parentPort.postMessage({ok:false,code:e.code,message:e.message});}finally{db.close();}`;
    const ready=[],results=[];
    for(const [index,cosmetic]of ['steel-recon.aegis','crimson-guard.monarch'].entries()){
      const worker=new Worker(source,{eval:true,workerData:{root:ROOT,file,barrier,cosmetic,request:'concurrent-'+index}});workers.push(worker);
      ready.push(new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.ready)resolve();});worker.on('error',reject);}));
      results.push(new Promise((resolve,reject)=>{worker.on('message',m=>{if(!m.ready)resolve(m);});worker.on('error',reject);}));
    }
    await Promise.all(ready);Atomics.store(new Int32Array(barrier),0,1);Atomics.notify(new Int32Array(barrier),0,2);
    const values=await Promise.all(results);assert.equal(values.filter(v=>v.ok).length,1);assert.equal(values.find(v=>!v.ok).code,'INSUFFICIENT_CREDITS');
    db=createDatabase(file);assert.equal(Wallet.snapshot(db,'parallel','test').balanceUnits,125000);assert.equal(Wallet.snapshot(db,'parallel','test').entitlements.length,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cosmetic_orders').get().n,1);
  }finally{await Promise.all(workers.map(w=>w.terminate()));db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('schema-5 upgrade backs up original; reopen preserves wallet, selections and existing progression with no remigration',()=>readyFixture(()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sar-wallet-migration-')),file=path.join(dir,'fixture.sqlite');let db=new DatabaseSync(file);
  try{
    for(const name of ['001_core.sql','002_social.sql','003_local_ai.sql','004_live_circuit.sql','005_tactical_instinct.sql'])db.exec(fs.readFileSync(path.join(__dirname,'../migrations',name),'utf8'));
    db.exec('PRAGMA user_version=5');const id=seedUser(db,'preserved-wallet'),save=saveReceipt(db,id,'match:historic',receipt(id,'standard',{at:1}),19);db.close();db=createDatabase(file);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,LATEST_DB_SCHEMA);const backup=fs.readdirSync(dir).filter(p=>p.includes('pre-schema5'));assert.equal(backup.length,1);
    assert.equal(Wallet.snapshot(db,id,'production').balanceUnits,0);assert.deepEqual(JSON.parse(db.prepare('SELECT save_json FROM worlds WHERE user_id=?').get(id).save_json),save);
    fundFixture(db,id,100000);const oldOrder=legacyPurchaseFixture(db,id,'urban-assault.polar-camo','persistent-request');Wallet.equip(db,id,{operatorId:'urban-assault',cosmeticId:'urban-assault.polar-camo',styleId:'main'},'test');const before=Wallet.snapshot(db,id,'test');db.close();db=createDatabase(file);
    assert.deepEqual(Wallet.snapshot(db,id,'test'),before);assert.equal(fs.readdirSync(dir).filter(p=>p.includes('pre-schema5')).length,1);assert.deepEqual(JSON.parse(db.prepare('SELECT save_json FROM worlds WHERE user_id=?').get(id).save_json),save);
    const replay=Wallet.purchase(db,id,{cosmeticId:'urban-assault.polar-camo',requestId:'persistent-request'},'test');assert.equal(replay.replayed,true);assert.equal(replay.order.id,oldOrder);assert.deepEqual(replay.wallet,before);
    const old=new DatabaseSync(path.join(dir,backup[0]),{readOnly:true});assert.equal(old.prepare('PRAGMA user_version').get().user_version,5);assert.deepEqual(JSON.parse(old.prepare('SELECT save_json FROM worlds WHERE user_id=?').get(id).save_json),save);old.close();
  }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
}));

test('authenticated HTTP contracts isolate accounts, reject tampering, reuse completed purchase and keep checkout unavailable',async()=>{
  const previousEnv=process.env.SAR_COMMERCE_ENV,previousAI=process.env.SAR_OLLAMA_URL,originalReady=Catalog.assetReadiness;process.env.SAR_COMMERCE_ENV='test';process.env.SAR_OLLAMA_URL='http://127.0.0.1:1';
  Catalog.assetReadiness=()=>Object.fromEntries(Catalog.cosmetics.map(item=>[item.id,true]));
  const {createServer}=require('../index.cjs'),db=createDatabase(':memory:'),id=seedUser(db,'http-buyer'),other=seedUser(db,'http-other');
  const session=user=>{const token=crypto.randomBytes(32).toString('hex'),now=Date.now();db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),user,now,now+60000,now);return 'sar_session='+token;};
  const cookie=session(id),otherCookie=session(other),app=createServer({db});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
  const request=async(route,body,auth=cookie)=>{const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(auth?{cookie:auth}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json()};};
  try{
    assert.equal((await request('/api/wallet',undefined,null)).status,401);const catalog=await request('/api/commerce/catalog');assert.equal(catalog.data.environment,'test');assert.equal(catalog.data.packs.length,6);
    assert.equal((await request('/api/wallet')).data.balanceUnits,0);fundFixture(db,id,150000);
    const retired=await request('/api/store/purchase',{cosmeticId:'urban-assault.polar-camo',requestId:'http-retired-01'});assert.equal(retired.status,409);assert.equal(retired.data.code,'COSMETIC_RETIRED');
    const body={cosmeticId:'urban-assault.containment',requestId:'http-request-01'};
    assert.equal((await request('/api/store/purchase',{...body,priceUnits:1,userId:other})).status,400);
    const first=await request('/api/store/purchase',body);assert.equal(first.status,200);assert.equal(first.data.wallet.balanceUnits,0);const retry=await request('/api/store/purchase',body);assert.equal(retry.data.order.id,first.data.order.id);assert.equal(retry.data.replayed,true);
    assert.deepEqual((await request('/api/wallet',undefined,otherCookie)).data.entitlements,[]);
    assert.equal((await request('/api/store/equip',{operatorId:'urban-assault',cosmeticId:body.cosmeticId,styleId:'main'},otherCookie)).status,403);
    for(const pack of Catalog.packs){const checkout=await request('/api/shop/checkout',{packId:pack.id,requestId:'checkout-request'});assert.equal(checkout.status,503);assert.equal(checkout.data.code,'CHECKOUT_UNAVAILABLE');}
    assert.equal((await request('/api/shop/checkout',{packId:'unknown'})).status,404);assert.equal((await request('/api/shop/checkout',{packId:'ac-500',creditUnits:999999})).status,400);
    assert.equal((await request('/api/wallet/grant',{units:1000000})).status,404);assert.equal((await request('/api/wallet')).data.balanceUnits,0);
  }finally{await new Promise(resolve=>app.server.close(resolve));db.close();Catalog.assetReadiness=originalReady;if(previousEnv===undefined)delete process.env.SAR_COMMERCE_ENV;else process.env.SAR_COMMERCE_ENV=previousEnv;if(previousAI===undefined)delete process.env.SAR_OLLAMA_URL;else process.env.SAR_OLLAMA_URL=previousAI;}
});
