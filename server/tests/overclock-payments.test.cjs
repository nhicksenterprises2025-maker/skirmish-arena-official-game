'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{Worker}=require('node:worker_threads');
const {fixture,fakeStripe,makeConfig}=require('./payment-fixture.cjs');
const {createPayments,configFromEnv,API_VERSION}=require('../payments.cjs'),{createDatabase}=require('../db.cjs'),Wallet=require('../wallet.cjs'),Catalog=require('../commerce-catalog.cjs');
const checkout=(f,packId='ac-500',requestId=crypto.randomUUID())=>f.payments.checkout('buyer',{packId,requestId});
const sessionId=(f,id)=>f.db.prepare('SELECT session_id FROM ac_payment_orders WHERE id=?').get(id).session_id;
const balance=f=>Wallet.snapshot(f.db,'buyer','sandbox').balanceUnits;

test('configuration is sandbox-only, exact six mappings, verified identity/catalog/card configuration; no unapproved methods',async()=>{
  const f=fixture();try{
    assert.equal(API_VERSION,require('stripe').API_VERSION);
    assert.equal(configFromEnv({}).enabled,false);assert.equal(configFromEnv({SAR_COMMERCE_ENV:'production',SAR_STRIPE_SANDBOX_ENABLED:'true'}).enabled,false);
    const env={SAR_COMMERCE_ENV:'sandbox',SAR_STRIPE_SANDBOX_ENABLED:'true',SAR_STRIPE_ACCOUNT_ID:f.config.accountId,SAR_STRIPE_SECRET_KEY:f.config.secretKey,SAR_STRIPE_WEBHOOK_SECRET:f.config.webhookSecret,SAR_STRIPE_PAYMENT_METHOD_CONFIGURATION:f.config.paymentMethodConfiguration,SAR_STRIPE_RETURN_ORIGIN:f.config.returnOrigin,SAR_STRIPE_PRICE_MAP:JSON.stringify(f.config.priceMap)};
    assert.equal(configFromEnv(env).enabled,true);
    for(const extra of [{SAR_STRIPE_SECRET_KEY:f.config.secretKey.replace('_test_','_live_')},{SAR_STRIPE_RETURN_ORIGIN:'http://untrusted.example'},{SAR_STRIPE_RETURN_ORIGIN:'https://example.org/?user=1'},{SAR_STRIPE_PRICE_MAP:'{}'}])assert.equal(configFromEnv({...env,...extra}).enabled,false);
    await f.payments.verifyConfiguration();assert.equal(f.payments.availability().checkoutAvailable,true);
    const verify=()=>createPayments({db:f.db,config:f.config,stripe:f.fake.client}).verifyConfiguration();
    f.fake.client.paymentMethodConfigurations.retrieve=async()=>({id:f.config.paymentMethodConfiguration,active:true,livemode:false,card:{available:true,display_preference:{value:'on'}},klarna:{available:true,display_preference:{value:'on'}}});
    await assert.rejects(verify,e=>e.code==='UNAPPROVED_PAYMENT_METHOD');
    f.fake.client.accounts.retrieve=async()=>({id:'acct_other'});await assert.rejects(verify,e=>e.code==='STRIPE_ACCOUNT_MISMATCH');
    await assert.rejects(createPayments({db:f.db,config:{enabled:false,environment:'production'}}).checkout('buyer',{packId:'ac-500',requestId:'request-disabled'}),e=>e.code==='CHECKOUT_UNAVAILABLE');
  }finally{f.db.close();}
});

