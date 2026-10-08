'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {Worker}=require('node:worker_threads'),{DatabaseSync}=require('node:sqlite');
const {fixture,fakeStripe}=require('./payment-fixture.cjs'),{createDatabase,LATEST_DB_SCHEMA}=require('../db.cjs');
const {createPayments,configFromEnv,TEST_SKIN_OFFER:offer}=require('../payments.cjs'),Wallet=require('../wallet.cjs'),Catalog=require('../commerce-catalog.cjs');
function skinFixture(file=':memory:'){const f=fixture(file);f.config.offerPriceId='price_fixtureSkin';f.fake=fakeStripe(f.config);f.payments=createPayments({db:f.db,config:f.config,stripe:f.fake.client});return f;}
const start=(f,id=crypto.randomUUID())=>f.payments.checkout('buyer',{packId:offer.id,requestId:id});
const sessionId=(f,id)=>f.db.prepare('SELECT session_id FROM ac_payment_orders WHERE id=?').get(id).session_id;
const owns=f=>Wallet.snapshot(f.db,'buyer','sandbox').entitlements.some(e=>e.cosmeticId===offer.cosmeticId);
const signed=(f,id,type)=>f.fake.signed(f.fake.event(id,type));

test('named configuration diagnostics reveal no values; public messages remain bounded and fail closed',async()=>{
  const f=skinFixture();try{
    const missing=configFromEnv({});assert.equal(missing.reason,'SANDBOX_DISABLED');assert.equal(missing.issues.filter(i=>i.code==='PRICE_MAPPING_MISSING').length,6);assert.ok(missing.issues.some(i=>i.setting==='SAR_STRIPE_SECRET_KEY'));
    const env={SAR_COMMERCE_ENV:'sandbox',SAR_STRIPE_SANDBOX_ENABLED:'true',SAR_STRIPE_ACCOUNT_ID:f.config.accountId,SAR_STRIPE_SECRET_KEY:f.config.secretKey,SAR_STRIPE_WEBHOOK_SECRET:f.config.webhookSecret,SAR_STRIPE_PAYMENT_METHOD_CONFIGURATION:f.config.paymentMethodConfiguration,SAR_STRIPE_RETURN_ORIGIN:f.config.returnOrigin,SAR_STRIPE_TEST_SKIN_PRICE_ID:f.config.offerPriceId};
    const onlyOffer=configFromEnv(env);assert.equal(onlyOffer.enabled,true);assert.equal(onlyOffer.packsConfigured,false);assert.equal(onlyOffer.issues.length,6);
    const invalid=configFromEnv({...env,SAR_STRIPE_SECRET_KEY:'do-not-print-this-value'});assert.equal(invalid.enabled,false);assert.ok(!JSON.stringify(invalid.issues).includes('do-not-print-this-value'));assert.deepEqual(invalid.issues.find(i=>i.setting==='SAR_STRIPE_SECRET_KEY'),{code:'SETTING_INVALID',setting:'SAR_STRIPE_SECRET_KEY'});
    for(const config of [missing,invalid]){const availability=createPayments({db:f.db,config}).availability();assert.equal(availability.checkoutAvailable,false);assert.equal(availability.checkoutOffers[0].available,false);assert.equal(availability.checkoutReason,'setup_required');assert.ok(!JSON.stringify(availability).includes('SECRET_KEY'));}
  }finally{f.db.close();}
});

