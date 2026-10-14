'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
function fixture(){
 const sockets=[],storage=new Map(),intervals=[];
 class Socket{static OPEN=1;static CONNECTING=0;constructor(){this.readyState=0;sockets.push(this);}send(){}close(){this.readyState=3;}open(){this.readyState=1;this.onopen?.();}message(type,data){this.onmessage?.({data:JSON.stringify({type,data})});}}
 const window={SAR:{},SARCloud:{state:{account:{id:'account:one'},localMode:false,authExpired:false}},SARStorage:{get:key=>storage.get(key)??null,set:(key,value)=>storage.set(key,value)},dispatchEvent(){},addEventListener(){}};
 const context={window,crypto,WebSocket:Socket,location:{href:'https://skirmish.test/game',protocol:'https:'},URL,CustomEvent:class{},Event:class{},performance:{now:()=>100},setInterval:(callback,ms)=>{intervals.push({callback,ms});return intervals.length;},clearInterval(){},setTimeout,clearTimeout,localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},console:{warn(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../multiplayer.js'),'utf8'),context,{filename:'multiplayer.js'});
 return {window,sockets,storage,tick(){intervals.find(row=>row.ms===1000).callback();}};
}
const mastery=id=>({schema:1,authoritative:true,participantId:id,revision:'mastery-1',weapons:{FAL:{level:3,totalXp:900}},equipped:{}});
test('Only current-account authoritative mastery frames can become displayed or cached records',()=>{
 const f=fixture(),socket=f.sockets[0];socket.open();socket.message('state',{mastery:mastery('account:one')});socket.message('social',{mastery:mastery('account:other')});socket.message('snapshot',{mastery:{...mastery('account:one'),authoritative:false}});
 assert.equal(f.window.SARMultiplayer.state().mastery.weapons.FAL.level,3);assert.equal(JSON.parse(f.storage.get('sar-weapon-mastery:account:one')).participantId,'account:one');assert.equal(f.storage.has('sar-weapon-mastery:account:other'),false);f.window.SARMultiplayer.disconnect();
});
test('Account switch discards previous mastery; delayed old socket cannot overwrite own offline cache',()=>{
 const f=fixture(),old=f.sockets[0];old.open();old.message('state',{mastery:mastery('account:one')});f.storage.set('sar-weapon-mastery:account:two',JSON.stringify({...mastery('account:two'),weapons:{FAL:{level:1,totalXp:0}}}));
 f.window.SARCloud.state.account={id:'account:two'};f.tick();assert.equal(f.window.SARMultiplayer.state().mastery.participantId,'account:two');assert.equal(f.window.SARMultiplayer.state().mastery.weapons.FAL.totalXp,0);old.message('state',{mastery:mastery('account:one')});assert.equal(f.window.SARMultiplayer.state().mastery.participantId,'account:two');assert.equal(JSON.parse(f.storage.get('sar-weapon-mastery:account:two')).weapons.FAL.totalXp,0);f.window.SARMultiplayer.disconnect();
});
test('Repeated mastery claims reuse durable request identity and accept only verified server ownership',async()=>{
 const f=fixture();f.sockets[0].open();const requests=[];f.window.SARCloud.api=async(url,options)=>{requests.push({url,...JSON.parse(options.body)});return {mastery:mastery('account:one'),replayed:requests.length>1};};
 await f.window.SARMultiplayer.claimMasteryReward('FAL','badge:FAL:3');const replay=await f.window.SARMultiplayer.claimMasteryReward('FAL','badge:FAL:3');assert.equal(replay.replayed,true);assert.equal(requests[0].requestId,requests[1].requestId);assert.equal(requests[0].url,'/mastery/rewards/claim');assert.equal(requests[0].weapon,'FAL');assert.equal(f.window.SARMultiplayer.state().mastery.participantId,'account:one');f.window.SARMultiplayer.disconnect();
});
test('Late HTTP mastery response after account change cannot expose/cache former account; offline cannot claim',async()=>{
 const f=fixture();f.sockets[0].open();let finish;f.window.SARCloud.api=()=>new Promise(resolve=>{finish=resolve;});const pending=f.window.SARMultiplayer.refreshMastery();f.window.SARCloud.state.account={id:'account:two'};f.tick();finish({mastery:mastery('account:one')});await assert.rejects(pending,/signed-in account changed/);assert.equal(f.storage.has('sar-weapon-mastery:account:two'),false);f.window.SARMultiplayer.disconnect();await assert.rejects(f.window.SARMultiplayer.claimMasteryReward('FAL','badge:FAL:1'),/Reconnect/);await assert.rejects(f.window.SARMultiplayer.equipMasteryReward('FAL','badge:FAL:1'),/Reconnect/);
});
