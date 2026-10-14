'use strict';
// A hosted instance can serve the existing signed GitHub release feed without
// placing installers or signing keys inside its application image/database.
const fail=(status,message)=>Object.assign(new Error(message),{status});
function feedBase(){
 const value=process.env.SAR_UPDATE_FEED_BASE;if(!value)return null;
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('Hosted update feed must be a public HTTPS release directory');
 return value.replace(/\/$/,'')+'/';
}
async function read(name,{fetchImpl=fetch}={}){
 if(!['update.json','update.json.sig'].includes(name))throw fail(400,'Invalid update feed file');
 const base=feedBase();if(!base)return null;
 let response;try{response=await fetchImpl(new URL(name,base),{signal:AbortSignal.timeout(15000),headers:{accept:name.endsWith('.sig')?'text/plain':'application/json'}});}catch(cause){throw Object.assign(fail(503,'The signed update feed could not be reached'),{cause});}
 if(response.status===404||response.status===204)return null;
 if(!response.ok)throw fail(503,'The signed update feed is temporarily unavailable');
 const chunks=[];let size=0;
 try{for await(const chunk of response.body){size+=chunk.length;if(size>256000)throw fail(502,'The signed update feed is too large');chunks.push(chunk);}}catch(cause){if(cause.status)throw cause;throw Object.assign(fail(503,'The signed update feed was interrupted'),{cause});}
 return Buffer.concat(chunks);
}
module.exports={read,feedBase};