test('optional skin offer and six credit packs verify independently, including mismatched or unavailable mappings',async()=>{
  const f=skinFixture();try{
    const config={...f.config,packsConfigured:false,priceMap:{}};const only=createPayments({db:f.db,config,stripe:f.fake.client});const ready=await only.verifyConfiguration();assert.equal(ready.creditPacksReady,false);assert.equal(ready.testOfferReady,true);assert.equal(only.availability().checkoutAvailable,false);assert.equal(only.availability().checkoutOffers[0].available,true);assert.match(only.availability().checkoutMessage,/separate test skin offer is ready/);
    assert.equal((await only.checkout('buyer',{packId:offer.id,requestId:'offer-only-request'})).order.moneyCents,50);await assert.rejects(only.checkout('buyer',{packId:'ac-500',requestId:'credits-missing-request'}),e=>e.code==='CREDIT_PACKS_UNAVAILABLE');
    const credits=createPayments({db:f.db,config:{...f.config,offerPriceId:null},stripe:f.fake.client});await credits.verifyConfiguration();assert.equal(credits.availability().checkoutAvailable,true);assert.equal(credits.availability().checkoutOffers[0].available,false);await assert.rejects(credits.checkout('other',{packId:offer.id,requestId:'offer-not-configured'}),e=>e.code==='TEST_OFFER_UNAVAILABLE');
    f.fake.prices.find(p=>p.id===f.config.offerPriceId).unit_amount=1;const badOffer=createPayments({db:f.db,config:f.config,stripe:f.fake.client});await badOffer.verifyConfiguration();assert.equal(badOffer.availability().checkoutAvailable,true);assert.equal(badOffer.availability().checkoutOffers[0].available,false);
    f.fake.prices.find(p=>p.id===f.config.offerPriceId).unit_amount=50;f.fake.prices[0].metadata.environment='production';const badCredits=createPayments({db:f.db,config:f.config,stripe:f.fake.client});await badCredits.verifyConfiguration();assert.equal(badCredits.availability().checkoutAvailable,false);assert.equal(badCredits.availability().checkoutOffers[0].available,true);
  }finally{f.db.close();}
});

test('merchant configuration race cannot return another sandbox account checkout during the atomic retry lookup',async()=>{
  const f=skinFixture();let release;try{
    const configB={...f.config,accountId:'acct_secondFixture'},fakeB=fakeStripe(configB),paymentsB=createPayments({db:f.db,config:configB,stripe:fakeB.client});
    const retrieve=f.fake.client.paymentMethodConfigurations.retrieve;let entered;const waiting=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
    f.fake.client.paymentMethodConfigurations.retrieve=async(...args)=>{entered();await gate;return retrieve(...args);};
    const first=f.payments.checkout('buyer',{packId:'ac-500',requestId:'merchant-race-request'});await waiting;
    const second=await paymentsB.checkout('buyer',{packId:'ac-500',requestId:'merchant-race-request'});assert.equal(second.order.status,'pending');release();await assert.rejects(first,e=>e.code==='STRIPE_ACCOUNT_MISMATCH');assert.equal(f.fake.calls.length,0);assert.equal(fakeB.calls.length,1);
  }finally{release?.();f.db.close();}
});

