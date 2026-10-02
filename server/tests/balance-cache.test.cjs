'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
test('Published balance validation refreshes after a same-build weapon-file update',()=>{
 const filename=path.resolve(__dirname,'../world.cjs'),load=createRequire(filename),old=require('../../dev/fixtures/balance-6.0.json'),next=require('../../dev/fixtures/balance-7.0.json');
 let stamp=1,calls=0,snapshot=old.weapons;
 const mocked=name=>name==='node:fs'?{statSync:()=>({mtimeMs:stamp,size:100})}:name==='../dev/simulate.cjs'?{engine:()=>{calls++;return {dev:{balanceSnapshot:()=>snapshot}};}}:load(name);mocked.resolve=load.resolve;
 const context={require:mocked,module:{exports:{}},Date,JSON,console};vm.runInNewContext(fs.readFileSync(filename,'utf8')+'\nmodule.exports.__balance=balance;',context,{filename});const balance=context.module.exports.__balance;
 assert.equal(balance(),JSON.stringify(old.weapons));assert.equal(balance(),JSON.stringify(old.weapons));assert.equal(calls,1,'Unchanged files reuse the existing validated snapshot');
 snapshot=next.weapons;stamp=2;assert.equal(balance(),JSON.stringify(next.weapons));assert.equal(calls,2);assert.equal(balance(),JSON.stringify(next.weapons));assert.equal(calls,2,'Updated balance is cached without restarting or changing the build version');
});
