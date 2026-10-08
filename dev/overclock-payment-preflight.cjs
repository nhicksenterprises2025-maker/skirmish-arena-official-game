'use strict';
// Read-only provider checks against an ephemeral database. Never print config,
// SDK errors, credentials, headers or payment/customer responses.
const {createDatabase}=require('../server/db.cjs');
const {configFromEnv,createPayments,API_VERSION,CATALOG_VERSION}=require('../server/payments.cjs');
(async()=>{
  const config=configFromEnv();
  const report={sandboxOnly:true,liveActivation:false,sdkVersion:require('stripe').PACKAGE_VERSION,apiVersion:API_VERSION,catalogVersion:CATALOG_VERSION};
  if(!config.enabled){console.log(JSON.stringify({...report,ready:false,code:config.reason,configurationIssues:config.issues||[],testOfferStatus:config.offerIssue||'TEST_OFFER_NOT_CONFIGURED'}));process.exitCode=2;return;}
  const db=createDatabase(':memory:');
  try{
    const readiness=await createPayments({db,config}).verifyConfiguration();
    console.log(JSON.stringify({...report,...readiness,configurationIssues:config.issues||[]}));
  }catch(error){
    const allowed=new Set(['STRIPE_ACCOUNT_MISMATCH','PAYMENT_METHOD_CONFIGURATION_INVALID','UNAPPROVED_PAYMENT_METHOD','PRICE_CONFIGURATION_INVALID','CATALOG_BINDING_INVALID','PAYMENT_SERVICE_UNAVAILABLE','CREDIT_PACKS_NOT_CONFIGURED','TEST_OFFER_NOT_CONFIGURED','TEST_OFFER_PRICE_INVALID','TEST_OFFER_ASSET_UNAVAILABLE']);
    console.log(JSON.stringify({...report,ready:false,code:allowed.has(error.code)?error.code:'PAYMENT_PREFLIGHT_FAILED',configurationIssues:config.issues||[]}));process.exitCode=2;
  }finally{db.close();}
})().catch(()=>{console.log(JSON.stringify({ready:false,liveActivation:false,code:'PAYMENT_PREFLIGHT_FAILED'}));process.exitCode=2;});
