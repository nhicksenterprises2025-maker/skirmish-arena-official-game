'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function fixture(){
 const listeners=[],nodes=new Map(),store=new Map();let response,release,calls=0,html='',controls=[];
 const document={activeElement:null,getElementById:id=>nodes.get(id),addEventListener:(type,fn)=>{if(type==='click')listeners.push(fn);},querySelector:()=>null,querySelectorAll:()=>[]};
 const make=(dataset={},id='')=>({dataset,id,value:'',disabled:false,focus(){document.activeElement=this;},closest(selector){const key=selector.slice(1,-1).replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return this.dataset[key]===undefined?null:this;}});
 const host={dataset:{},scrollTop:0,contains:el=>controls.includes(el)||[...nodes.values()].includes(el),querySelectorAll:()=>controls};
 Object.defineProperty(host,'innerHTML',{get:()=>html,set:value=>{html=value;controls=[];for(const key of [...nodes.keys()])if(!['modal','modalContent'].includes(key))nodes.delete(key);for(const tag of html.matchAll(/<(?:button|input|select)\b([^>]+)>/g)){const attrs=tag[1],dataset={};for(const match of attrs.matchAll(/data-([\w-]+)="([^"]*)"/g))dataset[match[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=match[2];const id=attrs.match(/\bid="([^"]*)"/)?.[1]||'',node=make(dataset,id);node.value=attrs.match(/\bvalue="([^"]*)"/)?.[1]||'';controls.push(node);if(id)nodes.set(id,node);}}});
 nodes.set('modalContent',host);nodes.set('modal',{classList:{add(){},contains:()=>true}});
 const window={SARCloud:{state:{account:{id:'isolated',username:'Fixture'},available:true},api:async()=>{calls++;return response;}},SAR:{getProfiles:()=>({})}};
 const hold=()=>{response=new Promise(resolve=>release=resolve);};hold();
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../tournaments-ui.js'),'utf8'),{window,document,localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},setInterval:()=>1,Date,Intl,JSON,console});
 const click=async action=>{const target=controls.find(node=>node.dataset.circuitAction===action);assert.ok(target,'control '+action);document.activeElement=target;for(const listener of listeners)await listener({target});};
 return {window,document,host,nodes,click,hold,release:data=>release(data),get calls(){return calls;},get html(){return html;},event:async id=>{const target=controls.find(node=>node.dataset.circuitEvent===id);for(const listener of listeners)await listener({target});}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const h=fixture();h.window.SARTournaments.show();assert.match(h.html,/Loading the circuit/);assert.equal(h.calls,1);
 await h.click('create');h.nodes.get('circuitName').value='Unsent custom name';h.release({tournaments:[],earnings:[]});await settle();assert.equal(h.nodes.get('circuitName').value,'Unsent custom name','an in-flight calendar refresh cannot erase an open form');assert.equal(h.window.SARTournaments.getState().view,'create');
 await h.click('calendar');assert.match(h.html,/No events scheduled/);assert.doesNotMatch(h.html,/Loading the circuit/);h.host.scrollTop=42;await h.click('next');assert.equal(h.document.activeElement.dataset.circuitAction,'next','keyboard focus survives month navigation');assert.equal(h.host.scrollTop,42);assert.match(h.html,/data-circuit-action="today"/);await h.click('today');assert.equal(h.window.SARTournaments.getState().month.getMonth(),new Date().getMonth());
 h.hold();const refresh=h.click('refresh');h.release({earnings:[],tournaments:[{id:'cup',name:'Fixture Cup',kind:'custom',status:'COMPLETED',startsAt:Date.now(),teams:[{id:'a',name:'Alpha',seed:1,participants:[]},{id:'b',name:'Bravo',seed:2,participants:[]}],series:[{round:'FINAL',bestOf:5,teamIds:['a','b'],wins:[3,1],winnerTeamId:'a'}],invites:[],placements:[],earnings:[]}]});await refresh;assert.match(h.html,/class="circuit-event"[^>]+data-status="COMPLETED"/);await h.event('cup');assert.match(h.html,/<strong><span class="circuit-series-team" data-winner="true">Alpha<\/span><b[^>]+>3 — 1<\/b><span class="circuit-series-team" >Bravo<\/span><\/strong>/);assert.equal(h.calls,2,'visual navigation adds no mutation or simulation requests');
 console.log('PASS: tournament loading/empty states, pending refresh form preservation, keyboard focus, month shortcut and grouped bracket scores.');
})().catch(error=>{console.error(error);process.exitCode=1;});
