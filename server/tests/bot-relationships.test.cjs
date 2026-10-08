'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createDatabase}=require('../db.cjs'),{writeWorld}=require('../world.cjs'),{engine}=require('../../dev/simulate.cjs');
function account(db,id){const now=Date.now();db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,id,id,'never-sent',now,now);writeWorld(db,id,engine().context.SAR.getUniverse(),0);}
test('friendship evolves only from newly completed, mutually recorded team results',()=>{
  const db=createDatabase(':memory:');
  try{account(db,'team-test');const e=engine(),save=e.context.SAR.getUniverse();db.prepare('UPDATE worlds SET save_json=? WHERE user_id=?').run(JSON.stringify(save),'team-test');const old=JSON.parse(JSON.stringify(save));e.dev.endMatch(e.dev.inspect().state.matches[0],0);const next=e.context.SAR.getUniverse();writeWorld(db,'team-test',next,1);const rows=db.prepare('SELECT friendship FROM bot_relationships WHERE user_id=?').all('team-test');assert.ok(rows.some(r=>r.friendship===.2));assert.ok(rows.some(r=>r.friendship===.05));const total=rows.reduce((n,r)=>n+r.friendship,0);writeWorld(db,'team-test',next,2);assert.ok(Math.abs(db.prepare('SELECT SUM(friendship) AS n FROM bot_relationships WHERE user_id=?').get('team-test').n-total)<1e-9);assert.deepEqual(Object.values(next.bots).map(b=>b.profile),Object.values(old.bots).map(b=>b.profile));
  }finally{db.close();}
});