test('all six packs snapshot exact dollars/credits; underscore aliases preserve IDs; SDK params contain fixed server prices and idempotency',async()=>{
  const f=fixture();try{
    for(const pack of Catalog.packs){
      const start=await checkout(f,pack.id.replace('ac-','ac_')),row=f.db.prepare('SELECT * FROM ac_payment_orders WHERE id=?').get(start.order.id);
      assert.equal(start.order.packId,pack.id);assert.equal(start.order.moneyCents,pack.moneyCents);assert.equal(start.order.creditUnits,pack.creditUnits);assert.equal(start.order.status,'pending');assert.equal(row.price_id,f.config.priceMap[pack.id]);
      const call=f.fake.calls.at(-1);assert.deepEqual(call.params.line_items,[{price:row.price_id,quantity:1}]);assert.equal(call.options.idempotencyKey,row.idempotency_key);assert.ok(!('payment_method_types' in call.params));assert.equal(call.params.adaptive_pricing.enabled,false);assert.equal(call.params.allow_promotion_codes,false);assert.equal(call.params.payment_method_configuration,f.config.paymentMethodConfiguration);assert.match(call.params.integration_identifier,/^skirmish-sandbox-[a-z]{8}$/);
      f.fake.paid(row.session_id);await f.payments.webhook(...f.fake.signed(f.fake.event(row.session_id)));assert.equal(f.payments.status('buyer',row.id).order.status,'fulfilled');
    }
    assert.equal(balance(f),Catalog.packs.reduce((n,p)=>n+p.creditUnits,0));assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ac_ledger WHERE source='payment'").get().n,6);
    assert.equal(Wallet.snapshot(f.db,'buyer','production').balanceUnits,0);assert.deepEqual(Wallet.snapshot(f.db,'buyer','production').entitlements,[]);
  }finally{f.db.close();}
});

test('persist before API; retry, parallel clicks, lost response and intentional later purchase obey stable order identity',async()=>{
  const f=fixture();try{
    const create=f.fake.client.checkout.sessions.create;
    f.fake.client.checkout.sessions.create=async(p,o)=>{assert.equal(f.db.prepare('SELECT COUNT(*) n FROM ac_payment_orders WHERE id=?').get(p.client_reference_id).n,1);return create(p,o);};
    const bodies=await Promise.all(Array.from({length:8},()=>checkout(f,'ac-500','request-same')));assert.equal(new Set(bodies.map(v=>v.order.id)).size,1);assert.equal(f.fake.calls.length,1);
    await assert.rejects(checkout(f,'ac-1000','request-same'),e=>e.code==='REQUEST_CONFLICT');
    let lose=true;f.fake.client.checkout.sessions.create=async(p,o)=>{const s=await create(p,o);if(lose){lose=false;throw new Error('simulated network loss after Stripe create');}return s;};
    await assert.rejects(checkout(f,'ac-500','request-lost'),e=>e.code==='PAYMENT_SERVICE_UNAVAILABLE');
    const recovered=await checkout(f,'ac-500','request-lost');assert.equal(recovered.replayed,true);assert.equal(f.fake.sessions.size,2);
    const later=await checkout(f);assert.notEqual(later.order.id,bodies[0].order.id);assert.equal(f.fake.sessions.size,3);
    assert.throws(()=>f.db.prepare('UPDATE ac_payment_orders SET credit_units=999 WHERE id=?').run(later.order.id),/immutable/);
  }finally{f.db.close();}
});

test('completed unpaid, cancelled return, expiry and delayed failure grant zero; later verified success fulfills exactly once',async()=>{
  const f=fixture();try{
    const start=await checkout(f),id=sessionId(f,start.order.id),s=f.fake.sessions.get(id);
    s.status='complete';await f.payments.webhook(...f.fake.signed(f.fake.event(id)));assert.equal(balance(f),0);assert.equal(f.payments.status('buyer',start.order.id).order.status,'pending');
    await f.payments.webhook(...f.fake.signed(f.fake.event(id,'checkout.session.async_payment_failed')));assert.equal(f.payments.status('buyer',start.order.id).order.status,'failed');assert.equal(balance(f),0);
    f.fake.paid(id);await f.payments.webhook(...f.fake.signed(f.fake.event(id,'checkout.session.async_payment_succeeded')));assert.equal(balance(f),50000);
    await f.payments.webhook(...f.fake.signed(f.fake.event(id,'checkout.session.expired')));assert.equal(f.payments.status('buyer',start.order.id).order.status,'fulfilled');assert.equal(balance(f),50000);
    const exp=await checkout(f),expId=sessionId(f,exp.order.id);f.fake.sessions.get(expId).status='expired';await f.payments.webhook(...f.fake.signed(f.fake.event(expId,'checkout.session.expired')));assert.equal(f.payments.status('buyer',exp.order.id).order.status,'expired');assert.equal(balance(f),50000);
  }finally{f.db.close();}
});

