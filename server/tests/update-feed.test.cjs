'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Feed=require('../update-feed.cjs');
async function configured(value,run){const old=process.env.SAR_UPDATE_FEED_BASE;try{if(value===undefined)delete process.env.SAR_UPDATE_FEED_BASE;else process.env.SAR_UPDATE_FEED_BASE=value;await run();}finally{if(old===undefined)delete process.env.SAR_UPDATE_FEED_BASE;else process.env.SAR_UPDATE_FEED_BASE=old;}}
test('hosted updates preserve exact signed manifest and detached signature bytes',async()=>configured('https://github.com/example/game/releases/latest/download/',async()=>{
 const bytes=Buffer.from('{"version":"1.15.0"}\r\n'),signature=Buffer.from('unmodified-signature\n');let requests=[];
 const fetchImpl=async(url,options)=>{requests.push({url:String(url),options});return new Response(String(url).endsWith('.sig')?signature:bytes);};
 assert.deepEqual(await Feed.read('update.json',{fetchImpl}),bytes);assert.deepEqual(await Feed.read('update.json.sig',{fetchImpl}),signature);
 assert.equal(requests[0].url,'https://github.com/example/game/releases/latest/download/update.json');assert.equal(requests[0].options.headers.accept,'application/json');assert.equal(requests[1].options.headers.accept,'text/plain');assert.ok(requests.every(r=>r.options.signal instanceof AbortSignal));
}));
test('unpublished hosted release and unconfigured feed use existing no-update behavior',async()=>{
 await configured(undefined,async()=>assert.equal(await Feed.read('update.json',{fetchImpl:()=>{throw Error('must not fetch');}}),null));
 await configured('https://example.com/releases',async()=>{for(const status of [204,404])assert.equal(await Feed.read('update.json',{fetchImpl:async()=>new Response(null,{status})}),null);});
});
test('hosted update source and filenames reject credentials and arbitrary requests',async()=>{
 for(const value of ['http://example.com/releases','https://name:secret@example.com/releases','https://example.com/releases?token=secret','https://example.com/releases#fragment'])await configured(value,async()=>assert.throws(()=>Feed.feedBase(),/public HTTPS/));
 await assert.rejects(Feed.read('../account.sqlite'),{status:400});
});
test('failed or excessive feed downloads are bounded and do not produce partial updates',async()=>configured('https://example.com/releases',async()=>{
 await assert.rejects(Feed.read('update.json',{fetchImpl:async()=>new Response(null,{status:502})}),{status:503});
 const underlying=Error('network unavailable');await assert.rejects(Feed.read('update.json',{fetchImpl:async()=>{throw underlying;}}),error=>error.status===503&&error.cause===underlying);
 await assert.rejects(Feed.read('update.json',{fetchImpl:async()=>new Response(Buffer.alloc(256001))}),{status:502});
 await assert.rejects(Feed.read('update.json',{fetchImpl:async()=>({ok:true,body:(async function*(){yield Buffer.from('partial');throw Error('connection closed');})()})}),{status:503});
}));