test('verified fifty-cent skin payment grants the existing retired cosmetic once with zero AC changes or ledger rows',async()=>{
  const f=skinFixture();try{
    assert.equal(Catalog.cosmetics.find(c=>c.id===offer.cosmeticId).saleStatus,'retired');assert.throws(()=>Wallet.purchase(f.db,'buyer',{cosmeticId:offer.cosmeticId,requestId:'regular-retired-buy'},'sandbox'),e=>e.code==='COSMETIC_RETIRED');
    const before=Wallet.snapshot(f.db,'buyer','sandbox'),first=await start(f,'skin-first-request'),id=sessionId(f,first.order.id);assert.equal(first.order.kind,'cosmetic');assert.equal(first.order.cosmeticId,offer.cosmeticId);assert.equal(first.order.moneyCents,50);assert.equal(first.order.creditUnits,0);
    const s=f.fake.paid(id);assert.equal(s.amount_total,50);await f.payments.webhook(...signed(f,id));await f.payments.webhook(...signed(f,id,'checkout.session.async_payment_succeeded'));await f.payments.reconcile('buyer',first.order.id);
    const result=f.payments.status('buyer',first.order.id);assert.equal(result.order.status,'fulfilled');assert.equal(result.wallet.balanceUnits,before.balanceUnits);assert.ok(owns(f));assert.equal(f.db.prepare('SELECT COUNT(*) n FROM ac_ledger').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM cosmetic_orders').get().n,0);
    const ownership=f.db.prepare('SELECT * FROM cosmetic_entitlements').get();assert.equal(ownership.order_id,null);assert.equal(ownership.payment_order_id,first.order.id);
    assert.equal((await start(f,'skin-first-request')).order.id,first.order.id);await assert.rejects(start(f,'skin-second-request'),e=>e.code==='ALREADY_OWNED');
    Wallet.equip(f.db,'buyer',{operatorId:'urban-assault',cosmeticId:offer.cosmeticId,styleId:'main'},'sandbox');assert.equal(Wallet.snapshot(f.db,'buyer','sandbox').equipped['urban-assault'].cosmeticId,offer.cosmeticId);
    assert.deepEqual(Wallet.snapshot(f.db,'buyer','production').entitlements,[]);assert.equal(Wallet.snapshot(f.db,'buyer','production').balanceUnits,0);assert.deepEqual(Wallet.snapshot(f.db,'other','sandbox').entitlements,[]);
    assert.throws(()=>f.db.prepare('UPDATE ac_payment_orders SET cosmetic_id=? WHERE id=?').run('urban-assault.carbon-camo',first.order.id),/immutable/);
  }finally{f.db.close();}
});

test('different pending request IDs reuse one skin order; concurrent verified events atomically record ownership and completion',async()=>{
  const f=skinFixture();try{
    const starts=await Promise.all(Array.from({length:6},(_,i)=>start(f,'skin-click-'+i)));assert.equal(new Set(starts.map(v=>v.order.id)).size,1);assert.equal(new Set(starts.map(v=>v.order.requestId)).size,1);assert.equal(f.fake.calls.length,1);
    const id=sessionId(f,starts[0].order.id);f.fake.paid(id);const event=f.fake.event(id);
    f.db.exec("CREATE TRIGGER fixture_skin_stop BEFORE INSERT ON ac_payment_events BEGIN SELECT RAISE(ABORT,'skin commit interruption'); END");await assert.rejects(f.payments.webhook(...f.fake.signed(event)),/skin commit interruption/);assert.equal(owns(f),false);assert.equal(f.payments.status('buyer',starts[0].order.id).order.status,'pending');f.db.exec('DROP TRIGGER fixture_skin_stop');
    await Promise.all([f.payments.webhook(...f.fake.signed(event)),f.payments.webhook(...f.fake.signed(event)),...Array.from({length:5},()=>f.payments.webhook(...signed(f,id))),f.payments.reconcile('buyer',starts[0].order.id)]);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM cosmetic_entitlements').get().n,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM ac_ledger').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM ac_payment_events').get().n,6);
  }finally{f.db.close();}
});

test('unpaid, failed, expired, forged and wrong-account skin requests never grant; delayed verified success preserves ownership',async()=>{
  const f=skinFixture();try{
    const first=await start(f),id=sessionId(f,first.order.id),session=f.fake.sessions.get(id);session.status='complete';await f.payments.webhook(...signed(f,id));assert.equal(owns(f),false);
    await f.payments.webhook(...signed(f,id,'checkout.session.async_payment_failed'));assert.equal(owns(f),false);
    assert.throws(()=>f.payments.status('other',first.order.id),e=>e.code==='ORDER_NOT_FOUND');await assert.rejects(f.payments.reconcile('other',first.order.id),e=>e.code==='ORDER_NOT_FOUND');
    await assert.rejects(f.payments.checkout('buyer',{packId:offer.id,requestId:'tampered-price',moneyCents:1}),e=>e.code==='INVALID_COMMERCE_REQUEST');await assert.rejects(f.payments.checkout('buyer',{packId:offer.id,requestId:'tampered-skin',cosmeticId:'steel-recon.aegis'}),e=>e.code==='INVALID_COMMERCE_REQUEST');
    const live={...f.fake.event(id),livemode:true};await assert.rejects(f.payments.webhook(...f.fake.signed(live)),e=>e.code==='WEBHOOK_ENVIRONMENT_MISMATCH');
    f.fake.paid(id);const clone=JSON.stringify(f.fake.sessions.get(id));f.fake.sessions.get(id).amount_total=1;await assert.rejects(f.payments.webhook(...signed(f,id)),e=>e.code==='PAYMENT_AMOUNT_MISMATCH');assert.equal(owns(f),false);f.fake.sessions.set(id,JSON.parse(clone));
    await f.payments.webhook(...signed(f,id,'checkout.session.async_payment_succeeded'));assert.equal(owns(f),true);await f.payments.webhook(...signed(f,id,'checkout.session.expired'));assert.equal(f.payments.status('buyer',first.order.id).order.status,'fulfilled');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM ac_ledger').get().n,0);
  }finally{f.db.close();}
});