test('SDK raw signatures, environment/account/pack tampering, line item and payment binding fail closed',async()=>{
  const f=fixture();try{
    for(const field of ['moneyCents','creditUnits','accountId','environment','priceId','returnUrl'])await assert.rejects(f.payments.checkout('buyer',{packId:'ac-500',requestId:'request-tamper',[field]:'untrusted'}),e=>e.code==='INVALID_COMMERCE_REQUEST');
    const start=await checkout(f),id=sessionId(f,start.order.id),event=f.fake.event(id),signed=f.fake.signed(event);
    await assert.rejects(f.payments.webhook(Buffer.from(signed[0].toString()+' '),signed[1]),e=>e.code==='INVALID_WEBHOOK_SIGNATURE');
    await assert.rejects(f.payments.webhook(...f.fake.signed({...event,livemode:true})),e=>e.code==='WEBHOOK_ENVIRONMENT_MISMATCH');
    await assert.rejects(f.payments.webhook(...f.fake.signed({...event,account:'acct_other'})),e=>e.code==='WEBHOOK_ENVIRONMENT_MISMATCH');
    assert.throws(()=>f.payments.status('other',start.order.id),e=>e.code==='ORDER_NOT_FOUND');await assert.rejects(f.payments.reconcile('other',start.order.id),e=>e.code==='ORDER_NOT_FOUND');assert.deepEqual(f.payments.list('other').orders,[]);
    f.fake.paid(id);const original=JSON.stringify(f.fake.sessions.get(id)),line=JSON.stringify(f.fake.lines.get(id));
    const mutate=[s=>s.metadata.account_id='other',s=>s.client_reference_id=crypto.randomUUID(),s=>s.amount_total=1,s=>s.currency='eur',s=>s.total_details.amount_tax=1,s=>s.payment_intent.metadata.order_id='different',s=>s.payment_intent.amount_received=1,s=>s.payment_intent.latest_charge.payment_intent='pi_other',s=>s.livemode=true];
    for(const change of mutate){f.fake.sessions.set(id,JSON.parse(original));change(f.fake.sessions.get(id));await assert.rejects(f.payments.webhook(...f.fake.signed(f.fake.event(id))),e=>e.status===422);assert.equal(balance(f),0);}
    f.fake.sessions.set(id,JSON.parse(original));for(const change of [l=>l.data[0].quantity=2,l=>l.data[0].price.id='price_other',l=>l.has_more=true,l=>l.data[0].amount_total=1]){f.fake.lines.set(id,JSON.parse(line));change(f.fake.lines.get(id));await assert.rejects(f.payments.webhook(...f.fake.signed(f.fake.event(id))),e=>e.status===422);assert.equal(balance(f),0);}
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM ac_payment_events').get().n,0);
  }finally{f.db.close();}
});

test('ledger/order/event commit together; duplicate distinct events and concurrent reconciliation cannot double credit',async()=>{
  const f=fixture();try{
    const start=await checkout(f),id=sessionId(f,start.order.id);f.fake.paid(id);const event=f.fake.event(id);
    f.db.exec("CREATE TRIGGER fixture_payment_stop BEFORE INSERT ON ac_payment_events BEGIN SELECT RAISE(ABORT,'fixture payment interruption'); END");
    await assert.rejects(f.payments.webhook(...f.fake.signed(event)),/fixture payment interruption/);assert.equal(balance(f),0);assert.equal(f.payments.status('buyer',start.order.id).order.status,'pending');
    f.db.exec('DROP TRIGGER fixture_payment_stop');
    await Promise.all([f.payments.webhook(...f.fake.signed(event)),f.payments.webhook(...f.fake.signed(event)),...Array.from({length:6},()=>f.payments.webhook(...f.fake.signed(f.fake.event(id)))),f.payments.reconcile('buyer',start.order.id)]);
    assert.equal(balance(f),50000);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ac_ledger WHERE source='payment'").get().n,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM ac_payment_events').get().n,7);
    const second=await checkout(f),otherId=sessionId(f,second.order.id),other=f.fake.sessions.get(otherId),first=f.fake.sessions.get(id);other.status='complete';other.payment_status='paid';other.payment_intent=JSON.parse(JSON.stringify(first.payment_intent));other.payment_intent.metadata={...other.metadata};
    await assert.rejects(f.payments.webhook(...f.fake.signed(f.fake.event(otherId))),e=>e.code==='PAYMENT_REUSE');assert.equal(balance(f),50000);
  }finally{f.db.close();}
});

