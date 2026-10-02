'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createDatabase}=require('../db.cjs'),{writeWorld}=require('../world.cjs'),{engine}=require('../../dev/simulate.cjs'),AI=require('../local-ai.cjs');
function context(){const db=createDatabase(':memory:'),now=Date.now();db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('accuracy','accuracy','accuracy','not-for-model',now,now);writeWorld(db,'accuracy',engine().context.SAR.getUniverse(),0);return db;}
const output=body=>({subject:'Sampled reasoning regression',body,mood:'neutral',category:'balance',wantsReply:false,certainty:.8});
test('sampled local-model arithmetic regressions are rejected and valid historical/current comparisons survive',()=>{
  const db=context();try{const ctx=AI.botContext(db,'accuracy','bot_0001',{weapon:'Pump'});assert.deepEqual(ctx.authoritativeGameFacts.weapons.map(w=>w.name),['Pump Shotgun']);assert.equal(ctx.authoritativeGameFacts.weapons[0].mechanics.oneBodyHitRemainingHP,126);ctx.developerScenario={weapon:'Pump Shotgun',previousBodyDamage:125,currentBodyDamage:124};
    for(const body of ['Pump still kills in two.','The Pump two-shot kill remains the same; you still need two hits to finish someone.','The one-point drop doesn’t affect the kill breakpoint—still needs three body hits.','Two body hits now leave 2 HP instead of 3. The required hit count stays the same.','One less hit to finish a full-health target.','A single body hit still leaves only 2 HP.','Prioritizing a body shot first to bring the enemy to 2 HP.','The Pump has a 35-damage headshot.','I will switch between the 3-tile burst and 4-tile burst.'])assert.throws(()=>AI.mechanicalGuard(output(body),ctx),Error,body);
    for(const body of ['The Pump used to kill in two body hits. At124, two leave2HP and I need a third.','Two full124-damage blasts deal248 and leave2HP.','A headshot can still kill with the Pump; body shots need three.'])assert.doesNotThrow(()=>AI.mechanicalGuard(output(body),ctx));
  }finally{AI.dispose(db);db.close();}
});
test('P90 projectile speed, K/D, missing win rates and unknown winners cannot become fabricated facts',()=>{
  const db=context();try{const ctx=AI.botContext(db,'accuracy','bot_0001',{weapon:'P90'});ctx.developerScenario={weapon:'P90',globalCurrentPatch:{kills:800,deaths:400,games:120},personalCurrentPatch:{kills:24,deaths:8,games:12}};
    for(const body of ['P90 is a one-shot weapon.','P90 has a 70-rpm rate.','P90 has a 50% kill/death ratio.','My24kills/8deaths is a 3:1 win rate.','Nova won the tournament.'])assert.throws(()=>AI.mechanicalGuard(output(body),ctx),Error,body);
    assert.doesNotThrow(()=>AI.mechanicalGuard(output('P90 needs eight base-damage head hits. My3.0K/D is personal evidence, and I do not know the tournament winner.'),ctx));
  }finally{AI.dispose(db);db.close();}
});
