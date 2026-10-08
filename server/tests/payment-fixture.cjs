'use strict';
// Isolated SDK-signature fixtures: these never contact Stripe or create money.
const crypto=require('node:crypto'),Stripe=require('stripe'),Catalog=require('../commerce-catalog.cjs');
const {createDatabase}=require('../db.cjs'),{createPayments,TEST_SKIN_OFFER}=require('../payments.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
function makeConfig(){return {enabled:true,environment:'sandbox',accountId:'acct_fixture',secretKey:['sk','test',crypto.randomBytes(20).toString('hex')].join('_'),webhookSecret:['whsec',crypto.randomBytes(20).toString('hex')].join('_'),paymentMethodConfiguration:'pmc_fixture',returnOrigin:'http://127.0.0.1:8803',priceMap:Object.fromEntries(Catalog.packs.map(p=>[p.id,'price_fixture'+p.creditUnits]))};}
function fakeStripe(config,state={}){
  const sdk=new Stripe(config.secretKey),sessions=new Map(state.sessions||[]),intents=new Map(state.intents||[]),lines=new Map(state.lines||[]),requests=new Map(),calls=[];
  const items=[...Catalog.packs,...(config.offerPriceId?[TEST_SKIN_OFFER]:[])];
  const prices=items.map(p=>({id:p.kind==='cosmetic'?config.offerPriceId:config.priceMap[p.id],active:true,livemode:false,type:'one_time',billing_scheme:'per_unit',currency:'usd',unit_amount:p.moneyCents,tax_behavior:'unspecified',metadata:{game:'skirmish-arena',catalog_key:p.catalogKey||p.id.replace('ac-','ac_'),environment:'sandbox'},product:{id:'prod_fixture'+p.creditUnits,active:true,livemode:false,metadata:{game:'skirmish-arena',catalog_key:p.catalogKey||p.id.replace('ac-','ac_'),environment:'sandbox'}}}));
  const client={webhooks:sdk.webhooks,accounts:{retrieve:async()=>({id:config.accountId})},prices:{retrieve:async id=>clone(prices.find(p=>p.id===id))},paymentMethodConfigurations:{retrieve:async()=>({id:config.paymentMethodConfiguration,active:true,livemode:false,card:{available:true,display_preference:{value:'on'}}})},paymentIntents:{retrieve:async id=>clone(intents.get(id))},checkout:{sessions:{
    create:async(params,options)=>{
      calls.push({params:clone(params),options:clone(options)});
      if(requests.has(options.idempotencyKey))return clone(sessions.get(requests.get(options.idempotencyKey)));
      const price=prices.find(p=>p.id===params.line_items[0].price),id='cs_test_'+crypto.randomBytes(16).toString('hex');
      const session={id,livemode:false,mode:'payment',status:'open',payment_status:'unpaid',client_reference_id:params.client_reference_id,metadata:params.metadata,payment_method_types:['card'],payment_method_configuration_details:{id:params.payment_method_configuration},adaptive_pricing:{enabled:false},currency:'usd',amount_subtotal:price.unit_amount,amount_total:price.unit_amount,total_details:{amount_discount:0,amount_shipping:0,amount_tax:0},automatic_tax:{enabled:false},payment_intent:null,url:'https://checkout.stripe.com/c/pay/'+id+'#fixture'};
      sessions.set(id,session);requests.set(options.idempotencyKey,id);lines.set(id,{has_more:false,data:[{id:'li_fixture',quantity:1,price,currency:'usd',amount_subtotal:price.unit_amount,amount_total:price.unit_amount}]});return clone(session);
    },retrieve:async id=>clone(sessions.get(id)),listLineItems:async id=>clone(lines.get(id))
  }}};
  function paid(id){const session=sessions.get(id),piId='pi_'+crypto.randomBytes(14).toString('hex'),charge={id:'ch_'+crypto.randomBytes(14).toString('hex'),payment_intent:piId,payment_method_details:{type:'card'},livemode:false,paid:true,captured:true,currency:session.currency,amount:session.amount_total,amount_captured:session.amount_total,amount_refunded:0,refunded:false,disputed:false};
    const pi={id:piId,livemode:false,status:'succeeded',currency:session.currency,amount:session.amount_total,amount_received:session.amount_total,metadata:{...session.metadata},latest_charge:charge};intents.set(piId,pi);session.status='complete';session.payment_status='paid';session.payment_intent=pi;return session;
  }
  function event(sessionId,type='checkout.session.completed',extra={}){return {id:'evt_'+crypto.randomBytes(14).toString('hex'),object:'event',type,livemode:false,created:Math.floor(Date.now()/1000),data:{object:{id:sessionId}},...extra};}
  function signed(event){const raw=JSON.stringify(event);return [Buffer.from(raw),sdk.webhooks.generateTestHeaderString({payload:raw,secret:config.webhookSecret})];}
  return {client,sessions,intents,lines,prices,calls,paid,event,signed,state:()=>({sessions:[...sessions],intents:[...intents],lines:[...lines]})};
}
function fixture(file=':memory:'){
  const db=createDatabase(file),config=makeConfig(),fake=fakeStripe(config);
  for(const id of ['buyer','other'])db.prepare('INSERT OR IGNORE INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,id,id,'fixture-not-login',Date.now(),Date.now());
  const payments=createPayments({db,config,stripe:fake.client});return {db,config,fake,payments};
}
module.exports={makeConfig,fakeStripe,fixture};