test('refund/dispute recording keeps traceable review state, never auto reverses credits; out-of-order review blocks premature grant',async()=>{
  const f=fixture();try{
    const start=await checkout(f),id=sessionId(f,start.order.id),s=f.fake.paid(id);await f.payments.webhook(...f.fake.signed(f.fake.event(id)));
    const review=f.fake.event('dp_fixture','charge.dispute.created',{data:{object:{id:'dp_fixture',payment_intent:s.payment_intent.id,charge:s.payment_intent.latest_charge.id,amount:699,currency:'usd'}}});await f.payments.webhook(...f.fake.signed(review));await f.payments.webhook(...f.fake.signed(review));assert.equal(balance(f),50000);assert.equal(f.payments.status('buyer',start.order.id).order.status,'review_required');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM ac_payment_reviews').get().n,1);
    await f.payments.webhook(...f.fake.signed(f.fake.event(id)));assert.equal(balance(f),50000);assert.equal(f.payments.status('buyer',start.order.id).order.status,'review_required');
    const next=await checkout(f),nextId=sessionId(f,next.order.id),paid=f.fake.paid(nextId),ref=f.fake.event('re_fixture','refund.created',{data:{object:{id:'re_fixture',payment_intent:paid.payment_intent.id,charge:paid.payment_intent.latest_charge.id,amount:699,currency:'usd'}}});
    await f.payments.webhook(...f.fake.signed(ref));await f.payments.webhook(...f.fake.signed(f.fake.event(nextId)));assert.equal(balance(f),50000);assert.equal(f.payments.status('buyer',next.order.id).order.status,'review_required');
  }finally{f.db.close();}
});

