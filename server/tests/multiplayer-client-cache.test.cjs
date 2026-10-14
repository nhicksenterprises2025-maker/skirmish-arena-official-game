'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
// Exercise the real transport client with deterministic delayed browser events.
// No fixture is persisted to an installed account or sent to a real service.
function fixture(){
 const sockets=[],intervals=[],storage=new Map(),events=[];let now=100;
 class Socket{static OPEN=1;static CONNECTING=0;constructor(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this);}send(text){this.sent.push(JSON.parse(text));}close(){this.readyState=3;}open(){this.readyState=1;this.onopen?.();}message(type,data,id){this.onmessage?.({data:JSON.stringify({type,data,...(id?{id}:{})})});}closed(code=1000){this.onclose?.({code});}}
 const window={SAR:{},SARCloud:{state:{account:{id:'account:one'},localMode:false,authExpired:false}},SARStorage:{get:key=>storage.get(key)??null,set:(key,value)=>storage.set(key,value)},dispatchEvent:e=>events.push(e),addEventListener(){}};
 const context={window,WebSocket:Socket,location:{href:'https://skirmish.test/game',protocol:'https:'},URL,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},Event:class{constructor(type){this.type=type;}},performance:{now:()=>now},setInterval:(callback,ms)=>{intervals.push({callback,ms});return intervals.length;},clearInterval(){},setTimeout,clearTimeout,localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},console:{warn(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../multiplayer.js'),'utf8'),context,{filename:'multiplayer.js'});
 return {window,sockets,storage,events,advance(ms){now+=ms;},tick(){intervals.find(row=>row.ms===1000).callback();}};
}
const projection=id=>({schema:1,authoritative:true,participantId:id,records:[],summary:{xp:{currentLevel:2}}});
const botProjection=ownerId=>({schema:1,authoritative:true,ownerId,bots:{Ace:{sourceBotId:'bot:ace',network:{career:{kills:1}}}}});
test('Delayed state and close callbacks from a prior account cannot overwrite the new account or its caches',async()=>{
 const f=fixture(),old=f.sockets[0];old.open();old.message('state',{progression:projection('account:one'),botProgression:botProjection('canonical-owner'),social:{self:{id:'account:one'},party:null}});
 f.window.SARCloud.state.account={id:'account:two'};f.tick();const current=f.sockets[1];assert.ok(current);current.open();current.message('state',{progression:projection('account:two'),botProgression:botProjection('canonical-owner'),social:{self:{id:'account:two'},party:null}});
 const pending=f.window.SARMultiplayer.action('friend-search',{q:'Player'}),request=current.sent.at(-1);pending.catch(()=>{});
 old.message('state',{progression:projection('account:one'),botProgression:botProjection('private-old-owner'),social:{self:{id:'account:one'},party:{id:'old-party'}}});old.closed();
 assert.equal(f.window.SARMultiplayer.state().account.id,'account:two');assert.equal(f.window.SARMultiplayer.state().progression.participantId,'account:two');assert.equal(f.window.SARMultiplayer.state().connected,true);assert.equal(f.window.SARMultiplayer.state().botProgression.ownerId,'canonical-owner');assert.equal(JSON.parse(f.storage.get('sar-bot-network:account:two')).ownerId,'canonical-owner');
 current.message('response',{players:[]},request.id);assert.deepEqual(JSON.parse(JSON.stringify(await pending)),{players:[]});f.window.SARMultiplayer.disconnect();
});
test('A foreign progression frame cannot become the displayed or cached human account projection',()=>{
 const f=fixture(),socket=f.sockets[0];socket.open();socket.message('state',{progression:projection('account:one'),social:{self:{id:'account:one'},party:null}});socket.message('social',{progression:projection('account:other')});
 assert.equal(f.window.SARMultiplayer.state().progression.participantId,'account:one');assert.equal(f.storage.has('sar-human-network:account:other'),false);assert.equal(JSON.parse(f.storage.get('sar-human-network:account:one')).participantId,'account:one');f.window.SARMultiplayer.disconnect();
});
test('Shared queue, custom entry and party ready await the actual cloud flush; unready remains immediately available',async()=>{
 const f=fixture(),socket=f.sockets[0];socket.open();let finishFlush,calls=0;f.window.SARCloud.state.dirty=true;f.window.SARCloud.flush=()=>{calls++;return new Promise(resolve=>{finishFlush=resolve;});};
 const waiting=f.window.SARMultiplayer.queue('ranked-tdm');assert.equal(calls,1);assert.equal(socket.sent.length,0);f.window.SARCloud.state.dirty=false;finishFlush();await new Promise(setImmediate);assert.equal(socket.sent[0].type,'queue');assert.equal(socket.sent[0].data.mode,'ranked-tdm');socket.message('response',{state:'queued',queue:{mode:'ranked-tdm'}},socket.sent[0].id);await waiting;
 const custom=f.window.SARMultiplayer.joinCustom({mode:'deathmatch'});assert.equal(calls,2);assert.equal(socket.sent.length,1);finishFlush();await new Promise(setImmediate);assert.equal(socket.sent[1].type,'custom');assert.equal(socket.sent[1].data.config.mode,'deathmatch');socket.message('response',{state:'preparing',match:{id:'match:custom'}},socket.sent[1].id);await custom;
 f.window.SARCloud.state.dirty=true;const ready=f.window.SARMultiplayer.action('party-ready',{ready:true});assert.equal(calls,3);assert.equal(socket.sent.length,2);f.window.SARCloud.state.dirty=false;finishFlush();await new Promise(setImmediate);assert.equal(socket.sent[2].type,'party-ready');assert.equal(socket.sent[2].data.ready,true);socket.message('response',{party:{id:'party:one'}},socket.sent[2].id);await ready;
 f.window.SARCloud.state.dirty=true;const unready=f.window.SARMultiplayer.action('party-ready',{ready:false});assert.equal(calls,3);assert.equal(socket.sent.length,4);assert.equal(socket.sent[3].data.ready,false);socket.message('response',{party:{id:'party:one'}},socket.sent[3].id);await unready;f.window.SARMultiplayer.disconnect();
});
test('Rejected, still-dirty, replacing, expired or changed-account saves never send a shared queue request',async()=>{
 for(const flag of ['dirty','sending','replacing','localMode','authExpired']){const f=fixture(),socket=f.sockets[0];socket.open();f.window.SARCloud.state[flag]=true;f.window.SARCloud.state.saveRejected='The saved loadout was rejected';f.window.SARCloud.flush=async()=>{};await assert.rejects(f.window.SARMultiplayer.action('queue',{mode:'casual-tdm'}),/saved loadout was rejected/);await assert.rejects(f.window.SARMultiplayer.action('party-ready',{ready:true}),/saved loadout was rejected/);assert.equal(socket.sent.length,0);f.window.SARMultiplayer.disconnect();}
 const failed=fixture();failed.sockets[0].open();failed.window.SARCloud.flush=async()=>{throw Error('Cloud save failure');};await assert.rejects(failed.window.SARMultiplayer.queue('casual-deathmatch'),/Cloud save failure/);assert.equal(failed.sockets[0].sent.length,0);failed.window.SARMultiplayer.disconnect();
 const changed=fixture();changed.sockets[0].open();changed.window.SARCloud.flush=async()=>{changed.window.SARCloud.state.account={id:'account:two'};};await assert.rejects(changed.window.SARMultiplayer.queue('casual-tdm'),/cloud sync/);assert.equal(changed.sockets[0].sent.length,0);changed.window.SARMultiplayer.disconnect();
});

const lease=(changes={})=>({poolOwnerId:'account:one',required:true,ready:true,serverNow:10000,leaseUntil:16000,grantedSlots:[{slotId:0,matchId:'background:one',botIds:['bot:ace']}],...changes});
test('Only background acknowledgements authorize physics; round-trip delay and snapshots never extend a lease',async()=>{
 const f=fixture(),socket=f.sockets[0];socket.open();f.window.SAR.getBackgroundBotSlots=()=>[{slotId:0,matchId:'background:one',botIds:['bot:ace']}];socket.message('state',{background:lease()});assert.equal(f.window.SARMultiplayer.state().background.validUntil,0);
 f.tick();f.tick();assert.equal(socket.sent.filter(r=>r.type==='background').length,1);const request=socket.sent.at(-1);f.advance(1000);socket.message('response',lease(),request.id);await new Promise(setImmediate);assert.equal(f.window.SARMultiplayer.state().background.validUntil,5800);
 socket.message('snapshot',{serverNow:11000,background:lease({serverNow:11000,leaseUntil:17000})});assert.equal(f.window.SARMultiplayer.state().background.validUntil,5800);
 f.tick();const delayed=socket.sent.at(-1);f.advance(7000);socket.message('response',lease({serverNow:11000,leaseUntil:17000}),delayed.id);await new Promise(setImmediate);assert.equal(f.window.SARMultiplayer.state().background.validUntil,6800);f.window.SARMultiplayer.disconnect();
});
test('Revoked slot rosters and a new connection invalidate the old background grant',async()=>{
 const f=fixture(),socket=f.sockets[0];socket.open();f.window.SAR.getBackgroundBotSlots=()=>[];socket.message('state',{background:lease()});f.tick();socket.message('response',lease(),socket.sent.at(-1).id);await new Promise(setImmediate);assert.equal(f.window.SARMultiplayer.state().background.validUntil,5800);
 socket.message('snapshot',{background:lease({grantedSlots:[]})});assert.equal(f.window.SARMultiplayer.state().background.validUntil,0);f.tick();socket.message('response',lease(),socket.sent.at(-1).id);await new Promise(setImmediate);assert.equal(f.window.SARMultiplayer.state().background.validUntil,5800);
 socket.closed(4001);f.window.SARMultiplayer.reconnect();const replacement=f.sockets[1];replacement.open();assert.equal(f.window.SARMultiplayer.state().background.validUntil,0);assert.equal(f.window.SARMultiplayer.state().background.ready,false);f.window.SARMultiplayer.disconnect();
});
test('A late background acknowledgement cannot grant bots to a different signed-in account',async()=>{
 const f=fixture(),socket=f.sockets[0];socket.open();f.window.SAR.getBackgroundBotSlots=()=>[];socket.message('state',{background:lease()});f.tick();const request=socket.sent.at(-1);f.window.SARCloud.state.account={id:'account:two'};f.tick();socket.message('response',lease(),request.id);await new Promise(setImmediate);assert.equal(f.window.SARMultiplayer.state().background,null);f.window.SARMultiplayer.disconnect();
});

test('Map pools, vote acknowledgements and server deadlines reach the UI without resetting eligible pools',async()=>{
 const f=fixture(),socket=f.sockets[0];socket.open();const pools={revision:'maps-1',pools:{casual:['brightfield-blocks','foundry-crossing'],custom:['brightfield-blocks','foundry-crossing','relay-fields']}};
 const vote={id:'vote:one',deadline:16000,options:[{id:'brightfield-blocks',name:'Brightfield Blocks'},{id:'foundry-crossing',name:'Foundry Crossing'}],counts:{},currentVote:null};
 socket.message('snapshot',{mapPools:pools,serverNow:10000,queue:{mapVote:vote}});assert.equal(f.window.SARMultiplayer.state().mapPools.revision,'maps-1');assert.equal(f.window.SARMultiplayer.state().serverClock.receivedAt,100);
 const request=f.window.SARMultiplayer.action('map-vote',{voteId:'vote:one',mapId:'foundry-crossing'});assert.equal(socket.sent.at(-1).type,'map-vote');f.advance(200);socket.message('response',{serverNow:10200,queue:{mapVote:{...vote,currentVote:'foundry-crossing',counts:{'foundry-crossing':1}}}},socket.sent.at(-1).id);await request;
 assert.equal(f.window.SARMultiplayer.state().queue.mapVote.currentVote,'foundry-crossing');assert.equal(f.window.SARMultiplayer.state().mapPools.revision,'maps-1');assert.equal(f.window.SARMultiplayer.state().serverClock.now,10200);assert.equal(f.window.SARMultiplayer.state().serverClock.receivedAt,300);f.window.SARMultiplayer.disconnect();
});

test('Account changes discard previous map vote, pool configuration and clock samples',()=>{
 const f=fixture(),socket=f.sockets[0];socket.open();socket.message('snapshot',{mapPools:{revision:'private-pool'},serverNow:10000,queue:{mapVote:{id:'vote:old'}}});
 f.window.SARCloud.state.account={id:'account:two'};f.tick();const state=f.window.SARMultiplayer.state();assert.equal(state.mapPools,null);assert.equal(state.serverClock,null);assert.equal(state.queue,null);f.window.SARMultiplayer.disconnect();
});

test('Active limited-time definitions reach the UI, expire cleanly and do not survive an account switch',()=>{
 const f=fixture(),socket=f.sockets[0];socket.open();assert.equal(f.window.SARMultiplayer.state().ltms.length,0);
 const definition={id:'objective-fixture',name:'Objective fixture',mapPool:['brightfield-blocks'],teamSize:3,rules:{baseMode:'domination'},statEligible:true,xpEligible:false};socket.message('snapshot',{ltms:[definition]});assert.equal(f.window.SARMultiplayer.state().ltms[0].name,definition.name);
 socket.message('snapshot',{ltms:[]});assert.equal(f.window.SARMultiplayer.state().ltms.length,0);socket.message('snapshot',{ltms:[definition]});
 f.window.SARCloud.state.account={id:'account:two'};f.tick();socket.message('snapshot',{ltms:[definition]});assert.equal(f.window.SARMultiplayer.state().ltms.length,0);f.window.SARMultiplayer.disconnect();
});
