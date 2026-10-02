'use strict';
// Small storage fixture for the real cloud client; every new client realm can
// share only this durable store, while localStorage deliberately rejects writes.
const copy=value=>value===undefined?undefined:structuredClone(value);
function quotaLocalStorage(surface,{blocked=new Set(),limitBytes=Infinity}={}){
 const original=surface.context.localStorage.setItem,attempts=[];
 surface.context.localStorage.key=index=>[...surface.data.keys()][index]??null;
 Object.defineProperty(surface.context.localStorage,'length',{get:()=>surface.data.size,configurable:true});
 surface.context.localStorage.setItem=(key,value)=>{
  value=String(value);const bytes=[...surface.data].reduce((total,[name,text])=>total+(name===key?0:2*(name.length+text.length)),0)+2*(String(key).length+value.length);
  if(blocked.has(key)||bytes>limitBytes){attempts.push({key,bytes,rejected:true});throw Object.assign(Error('Storage quota exceeded'),{name:'QuotaExceededError'});}
  attempts.push({key,bytes,rejected:false});return original(key,value);
 };
 return attempts;
}
function memoryIndexedDB(durable=new Map(),controls={}){
 const indexedDB={open(name,version){
  const request={result:null,error:null,onupgradeneeded:null,onsuccess:null,onerror:null};
  setImmediate(()=>{
   let state=durable.get(name),upgrade=!state;
   if(!state){state={version:version||1,stores:new Map()};durable.set(name,state);}else if(version&&version>state.version){state.version=version;upgrade=true;}
   const database={name,version:state.version,objectStoreNames:{contains:name=>state.stores.has(name),[Symbol.iterator]:function*(){yield*state.stores.keys();}},createObjectStore(store,options={}){if(!state.stores.has(store)){const entries=new Map();entries.keyPath=options.keyPath;state.stores.set(store,entries);}return {};},close(){},transaction(names,mode){
    names=Array.isArray(names)?names:[names];const transaction={oncomplete:null,onerror:null,onabort:null,error:null},staged=mode==='readwrite'?new Map(names.map(name=>{const entries=new Map(state.stores.get(name));entries.keyPath=state.stores.get(name)?.keyPath;return [name,entries];})):null;let pending=0,scheduled=false,finished=false;
    function complete(){if(scheduled||finished)return;scheduled=true;setImmediate(()=>{scheduled=false;if(pending!==0||finished)return;finished=true;const commit=()=>{if(staged)for(const [name,entries]of staged)state.stores.set(name,entries);transaction.oncomplete?.({target:transaction});};if(staged&&controls.holdNextWrite){controls.holdNextWrite=false;(controls.held??=[]).push(commit);}else if(staged&&controls.failNextWrite){controls.failNextWrite=false;transaction.error=Object.assign(Error('Durable transaction rejected'),{name:'QuotaExceededError'});transaction.onerror?.({target:transaction});}else commit();});}
    transaction.objectStore=store=>{
     if(!names.includes(store)||!state.stores.has(store))throw Error('Unknown object store');const entries=staged?.get(store)||state.stores.get(store);
     const operation=callback=>{pending++;const request={result:undefined,error:null,onsuccess:null,onerror:null};setImmediate(()=>{try{request.result=copy(callback());request.onsuccess?.({target:request});}catch(error){request.error=error;transaction.error=error;request.onerror?.({target:request});transaction.onerror?.({target:transaction});}finally{pending--;complete();}});return request;};
     return {get:key=>operation(()=>entries.get(key)),put:(value,key)=>operation(()=>{if(mode!=='readwrite')throw Error('Read-only transaction');key??=entries.keyPath?value[entries.keyPath]:undefined;if(key===undefined)throw Error('Store key is required');entries.set(key,copy(value));return key;}),delete:key=>operation(()=>{if(mode!=='readwrite')throw Error('Read-only transaction');entries.delete(key);}),clear:()=>operation(()=>entries.clear()),getAll:()=>operation(()=>[...entries.values()]),getAllKeys:()=>operation(()=>[...entries.keys()])};
    };complete();return transaction;
   }};request.result=database;if(upgrade)request.onupgradeneeded?.({target:request,oldVersion:0,newVersion:state.version});request.onsuccess?.({target:request});
  });return request;
 },deleteDatabase(name){const request={onsuccess:null,onerror:null};setImmediate(()=>{durable.delete(name);request.onsuccess?.({target:request});});return request;}};
 return {indexedDB,durable};
}
module.exports={quotaLocalStorage,memoryIndexedDB};