test('restart before/after delivery survives closed game; verified wallet buys/equips real catalog atomically and stays sandbox-only',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sar-payment-restart-')),file=path.join(dir,'fixture.sqlite');const f=fixture(file);let db=f.db;
  try{
    const world={progression:{totalXPUnits:98640},careers:{played:51},season:12};db.prepare('INSERT INTO worlds(user_id,revision,schema_version,save_json,updated_at,season_start_at,season_end_at) VALUES(?,?,?,?,?,?,?)').run('buyer',1,17,JSON.stringify(world),Date.now(),1,9999999999999);
    const start=await checkout(f,'ac-3000'),id=sessionId(f,start.order.id);f.fake.paid(id);db.close();db=createDatabase(file);
    let p=createPayments({db,config:f.config,stripe:f.fake.client});await p.webhook(...f.fake.signed(f.fake.event(id)));assert.equal(p.status('buyer',start.order.id).wallet.balanceUnits,300000);db.close();db=createDatabase(file);p=createPayments({db,config:f.config,stripe:f.fake.client});
    await p.reconcile('buyer',start.order.id);assert.equal(p.status('buyer',start.order.id).wallet.balanceUnits,300000);
    const purchase={cosmeticId:'crimson-guard.monarch',requestId:'paid-signature-purchase'};assert.equal(Wallet.purchase(db,'buyer',purchase,'sandbox').wallet.balanceUnits,50000);assert.equal(Wallet.purchase(db,'buyer',purchase,'sandbox').replayed,true);
    Wallet.equip(db,'buyer',{operatorId:'crimson-guard',cosmeticId:purchase.cosmeticId,styleId:'monarch-platinum'},'sandbox');db.close();db=createDatabase(file);
    assert.equal(Wallet.snapshot(db,'buyer','sandbox').equipped['crimson-guard'].styleId,'monarch-platinum');assert.equal(Wallet.snapshot(db,'buyer','production').balanceUnits,0);assert.deepEqual(Wallet.snapshot(db,'buyer','production').entitlements,[]);assert.equal(db.prepare('SELECT save_json FROM worlds WHERE user_id=?').get('buyer').save_json,JSON.stringify(world));
  }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('independent SQLite connections serialize simultaneous signed deliveries after server restart',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sar-payment-concurrent-')),file=path.join(dir,'fixture.sqlite'),f=fixture(file);let db=f.db;const workers=[];
  try{
    const start=await checkout(f),id=sessionId(f,start.order.id);f.fake.paid(id);const state=f.fake.state(),config=f.config;db.close();db=null;
    const source=`const {parentPort,workerData}=require('node:worker_threads');const {createDatabase}=require(workerData.dbModule),{createPayments}=require(workerData.paymentModule),{fakeStripe}=require(workerData.fixtureModule);const db=createDatabase(workerData.file),fake=fakeStripe(workerData.config,workerData.state),payments=createPayments({db,config:workerData.config,stripe:fake.client});parentPort.postMessage('ready');parentPort.once('message',async()=>{try{await payments.webhook(...fake.signed(fake.event(workerData.id)));parentPort.postMessage({ok:true});}catch(e){parentPort.postMessage({ok:false,code:e.code,message:e.message});}finally{db.close();}});`;
    for(let i=0;i<4;i++)workers.push(new Worker(source,{eval:true,workerData:{file,config,state,id,dbModule:require.resolve('../db.cjs'),paymentModule:require.resolve('../payments.cjs'),fixtureModule:require.resolve('./payment-fixture.cjs')}}));
    await Promise.all(workers.map(w=>new Promise((resolve,reject)=>{w.once('message',resolve);w.once('error',reject);})));const done=workers.map(w=>new Promise((resolve,reject)=>{w.once('message',resolve);w.once('error',reject);}));workers.forEach(w=>w.postMessage('go'));for(const r of await Promise.all(done))assert.equal(r.ok,true,r.message);
    db=createDatabase(file);assert.equal(Wallet.snapshot(db,'buyer','sandbox').balanceUnits,50000);assert.equal(db.prepare('SELECT COUNT(*) n FROM ac_payment_events').get().n,4);assert.equal(db.prepare("SELECT COUNT(*) n FROM ac_ledger WHERE source='payment'").get().n,1);
  }finally{await Promise.all(workers.map(w=>w.terminate()));if(db)db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('uncertain create older than Stripe retention requires review instead of duplicating a session',async()=>{
  const f=fixture();try{
    f.fake.client.checkout.sessions.create=async()=>{throw Error('offline fixture');};await assert.rejects(checkout(f,'ac-500','request-timeout'));
    const created=f.db.prepare('SELECT * FROM ac_payment_orders').get();const p=createPayments({db:f.db,config:f.config,stripe:f.fake.client,now:()=>created.created_at+24*3600000});
    assert.equal((await p.checkout('buyer',{packId:'ac-500',requestId:'request-timeout'})).order.status,'review_required');assert.equal(balance(f),0);
  }finally{f.db.close();}
});

test('retry after configuration changes repeats the exact snapshotted request; unsafe prices and unexpected methods never expose checkout',async()=>{
  const f=fixture();try{
    const create=f.fake.client.checkout.sessions.create;let first=true;
    f.fake.client.checkout.sessions.create=async(p,o)=>{const s=await create(p,o);if(first){first=false;throw Error('lost response');}return s;};
    await assert.rejects(checkout(f,'ac-500','request-reconfigure'));const original=f.fake.calls[0];
    const changed=createPayments({db:f.db,config:{...f.config,paymentMethodConfiguration:'pmc_newconfig',returnOrigin:'https://example.org'},stripe:f.fake.client});
    const recovered=await changed.checkout('buyer',{packId:'ac-500',requestId:'request-reconfigure'});assert.equal(recovered.order.status,'pending');assert.deepEqual(f.fake.calls[1],original);
    for(const change of [p=>p.transform_quantity={divide_by:10,round:'up'},p=>p.custom_unit_amount={enabled:true},p=>p.metadata.catalog_key='ac_wrong']){
      const fresh=fixture();try{change(fresh.fake.prices[0]);await assert.rejects(fresh.payments.verifyConfiguration(),e=>e.status===422);assert.equal(fresh.fake.calls.length,0);}finally{fresh.db.close();}
    }
    f.fake.client.checkout.sessions.create=async(p,o)=>({...await create(p,o),payment_method_types:['card','klarna']});await assert.rejects(checkout(f),e=>e.code==='CREATED_PAYMENT_METHOD_INVALID');
    const id=sessionId(f,recovered.order.id);f.fake.paid(id);f.fake.sessions.get(id).payment_intent.latest_charge.payment_method_details.type='klarna';await assert.rejects(changed.webhook(...f.fake.signed(f.fake.event(id))),e=>e.code==='CHARGE_PAYMENT_METHOD_INVALID');assert.equal(balance(f),0);
  }finally{f.db.close();}
});

test('authenticated HTTP checkout/status/reconcile, raw-body signatures and neutral returns preserve origin protection',async()=>{
  const f=fixture(),oldEnv=process.env.SAR_COMMERCE_ENV;let server;
  try{
    process.env.SAR_COMMERCE_ENV='sandbox';
    const {createServer}=require('../index.cjs');({server}=createServer({db:f.db,paymentOptions:{config:f.config,stripe:f.fake.client}}));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
    for(const id of ['buyer','other'])f.db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)').run(crypto.createHash('sha256').update('fixture-'+id).digest('hex'),id,Date.now(),Date.now()+60000,Date.now());
    const request=async(url,{method='GET',body,cookie='buyer',headers={}}={})=>fetch(origin+url,{method,headers:{...(cookie?{cookie:'sar_session=fixture-'+cookie}:{}),...(body!==undefined?{'content-type':'application/json'}:{}),...headers},body:body!==undefined?JSON.stringify(body):undefined});
    assert.equal((await request('/api/shop/checkout',{method:'POST',body:{packId:'ac-500',requestId:'request-http'},cookie:null})).status,401);
    assert.equal((await request('/api/shop/checkout',{method:'POST',body:{packId:'ac-500',requestId:'request-http'},headers:{origin:'https://hostile.example'}})).status,403);
    const response=await request('/api/shop/checkout',{method:'POST',body:{packId:'ac-500',requestId:'request-http'},headers:{origin}});assert.equal(response.status,200);const start=await response.json(),id=sessionId(f,start.order.id);
    assert.equal((await request('/api/shop/orders/'+start.order.id,{cookie:'other'})).status,404);
    const returns=await request('/shop/return?order='+start.order.id+'&result=success',{cookie:null});assert.equal(returns.status,200);assert.match(await returns.text(),/does not confirm a payment/);assert.equal(balance(f),0);
    let signed=f.fake.signed(f.fake.event(id));const bad=await fetch(origin+'/api/payments/stripe/webhook',{method:'POST',headers:{'content-type':'application/json','stripe-signature':signed[1]},body:signed[0].toString()+' '});assert.equal(bad.status,400);
    f.fake.paid(id);signed=f.fake.signed(f.fake.event(id));const good=await fetch(origin+'/api/payments/stripe/webhook',{method:'POST',headers:{'content-type':'application/json','stripe-signature':signed[1],origin:'https://api.stripe.com'},body:signed[0]});assert.equal(good.status,200);assert.equal(balance(f),50000);
    const status=await request('/api/shop/orders/'+start.order.id+'/reconcile',{method:'POST',body:{},headers:{origin}});assert.equal(status.status,200);assert.equal((await status.json()).wallet.balanceUnits,50000);
    assert.equal((await request('/api/shop/orders')).headers.get('cache-control'),'no-store');assert.equal((await (await request('/api/shop/orders')).json()).orders.length,1);
  }finally{if(server)await new Promise(resolve=>server.close(resolve));f.db.close();if(oldEnv===undefined)delete process.env.SAR_COMMERCE_ENV;else process.env.SAR_COMMERCE_ENV=oldEnv;}
});