test('skin refund/dispute review retains existing entitlement; pre-delivery refund does not create ownership',async()=>{
  const f=skinFixture();try{
    const first=await start(f),id=sessionId(f,first.order.id),s=f.fake.paid(id);await f.payments.webhook(...signed(f,id));
    const review=f.fake.event('re_skin','refund.created',{data:{object:{id:'re_skin',payment_intent:s.payment_intent.id,charge:s.payment_intent.latest_charge.id,amount:50,currency:'usd'}}});await f.payments.webhook(...f.fake.signed(review));await f.payments.webhook(...signed(f,id));assert.equal(owns(f),true);assert.equal(f.payments.status('buyer',first.order.id).order.status,'review_required');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM ac_ledger').get().n,0);
    const second=await f.payments.checkout('other',{packId:offer.id,requestId:'skin-other-refund'}),otherId=sessionId(f,second.order.id),other=f.fake.paid(otherId);const early=f.fake.event('re_early','refund.created',{data:{object:{id:'re_early',payment_intent:other.payment_intent.id,charge:other.payment_intent.latest_charge.id,amount:50,currency:'usd'}}});await f.payments.webhook(...f.fake.signed(early));await f.payments.webhook(...signed(f,otherId));assert.deepEqual(Wallet.snapshot(f.db,'other','sandbox').entitlements,[]);assert.equal(f.payments.status('other',second.order.id).order.status,'review_required');
  }finally{f.db.close();}
});

