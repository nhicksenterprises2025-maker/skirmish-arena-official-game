'use strict';
// Runtime credentials stay in the server process. No Stripe/MCP connection is
// inherited from developer tools, and this build has no live-payment path.
const crypto=require('node:crypto');
const StripeClient=require('stripe');
const Catalog=require('./commerce-catalog.cjs'),Wallet=require('./wallet.cjs');
const API_VERSION='2026-09-30.endive',CATALOG_VERSION='overclock-ac-v1';
const TEST_SKIN_OFFER=Object.freeze({id:'skin-urban-polar-camo-test',kind:'cosmetic',cosmeticId:'urban-assault.polar-camo',name:'Urban Assault — Polar Camo',currency:'USD',moneyCents:50,creditUnits:0,catalogKey:'skin_urban_polar_camo_test'});
const fail=(status,message,code)=>Object.assign(new Error(message),{status,code,paymentSafe:true});
const canonicalPack=id=>typeof id==='string'?id.replace(/^ac_/,'ac-'):'';
const objectId=value=>typeof value==='string'?value:value?.id;
const atomic=(db,fn)=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
function configFromEnv(env=process.env){
  const issues=[],config={enabled:false,environment:env.SAR_COMMERCE_ENV||'production',reason:'SANDBOX_DISABLED',issues};
  const issue=(code,setting,catalogKey)=>issues.push({code,setting,...(catalogKey?{catalogKey}:{})});
  if(config.environment!=='sandbox')issue('SANDBOX_ENVIRONMENT_REQUIRED','SAR_COMMERCE_ENV');
  if(env.SAR_STRIPE_SANDBOX_ENABLED!=='true')issue('SANDBOX_NOT_ENABLED','SAR_STRIPE_SANDBOX_ENABLED');
  for(const [setting,pattern] of [['SAR_STRIPE_SECRET_KEY',/^[sr]k_test_[A-Za-z0-9]+$/],['SAR_STRIPE_WEBHOOK_SECRET',/^whsec_[A-Za-z0-9]+$/],['SAR_STRIPE_ACCOUNT_ID',/^acct_[A-Za-z0-9]+$/],['SAR_STRIPE_PAYMENT_METHOD_CONFIGURATION',/^pmc_[A-Za-z0-9]+$/]]){
    if(!env[setting])issue('SETTING_MISSING',setting);else if(!pattern.test(env[setting]))issue('SETTING_INVALID',setting);
  }
  let origin,priceMap={};
  try{origin=new URL(env.SAR_STRIPE_RETURN_ORIGIN||'');const local=['127.0.0.1','localhost','[::1]'].includes(origin.hostname);if((origin.protocol!=='https:'&&!(origin.protocol==='http:'&&local))||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')throw Error();}
  catch{issue(env.SAR_STRIPE_RETURN_ORIGIN?'RETURN_ORIGIN_INVALID':'SETTING_MISSING','SAR_STRIPE_RETURN_ORIGIN');}
  const commonIssues=issues.length;
  try{const prices=JSON.parse(env.SAR_STRIPE_PRICE_MAP||'{}');if(!prices||typeof prices!=='object'||Array.isArray(prices))throw Error();for(const [id,price] of Object.entries(prices)){const key=canonicalPack(id);if(priceMap[key]&&priceMap[key]!==price)throw Error();priceMap[key]=price;}}
  catch{issue('PRICE_MAP_INVALID','SAR_STRIPE_PRICE_MAP');priceMap={};}
  for(const pack of Catalog.packs)if(!/^price_[A-Za-z0-9]+$/.test(priceMap[pack.id]||''))issue(priceMap[pack.id]?'PRICE_MAPPING_INVALID':'PRICE_MAPPING_MISSING','SAR_STRIPE_PRICE_MAP',pack.id.replace('ac-','ac_'));
  if(Object.keys(priceMap).some(id=>!Catalog.packs.some(p=>p.id===id)))issue('PRICE_MAPPING_UNKNOWN','SAR_STRIPE_PRICE_MAP');
  if(new Set(Object.values(priceMap)).size!==Object.values(priceMap).length)issue('PRICE_MAPPING_DUPLICATE','SAR_STRIPE_PRICE_MAP');
  const offerPriceId=/^price_[A-Za-z0-9]+$/.test(env.SAR_STRIPE_TEST_SKIN_PRICE_ID||'')?env.SAR_STRIPE_TEST_SKIN_PRICE_ID:null;
  const offerIssue=env.SAR_STRIPE_TEST_SKIN_PRICE_ID&&!offerPriceId?'TEST_OFFER_PRICE_INVALID':!offerPriceId?'TEST_OFFER_NOT_CONFIGURED':null;
  const packsConfigured=issues.length===commonIssues;
  if(commonIssues||(!packsConfigured&&!offerPriceId))return {...config,reason:config.environment!=='sandbox'||env.SAR_STRIPE_SANDBOX_ENABLED!=='true'?'SANDBOX_DISABLED':'SANDBOX_CONFIGURATION_REQUIRED',offerIssue,packsConfigured};
  return {enabled:true,environment:'sandbox',issues,packsConfigured,offerPriceId,offerIssue,accountId:env.SAR_STRIPE_ACCOUNT_ID,secretKey:env.SAR_STRIPE_SECRET_KEY,webhookSecret:env.SAR_STRIPE_WEBHOOK_SECRET,paymentMethodConfiguration:env.SAR_STRIPE_PAYMENT_METHOD_CONFIGURATION,returnOrigin:origin.origin,priceMap};
}
function checkoutUrl(value){
  try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='checkout.stripe.com'&&!u.username&&!u.password&&!u.port&&/^\/c\/pay\/cs_test_[A-Za-z0-9]+$/.test(u.pathname)?u.href:null;}catch{return null;}
}
function orderJson(row){return {id:row.id,requestId:row.request_id,packId:row.pack_id,kind:row.delivery_kind,cosmeticId:row.cosmetic_id||null,status:row.status,moneyCents:row.money_cents,creditUnits:row.credit_units,currency:row.currency,createdAt:row.created_at,updatedAt:row.updated_at,fulfilledAt:row.fulfilled_at,checkoutUrl:row.status==='pending'?checkoutUrl(row.checkout_url):null,errorCode:row.error_code||null};}
function createPayments({db,config=configFromEnv(),stripe=null,now=Date.now}={}){
  const client=config.enabled?(stripe||new StripeClient(config.secretKey,{apiVersion:API_VERSION,timeout:8000,maxNetworkRetries:1,appInfo:{name:'Skirmish Arena Sandbox',version:CATALOG_VERSION}})):null;
  let readyUntil=0,accountUntil=0,verification=null,verifiedPrices=new Map(),lastCode=config.reason||'SANDBOX_NOT_VERIFIED',offerCode=config.offerIssue||'TEST_OFFER_NOT_VERIFIED';
  const flights=new Map();
  const enabled=()=>config.enabled===true&&config.environment==='sandbox';
  const requireEnabled=()=>{if(!enabled())throw fail(503,'Test checkout is unavailable. No payment was taken.','CHECKOUT_UNAVAILABLE');};
  const remote=async action=>{try{return await action();}catch(error){if(error.paymentSafe)throw error;throw fail(503,'Payment service is unavailable. Check status before trying again.','PAYMENT_SERVICE_UNAVAILABLE');}};
  const getOrder=id=>db.prepare('SELECT * FROM ac_payment_orders WHERE id=? AND environment=? AND stripe_account_id=?').get(id,'sandbox',config.accountId||'');
  const owned=(userId,id)=>{const row=getOrder(id);if(!row||row.user_id!==userId)throw fail(404,'Payment order not found','ORDER_NOT_FOUND');return row;};
  const result=row=>({order:orderJson(row),wallet:Wallet.snapshot(db,row.user_id,'sandbox'),environment:'sandbox'});
  const validate=(condition,code='PAYMENT_VERIFICATION_FAILED')=>{if(!condition)throw fail(422,'Payment details did not match this order. Contact support with the order ID.',code);};
  async function verifyAccount(){requireEnabled();if(accountUntil>now())return;const account=await remote(()=>client.accounts.retrieve());validate(account.id===config.accountId,'STRIPE_ACCOUNT_MISMATCH');accountUntil=now()+30000;}
  async function verifyConfiguration(){
    const report=()=>({ready:true,environment:'sandbox',accountId:config.accountId,creditPacksReady:Catalog.packs.every(p=>verifiedPrices.has(p.id)),testOfferReady:verifiedPrices.has(TEST_SKIN_OFFER.id),testOfferStatus:offerCode});
    requireEnabled();if(readyUntil>now())return report();if(verification)return verification;
    verification=(async()=>{
      await verifyAccount();
      const method=await remote(()=>client.paymentMethodConfigurations.retrieve(config.paymentMethodConfiguration));
      validate(method.id===config.paymentMethodConfiguration&&method.active===true&&method.livemode===false&&method.card?.available===true&&method.card?.display_preference?.value==='on','PAYMENT_METHOD_CONFIGURATION_INVALID');
      const cardMethods=new Set(['card','apple_pay','google_pay','cartes_bancaires','jcb']);
      for(const [name,value] of Object.entries(method))if(value&&typeof value==='object'&&value.display_preference?.value==='on')validate(cardMethods.has(name),'UNAPPROVED_PAYMENT_METHOD');
      const next=new Map();
      function checkPrice(pack,price,priceId){
        const product=price.product,key=pack.catalogKey||pack.id.replace('ac-','ac_');
        validate(price.id===priceId&&price.livemode===false&&price.active===true&&price.type==='one_time'&&!price.recurring&&!price.transform_quantity&&!price.custom_unit_amount&&price.currency==='usd'&&price.unit_amount===pack.moneyCents&&price.billing_scheme==='per_unit','PRICE_CONFIGURATION_INVALID');
        for(const obj of [price,product])validate(obj&&obj.livemode===false&&obj.active===true&&obj.metadata?.game==='skirmish-arena'&&obj.metadata?.catalog_key===key&&obj.metadata?.environment==='sandbox','CATALOG_BINDING_INVALID');
        validate(typeof product.id==='string'&&product.id.startsWith('prod_'),'CATALOG_BINDING_INVALID');
        return {priceId:price.id,productId:product.id,taxBehavior:price.tax_behavior||'unspecified'};
      }
      const [packsResult,offerResult]=await Promise.allSettled([
        (async()=>{if(config.packsConfigured===false)throw fail(503,'Credit pack setup is incomplete.','CREDIT_PACKS_NOT_CONFIGURED');const prices=await Promise.all(Catalog.packs.map(p=>remote(()=>client.prices.retrieve(config.priceMap[p.id],{expand:['product']}))));return Catalog.packs.map((pack,i)=>[pack.id,checkPrice(pack,prices[i],config.priceMap[pack.id])]);})(),
        (async()=>{if(!config.offerPriceId)throw fail(503,'Test skin offer is not configured.',config.offerIssue||'TEST_OFFER_NOT_CONFIGURED');validate(Catalog.assetReadiness()[TEST_SKIN_OFFER.cosmeticId]===true,'TEST_OFFER_ASSET_UNAVAILABLE');return checkPrice(TEST_SKIN_OFFER,await remote(()=>client.prices.retrieve(config.offerPriceId,{expand:['product']})),config.offerPriceId);})()
      ]);
      if(packsResult.status==='fulfilled'){for(const [key,value] of packsResult.value)next.set(key,value);lastCode=null;}else lastCode=packsResult.reason.code||'PAYMENT_SERVICE_UNAVAILABLE';
      if(offerResult.status==='fulfilled'){next.set(TEST_SKIN_OFFER.id,offerResult.value);offerCode=null;}else offerCode=offerResult.reason.code||'PAYMENT_SERVICE_UNAVAILABLE';
      verifiedPrices=next;if(!next.size)throw (config.offerPriceId&&config.packsConfigured===false?offerResult.reason:packsResult.reason);
      readyUntil=now()+30000;return report();
    })().catch(error=>{lastCode=error.code||'PAYMENT_SERVICE_UNAVAILABLE';readyUntil=0;throw error;}).finally(()=>{verification=null;});
    return verification;
  }
  function availability(){
    const current=enabled()&&readyUntil>now(),available=current&&Catalog.packs.every(p=>verifiedPrices.has(p.id)),offerAvailable=current&&verifiedPrices.has(TEST_SKIN_OFFER.id);
    const code=enabled()?lastCode||'SANDBOX_READY':config.reason||'SANDBOX_DISABLED';
    const setup=['SANDBOX_DISABLED','SANDBOX_CONFIGURATION_REQUIRED','CREDIT_PACKS_NOT_CONFIGURED'].includes(code),temporary=code==='PAYMENT_SERVICE_UNAVAILABLE';
    return {checkoutAvailable:available,checkoutStatus:code,paymentEnvironment:'sandbox',checkoutReason:available?'sandbox_ready':setup?'setup_required':temporary?'temporarily_unavailable':'verification_required',checkoutMessage:available?'Test checkout is ready. Sandbox payments do not use real money.':offerAvailable?'Credit packs are currently unavailable. The separate test skin offer is ready.':code==='SANDBOX_DISABLED'?'Checkout is not connected yet. No payment can be taken.':setup?'Test checkout setup is incomplete. No payment can be taken.':temporary?'The payment service is temporarily unavailable. Try again shortly.':'Test checkout needs a configuration review before payments can start.',checkoutOffers:[{...TEST_SKIN_OFFER,available:offerAvailable,status:offerAvailable?'SANDBOX_READY':offerCode||code}]};
  }
  function list(userId){return {orders:enabled()?db.prepare('SELECT * FROM ac_payment_orders WHERE user_id=? AND environment=? AND stripe_account_id=? ORDER BY created_at DESC,id DESC LIMIT 30').all(userId,'sandbox',config.accountId).map(orderJson):[],environment:config.environment};}
  function status(userId,id){requireEnabled();return result(owned(userId,id));}
  async function checkout(userId,body){
    Wallet.onlyFields(body,['packId','requestId']);
    const pack=body.packId===TEST_SKIN_OFFER.id?TEST_SKIN_OFFER:Catalog.packs.find(p=>p.id===canonicalPack(body.packId));if(!pack)throw fail(404,'Purchase item not found','UNKNOWN_PACK');
    if(typeof body.requestId!=='string'||!/^[a-zA-Z0-9:_-]{8,128}$/.test(body.requestId))throw fail(400,'A stable checkout request identifier is required','INVALID_REQUEST_ID');
    requireEnabled();
    // Retry reads the immutable snapshot even if a later catalog deployment changes.
    let row=db.prepare('SELECT * FROM ac_payment_orders WHERE user_id=? AND environment=? AND request_id=?').get(userId,'sandbox',body.requestId),replayed=!!row;
    if(row){validate(row.stripe_account_id===config.accountId,'STRIPE_ACCOUNT_MISMATCH');if(row.pack_id!==pack.id)throw fail(409,'That request identifies another purchase','REQUEST_CONFLICT');}
    if(!row){
      await verifyConfiguration();Wallet.ensureWallet(db,userId,'sandbox');
      if(!verifiedPrices.has(pack.id))throw fail(503,'This checkout item is not connected yet. No payment was taken.',pack.kind==='cosmetic'?'TEST_OFFER_UNAVAILABLE':'CREDIT_PACKS_UNAVAILABLE');
      row=atomic(db,()=>{
        const old=db.prepare('SELECT * FROM ac_payment_orders WHERE user_id=? AND environment=? AND request_id=?').get(userId,'sandbox',body.requestId);
        if(old){validate(old.stripe_account_id===config.accountId,'STRIPE_ACCOUNT_MISMATCH');if(old.pack_id!==pack.id)throw fail(409,'That request identifies another purchase','REQUEST_CONFLICT');replayed=true;return old;}
        if(pack.kind==='cosmetic'){
          if(db.prepare('SELECT 1 FROM cosmetic_entitlements WHERE user_id=? AND environment=? AND cosmetic_id=?').get(userId,'sandbox',pack.cosmeticId))throw fail(409,'You already own this cosmetic','ALREADY_OWNED');
          const pending=db.prepare("SELECT * FROM ac_payment_orders WHERE user_id=? AND environment='sandbox' AND stripe_account_id=? AND cosmetic_id=? AND status IN ('pending','review_required') ORDER BY created_at DESC LIMIT 1").get(userId,config.accountId,pack.cosmeticId);
          if(pending){replayed=true;return pending;}
        }
        const id=crypto.randomUUID(),at=now(),price=verifiedPrices.get(pack.id);
        const suffix=Array.from(crypto.createHash('sha256').update(id).digest().subarray(0,8),x=>String.fromCharCode(97+x%26)).join('');
        const metadata={game:'skirmish-arena',environment:'sandbox',order_id:id,account_id:userId,catalog_key:pack.catalogKey||pack.id.replace('ac-','ac_')};
        const params={mode:'payment',ui_mode:'hosted',line_items:[{price:price.priceId,quantity:1}],client_reference_id:id,metadata,payment_intent_data:{metadata},payment_method_configuration:config.paymentMethodConfiguration,adaptive_pricing:{enabled:false},allow_promotion_codes:false,integration_identifier:'skirmish-sandbox-'+suffix,success_url:config.returnOrigin+'/shop/return?order='+id+'&result=success',cancel_url:config.returnOrigin+'/shop/return?order='+id+'&result=cancel'};
        db.prepare("INSERT INTO ac_payment_orders(id,user_id,environment,stripe_account_id,request_id,pack_id,catalog_version,price_id,product_id,money_cents,credit_units,currency,tax_behavior,idempotency_key,checkout_params_json,delivery_kind,cosmetic_id,status,created_at,updated_at) VALUES(?,?,'sandbox',?,?,?,?,?,?,?,?,'usd',?,?,?,?,?,'pending',?,?)").run(id,userId,config.accountId,body.requestId,pack.id,CATALOG_VERSION,price.priceId,price.productId,pack.moneyCents,pack.creditUnits,price.taxBehavior,'sar-checkout-sandbox-'+id,JSON.stringify(params),pack.kind||'credits',pack.cosmeticId||null,at,at);
        return getOrder(id);
      });
    }
    if(row.status!=='pending'||row.session_id)return {...result(row),checkoutUrl:row.status==='pending'?checkoutUrl(row.checkout_url):null,replayed};
    const id=row.id;
    if(!flights.has('create:'+id))flights.set('create:'+id,(async()=>{
      // Stripe may prune idempotency keys after 24h. An uncertain old create must
      // be reviewed, never silently replayed into a second chargeable session.
      if(now()-row.created_at>=23*3600000){db.prepare("UPDATE ac_payment_orders SET status='review_required',error_code='CREATE_RECOVERY_REQUIRED',updated_at=? WHERE id=? AND session_id IS NULL").run(now(),id);return getOrder(id);}
      await verifyAccount();
      const params=JSON.parse(row.checkout_params_json);
      let session;
      try{session=await remote(()=>client.checkout.sessions.create(params,{idempotencyKey:row.idempotency_key}));}
      catch(error){db.prepare("UPDATE ac_payment_orders SET error_code=?,updated_at=? WHERE id=? AND status='pending'").run(error.code,now(),id);throw error;}
      validate(session.livemode===false&&session.mode==='payment'&&session.client_reference_id===id&&session.metadata?.order_id===id&&checkoutUrl(session.url)&&/^cs_test_/.test(session.id),'CREATED_SESSION_INVALID');
      validate(session.payment_method_types?.length===1&&session.payment_method_types[0]==='card'&&session.payment_method_configuration_details?.id===params.payment_method_configuration&&session.adaptive_pricing?.enabled!==true,'CREATED_PAYMENT_METHOD_INVALID');
      atomic(db,()=>{const current=getOrder(id);validate(!current.session_id||current.session_id===session.id,'SESSION_CONFLICT');db.prepare('UPDATE ac_payment_orders SET session_id=?,checkout_url=?,error_code=NULL,updated_at=? WHERE id=?').run(session.id,checkoutUrl(session.url),now(),id);});
      return getOrder(id);
    })().finally(()=>flights.delete('create:'+id)));
    row=await flights.get('create:'+id);return {...result(row),checkoutUrl:row.status==='pending'?checkoutUrl(row.checkout_url):null,replayed};
  }
  function recordEvent(event,row,outcome){if(!event)return;db.prepare('INSERT INTO ac_payment_events(environment,stripe_account_id,event_id,event_type,object_id,order_id,outcome,created_at) VALUES(?,?,?,?,?,?,?,?)').run('sandbox',config.accountId,event.id,event.type,objectId(event.data?.object)||null,row?.id||null,outcome,now());}
  function eventSeen(event){return event&&db.prepare('SELECT 1 FROM ac_payment_events WHERE environment=? AND stripe_account_id=? AND event_id=?').get('sandbox',config.accountId,event.id);}
  async function fulfillSession(sessionId,event=null,expectedOrder=null){
    await verifyAccount();
    const session=await remote(()=>client.checkout.sessions.retrieve(sessionId,{expand:['payment_intent.latest_charge']}));
    const row=getOrder(session.client_reference_id);validate(row&&(!expectedOrder||row.id===expectedOrder),'ORDER_BINDING_INVALID');
    validate(session.id===sessionId&&/^cs_test_/.test(session.id)&&session.livemode===false&&session.mode==='payment'&&(!row.session_id||row.session_id===session.id),'SESSION_BINDING_INVALID');
    const params=JSON.parse(row.checkout_params_json);
    validate(session.payment_method_types?.length===1&&session.payment_method_types[0]==='card'&&session.payment_method_configuration_details?.id===params.payment_method_configuration&&session.adaptive_pricing?.enabled!==true,'SESSION_PAYMENT_METHOD_INVALID');
    const m=session.metadata;validate(m?.order_id===row.id&&m.account_id===row.user_id&&m.game==='skirmish-arena'&&m.environment==='sandbox'&&m.catalog_key===params.metadata.catalog_key,'ORDER_BINDING_INVALID');
    const lines=await remote(()=>client.checkout.sessions.listLineItems(session.id,{limit:2,expand:['data.price.product']}));
    const line=lines.data?.[0],price=line?.price;
    validate(lines.has_more===false&&lines.data.length===1&&line.quantity===1&&price?.id===row.price_id&&objectId(price.product)===row.product_id&&price.livemode===false&&price.currency===row.currency&&price.unit_amount===row.money_cents&&(price.tax_behavior||'unspecified')===row.tax_behavior&&line.currency===row.currency,'LINE_ITEM_MISMATCH');
    validate(session.currency===row.currency&&session.amount_subtotal===row.money_cents&&session.amount_total===row.money_cents&&line.amount_subtotal===row.money_cents&&line.amount_total===row.money_cents&&Number(session.total_details?.amount_discount||0)===0&&Number(session.total_details?.amount_shipping||0)===0&&Number(session.total_details?.amount_tax||0)===0&&session.automatic_tax?.enabled!==true,'PAYMENT_AMOUNT_MISMATCH');
    const paid=session.payment_status==='paid';let pi=null;
    if(paid){
      validate(session.status==='complete','PAYMENT_NOT_COMPLETE');pi=typeof session.payment_intent==='object'?session.payment_intent:await remote(()=>client.paymentIntents.retrieve(session.payment_intent,{expand:['latest_charge']}));
      validate(pi&&/^pi_/.test(pi.id)&&pi.livemode===false&&pi.status==='succeeded'&&pi.currency===row.currency&&pi.amount===row.money_cents&&pi.amount_received===row.money_cents,'PAYMENT_INTENT_MISMATCH');
      validate(pi.metadata?.order_id===row.id&&pi.metadata?.account_id===row.user_id&&pi.metadata?.environment==='sandbox'&&pi.metadata?.game==='skirmish-arena','PAYMENT_BINDING_INVALID');
      const charge=pi.latest_charge;validate(charge&&typeof charge==='object'&&charge.livemode===false&&charge.paid===true&&charge.captured===true&&charge.currency===row.currency&&charge.amount===row.money_cents&&charge.amount_captured===row.money_cents&&objectId(charge.payment_intent)===pi.id,'CHARGE_BINDING_INVALID');
      validate(charge.payment_method_details?.type==='card','CHARGE_PAYMENT_METHOD_INVALID');
    }
    return atomic(db,()=>{
      const current=getOrder(row.id);if(eventSeen(event))return result(current);
      validate(!current.payment_id||!pi||current.payment_id===pi.id,'PAYMENT_CONFLICT');
      if(paid){
        const duplicate=db.prepare('SELECT id FROM ac_payment_orders WHERE environment=? AND stripe_account_id=? AND payment_id=? AND id!=?').get('sandbox',config.accountId,pi.id,row.id);validate(!duplicate,'PAYMENT_REUSE');
        const charge=pi.latest_charge;
        let review=charge.refunded===true||charge.amount_refunded>0||charge.disputed===true||db.prepare('SELECT 1 FROM ac_payment_reviews WHERE environment=? AND stripe_account_id=? AND (order_id=? OR payment_id=? OR charge_id=?)').get('sandbox',config.accountId,row.id,pi.id,charge.id);
        let ledger=current.ledger_id,delivered=!!current.fulfilled_at||!!ledger,reviewCode='PAYMENT_REVIEW_REQUIRED';
        if(row.delivery_kind==='cosmetic'){
          const entitlement=db.prepare('SELECT payment_order_id FROM cosmetic_entitlements WHERE user_id=? AND environment=? AND cosmetic_id=?').get(row.user_id,'sandbox',row.cosmetic_id);
          if(entitlement&&entitlement.payment_order_id!==row.id){review=true;reviewCode='COSMETIC_ALREADY_OWNED_REVIEW';}
          if(entitlement?.payment_order_id===row.id)delivered=true;
          if(!review&&!delivered){db.prepare('INSERT INTO cosmetic_entitlements(user_id,environment,cosmetic_id,order_id,purchased_at,payment_order_id) VALUES(?,?,?,NULL,?,?)').run(row.user_id,'sandbox',row.cosmetic_id,now(),row.id);delivered=true;}
        }else if(!ledger&&!review){ledger=crypto.randomUUID();db.prepare('INSERT INTO ac_ledger(id,user_id,environment,idempotency_key,delta_units,source,source_id,created_at) VALUES(?,?,?,?,?,?,?,?)').run(ledger,row.user_id,'sandbox',JSON.stringify(['payment',config.accountId,pi.id]),row.credit_units,'payment',row.id,now());delivered=true;}
        db.prepare('UPDATE ac_payment_orders SET session_id=?,payment_id=?,charge_id=?,ledger_id=?,status=?,error_code=?,fulfilled_at=?,updated_at=? WHERE id=?').run(session.id,pi.id,charge.id,ledger,review?'review_required':'fulfilled',review?reviewCode:null,current.fulfilled_at||(delivered?now():null),now(),row.id);
      }else if(!current.fulfilled_at&&!current.ledger_id&&current.status!=='review_required'){
        const next=session.status==='expired'?'expired':event?.type==='checkout.session.async_payment_failed'?'failed':'pending';
        // Stale event deliveries always consult current Stripe state; final paid
        // states cannot regress because an old unpaid event arrives afterwards.
        db.prepare('UPDATE ac_payment_orders SET session_id=?,status=?,error_code=?,updated_at=? WHERE id=?').run(session.id,next,next==='failed'?'PAYMENT_FAILED':null,now(),row.id);
      }
      const updated=getOrder(row.id);recordEvent(event,updated,updated.status);return result(updated);
    });
  }
  async function reconcile(userId,id){
    requireEnabled();const row=owned(userId,id);if(!row.session_id)return result(row);
    const key='reconcile:'+id;if(!flights.has(key))flights.set(key,fulfillSession(row.session_id,null,id).finally(()=>flights.delete(key)));return flights.get(key);
  }
  async function webhook(raw,signature){
    requireEnabled();let event;try{event=client.webhooks.constructEvent(raw,signature,config.webhookSecret,300);}catch{throw fail(400,'Invalid payment event signature','INVALID_WEBHOOK_SIGNATURE');}
    validate(event.livemode===false&&(!event.account||event.account===config.accountId)&&(!event.context||event.context===config.accountId),'WEBHOOK_ENVIRONMENT_MISMATCH');
    validate(/^evt_[A-Za-z0-9]+$/.test(event.id||'')&&typeof event.type==='string','INVALID_WEBHOOK_EVENT');
    if(eventSeen(event))return {received:true,replayed:true};
    const type=event.type;
    if(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'].includes(type)){
      validate(/^cs_test_[A-Za-z0-9]+$/.test(event.data?.object?.id||''),'INVALID_WEBHOOK_SESSION');await fulfillSession(event.data.object.id,event);return {received:true};
    }
    if(type==='charge.refunded'||type.startsWith('charge.dispute.')||['refund.created','refund.updated','refund.failed'].includes(type)){
      await verifyAccount();const value=event.data?.object||{},payment=objectId(value.payment_intent)||null,charge=type==='charge.refunded'?value.id:objectId(value.charge)||null;
      atomic(db,()=>{if(eventSeen(event))return;const row=db.prepare('SELECT * FROM ac_payment_orders WHERE environment=? AND stripe_account_id=? AND (payment_id=? OR charge_id=?)').get('sandbox',config.accountId,payment,charge);
        db.prepare('INSERT INTO ac_payment_reviews(environment,stripe_account_id,event_id,order_id,payment_id,charge_id,object_id,reason,amount_cents,currency,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('sandbox',config.accountId,event.id,row?.id||null,payment,charge,value.id||null,type,Number.isSafeInteger(value.amount)?value.amount:null,typeof value.currency==='string'?value.currency:null,now());
        if(row)db.prepare("UPDATE ac_payment_orders SET status='review_required',error_code='PAYMENT_REVIEW_REQUIRED',updated_at=? WHERE id=?").run(now(),row.id);
        recordEvent(event,row,'review_required');
      });return {received:true};
    }
    atomic(db,()=>{if(!eventSeen(event))recordEvent(event,null,'ignored');});return {received:true};
  }
  return {checkout,list,status,reconcile,webhook,availability,verifyConfiguration,fulfillSession};
}
module.exports={createPayments,configFromEnv,canonicalPack,checkoutUrl,orderJson,API_VERSION,CATALOG_VERSION,TEST_SKIN_OFFER};