test('schema7 commerce upgrade preserves real linked orders/events/ledger/ownership/equip/world and a recoverable original',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sar-skin-migration-')),file=path.join(dir,'fixture.sqlite');let db=new DatabaseSync(file);
  try{
    db.exec('PRAGMA foreign_keys=ON');for(const name of fs.readdirSync(path.join(__dirname,'../migrations')).filter(n=>/^00[1-7]_/.test(n)).sort())db.exec(fs.readFileSync(path.join(__dirname,'../migrations',name),'utf8'));db.exec('PRAGMA user_version=7');
    db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('buyer','buyer','buyer','fixture-only',1,1);Wallet.ensureWallet(db,'buyer','sandbox');
    const world={progression:{totalXPUnits:77441,level:17},career:{wins:10},seasons:{number:9}};db.prepare('INSERT INTO worlds(user_id,revision,schema_version,save_json,updated_at,season_start_at,season_end_at) VALUES(?,?,?,?,?,?,?)').run('buyer',55,17,JSON.stringify(world),1,1,9999999999999);
    db.prepare('INSERT INTO ac_ledger(id,user_id,environment,idempotency_key,delta_units,source,source_id,created_at) VALUES(?,?,?,?,?,?,?,?)').run('fixture-payment-ledger','buyer','sandbox','fixture-payment-key',300000,'payment','fixture-old-payment',1);
    db.prepare("INSERT INTO ac_payment_orders(id,user_id,environment,stripe_account_id,request_id,pack_id,catalog_version,price_id,product_id,money_cents,credit_units,currency,tax_behavior,idempotency_key,checkout_params_json,status,session_id,payment_id,charge_id,ledger_id,created_at,updated_at,fulfilled_at) VALUES(?,?,'sandbox',?,?,?,?,?,?,?,?,'usd',?,?,?,'fulfilled',?,?,?,?,?,?,?)").run('fixture-old-payment','buyer','acct_fixture','fixture-request','ac-3000','overclock-ac-v1','price_fixture','prod_fixture',2499,300000,'unspecified','fixture-stripe-key','{}','cs_test_old','pi_old','ch_old','fixture-payment-ledger',1,1,1);
    db.prepare('INSERT INTO ac_payment_events(environment,stripe_account_id,event_id,event_type,object_id,order_id,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)').run('sandbox','acct_fixture','evt_old','checkout.session.completed','cs_test_old','fixture-old-payment','fulfilled',1);
    db.prepare('INSERT INTO ac_payment_reviews(environment,stripe_account_id,event_id,order_id,reason,created_at) VALUES(?,?,?,?,?,?)').run('sandbox','acct_fixture','evt_oldreview','fixture-old-payment','fixture-review',1);
    Wallet.purchase(db,'buyer',{cosmeticId:'crimson-guard.monarch',requestId:'fixture-monarch'},'sandbox');Wallet.equip(db,'buyer',{cosmeticId:'crimson-guard.monarch',operatorId:'crimson-guard',styleId:'monarch-platinum'},'sandbox');
    const tables=['users','worlds','ac_wallets','ac_ledger','ac_payment_orders','ac_payment_events','ac_payment_reviews','cosmetic_orders','cosmetic_entitlements','cosmetic_equipment'],before=Object.fromEntries(tables.map(t=>[t,db.prepare('SELECT * FROM '+t).all()]));db.close();db=null;db=createDatabase(file);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,LATEST_DB_SCHEMA);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    for(const table of tables){const after=db.prepare('SELECT * FROM '+table).all();assert.equal(after.length,before[table].length);for(let i=0;i<after.length;i++)for(const key of Object.keys(before[table][i]))assert.deepEqual(after[i][key],before[table][i][key],table+'.'+key);}
    assert.equal(db.prepare('SELECT delivery_kind FROM ac_payment_orders').get().delivery_kind,'credits');assert.equal(db.prepare('SELECT payment_order_id FROM cosmetic_entitlements').get().payment_order_id,null);
    const backups=fs.readdirSync(dir).filter(n=>n.includes('.pre-schema7-')&&n.endsWith('.sqlite'));assert.equal(backups.length,1);const backup=new DatabaseSync(path.join(dir,backups[0]),{readOnly:true});assert.equal(backup.prepare('PRAGMA user_version').get().user_version,7);assert.equal(backup.prepare('SELECT save_json FROM worlds').get().save_json,JSON.stringify(world));backup.close();db.close();db=createDatabase(file);assert.equal(fs.readdirSync(dir).filter(n=>n.includes('.pre-schema7-')&&n.endsWith('.sqlite')).length,1);
  }finally{if(db)db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('interrupted schema8 rebuild rolls back original tables, closes the handle and can retry without losing data',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sar-skin-rollback-')),file=path.join(dir,'fixture.sqlite');let db=new DatabaseSync(file);const read=fs.readFileSync;
  try{
    db.exec('PRAGMA foreign_keys=ON');for(const name of fs.readdirSync(path.join(__dirname,'../migrations')).filter(n=>/^00[1-7]_/.test(n)).sort())db.exec(read(path.join(__dirname,'../migrations',name),'utf8'));db.exec('PRAGMA user_version=7');
    db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('recover','recover','recover','fixture-only',1,1);Wallet.ensureWallet(db,'recover','test');db.prepare('INSERT INTO ac_ledger(id,user_id,environment,idempotency_key,delta_units,source,source_id,created_at) VALUES(?,?,?,?,?,?,?,?)').run('old-credit','recover','test','old-key',54321,'test-fixture','old-fixture',1);db.close();db=null;
    fs.readFileSync=(target,...args)=>{const value=read(target,...args);return String(target).endsWith('008_sandbox_skin_offer.sql')?value+"\nINSERT INTO cosmetic_equipment(user_id,environment,operator_id,cosmetic_id,style_id,updated_at) VALUES('missing','sandbox','urban-assault','missing','main',1);":value;};
    assert.throws(()=>createDatabase(file),/foreign-key integrity check/);fs.readFileSync=read;
    db=new DatabaseSync(file);assert.equal(db.prepare('PRAGMA user_version').get().user_version,7);assert.equal(db.prepare('SELECT balance_units FROM ac_wallets').get().balance_units,54321);assert.equal(db.prepare('SELECT COUNT(*) n FROM cosmetic_equipment').get().n,0);assert.equal(db.prepare('PRAGMA table_info(cosmetic_entitlements)').all().some(c=>c.name==='payment_order_id'),false);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);db.close();db=null;
    const backups=fs.readdirSync(dir).filter(n=>n.includes('.pre-schema7-')&&n.endsWith('.sqlite'));assert.equal(backups.length,1);const backup=new DatabaseSync(path.join(dir,backups[0]),{readOnly:true});assert.equal(backup.prepare('SELECT balance_units FROM ac_wallets').get().balance_units,54321);backup.close();
    db=createDatabase(file);assert.equal(db.prepare('PRAGMA user_version').get().user_version,LATEST_DB_SCHEMA);assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);assert.equal(Wallet.snapshot(db,'recover','test').balanceUnits,54321);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{fs.readFileSync=read;if(db)db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('independent restarted SQLite connections deliver one skin and keep equip after reopen with zero currency movement',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sar-skin-workers-')),file=path.join(dir,'fixture.sqlite'),f=skinFixture(file);let db=f.db;const workers=[];
  try{
    const first=await start(f),id=sessionId(f,first.order.id);f.fake.paid(id);const state=f.fake.state(),config=f.config;db.close();db=null;
    const source=`const {parentPort,workerData:w}=require('node:worker_threads');const {createDatabase,LATEST_DB_SCHEMA}=require(w.dbModule),{createPayments}=require(w.paymentModule),{fakeStripe}=require(w.fixtureModule);const db=createDatabase(w.file),fake=fakeStripe(w.config,w.state),payments=createPayments({db,config:w.config,stripe:fake.client});parentPort.postMessage('ready');parentPort.once('message',async()=>{try{await payments.webhook(...fake.signed(fake.event(w.id)));parentPort.postMessage({ok:true});}catch(e){parentPort.postMessage({ok:false,message:e.message});}finally{db.close();}});`;
    for(let i=0;i<4;i++)workers.push(new Worker(source,{eval:true,workerData:{file,config,state,id,dbModule:require.resolve('../db.cjs'),paymentModule:require.resolve('../payments.cjs'),fixtureModule:require.resolve('./payment-fixture.cjs')}}));await Promise.all(workers.map(w=>new Promise((resolve,reject)=>{w.once('message',resolve);w.once('error',reject);})));const done=workers.map(w=>new Promise((resolve,reject)=>{w.once('message',resolve);w.once('error',reject);}));workers.forEach(w=>w.postMessage('go'));for(const value of await Promise.all(done))assert.equal(value.ok,true,value.message);
    db=createDatabase(file);assert.equal(db.prepare('SELECT COUNT(*) n FROM cosmetic_entitlements').get().n,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM ac_ledger').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM ac_payment_events').get().n,4);Wallet.equip(db,'buyer',{operatorId:'urban-assault',cosmeticId:offer.cosmeticId,styleId:'main'},'sandbox');db.close();db=createDatabase(file);assert.equal(Wallet.snapshot(db,'buyer','sandbox').equipped['urban-assault'].cosmeticId,offer.cosmeticId);assert.equal(Wallet.snapshot(db,'buyer','sandbox').balanceUnits,0);assert.equal(db.prepare('SELECT status FROM ac_payment_orders').get().status,'fulfilled');
  }finally{await Promise.all(workers.map(w=>w.terminate()));if(db)db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
