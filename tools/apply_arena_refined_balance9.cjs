'use strict';
// Authoring step only: replace the existing inline configuration, not a second
// runtime registry. A complete sheet and explicit FAL range are required before
// one fingerprint can activate. This never opens an account/save or publishes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),gamePath=path.join(root,'game.js');
const units=require('../distance-units.js'),map=units.mapCalibration('brightfield-blocks');
const csv=`Name,Type,Role,Auto,Body,Head,Hip,Walk,Sprint,ADS,FalloffTiles,FalloffPct,ProjectileTilesPerSec,IntervalSec,Mag,Reserve,ReloadSec,Pellets,BurstCount,PreferredWorld
AR-15,Primary,All-rounder,Yes,28,42,2.70,2.90,3.60,1.50,22,2.50,80,0.30,40,120,2.10,1,1,900
AK47,Primary,Heavy rifle,Yes,34,50,4.00,4.50,5.20,1.60,25,2.80,74,0.35,36,120,2.75,1,1,820
SMG-9,Primary,Close tracking,Yes,19,29,3.10,3.30,3.70,1.80,11,4.30,62,0.17,42,144,1.90,1,1,520
Pump Shotgun,Primary,Burst shotgun,No,124,248,6.50,7.50,9.00,3.00,4,10.00,48,1.50,5,30,2.40,8,1,330
Auto 12,Primary,Auto shotgun,Yes,49,99,7.45,8.50,10.00,2.50,5,8.00,50,0.51,10,50,4.60,6,1,300
LR-762,Primary,Marksman rifle,No,63,124,10.00,12.00,15.00,1.20,32,1.50,105,0.77,10,60,3.05,1,1,1250
LW Tundra,Primary,Sniper rifle,No,115,175,12.20,14.00,18.00,1.00,45,1.00,125,1.40,4,25,2.80,1,1,1500
War Head LMG,Primary,Sustained-fire LMG,Yes,40,60,5.35,5.80,6.20,1.80,24,2.00,81,0.42,75,225,4.70,1,1,1000
P90,Primary,Ranged SMG,Yes,25,40,2.20,2.40,2.80,1.20,20,3.20,70,0.23,36,144,2.20,1,1,720
9mm,Sidearm,Heavy sidearm,No,28,50,4.75,5.00,5.45,1.10,13,4.00,60,0.27,16,60,1.50,1,1,440
X16,Sidearm,Fast sidearm,No,24,34,4.75,4.40,4.75,1.30,11,4.50,58,0.19,12,72,1.00,1,1,390
X-16 Auto,Sidearm,Auto sidearm,Yes,21,30,4.65,5.00,5.35,1.50,10,4.75,62,0.19,26,104,1.60,1,1,430
SR-Aug,Primary,Triple Burst AR,Yes,23,40,7.00,4.75,5.50,2.20,19,2.40,88,0.70,39,156,2.90,1,3,750
SPAS-12,Primary,3 Shot Shotgun,No,100,210,5.80,5.925,6.25,1.70,7,5.00,75,1.00,3,12,3.60,12,1,420
FAL,Primary,Semi-Auto AR,No,48,72,8.50,10.00,12.50,2.00,28,3.00,88,0.26,20,80,3.40,1,1,UNSPECIFIED`;
const mappings={Type:'type',Role:'role',Auto:'auto',Body:'damage',Head:'head',Hip:'spread',Walk:'walkSpread',Sprint:'sprintSpread',ADS:'adsSpread',FalloffTiles:'falloffStart',FalloffPct:'falloff',ProjectileTilesPerSec:'speed',IntervalSec:'hitSpeed',Mag:'mag',Reserve:'reserve',ReloadSec:'reload',Pellets:'pellets',BurstCount:'burstCount',PreferredWorld:'preferred'};
const source=fs.readFileSync(gamePath,'utf8'),match=source.match(/const WEAPONS = \{[\s\S]*?\n\}/);assert(match,'Existing authoritative registry missing');
const current=JSON.parse(JSON.stringify(vm.runInNewContext('('+match[0].slice('const WEAPONS = '.length)+')')));
const baseline=JSON.parse(fs.readFileSync(path.join(root,'dev/fixtures/balance-8.0.json'),'utf8')).weapons;
const args=process.argv.slice(2),dryRun=args.includes('--dry-run'),rangeArg=args.find(arg=>arg.startsWith('--preferred-world=')),range=rangeArg?Number(rangeArg.split('=').slice(1).join('=')):undefined;
if(rangeArg)assert(Number.isFinite(range)&&range>0,'FAL PreferredWorld must be the positive finite value explicitly supplied by the user');
if(!dryRun)assert(rangeArg,'FAL PreferredWorld is unspecified. Supply --preferred-world=<user value>; no live data has been changed.');
const lines=csv.split('\n'),headers=lines.shift().split(','),candidate={},changes=[];
for(const line of lines){
 const parts=line.split(',');assert.equal(parts.length,headers.length);const row=Object.fromEntries(headers.map((key,i)=>[key,parts[i]])),name=row.Name;
 const next={...(baseline[name]||{color:'#65735d'})};
 for(const [column,field]of Object.entries(mappings)){
  const raw=row[column];assert(raw.trim(),'Blank cells are not zero: '+name+' '+column);
  if(column==='PreferredWorld'&&raw==='UNSPECIFIED'){if(range!==undefined)next[field]=range;continue;}
  const value=column==='Type'?raw.toLowerCase():column==='Role'?raw:column==='Auto'?raw==='Yes':column==='FalloffPct'?Number((Number(raw)/100).toFixed(8)):Number(raw);
  assert(typeof value!=='number'||Number.isFinite(value),name+' '+column);
  // Non-burst guns already use the authoritative default of one round. Keep
  // that existing representation, and its historical fingerprints, intact.
  if(column==='BurstCount'&&value===1&&next[field]===undefined)continue;
  next[field]=value;
 }
 if(name==='SR-Aug'){assert.equal(next.burstCount,3);assert.equal(next.burstSpacing,.065);}
 candidate[name]=next;
 for(const [field,value]of Object.entries(next))if(field!=='color'&&baseline[name]?.[field]!==value)changes.push({weapon:name,field,before:baseline[name]?.[field]??null,after:value});
}
const labels={damage:'Body damage',head:'Headshot damage',spread:'Hip spread',walkSpread:'Walk hip spread',sprintSpread:'Sprint hip spread',adsSpread:'ADS spread',falloffStart:'Falloff start',falloff:'Falloff per meter',speed:'Projectile speed',hitSpeed:'Firing interval',mag:'Magazine',reserve:'Reserve',reload:'Reload',preferred:'Preferred range'};
const format=(field,value)=>{if(value===null)return 'new';if(field==='falloff')return units.legacyFalloffFractionToPercentPerMeter(value,map).toFixed(2)+'% / m';if(['spread','walkSpread','sprintSpread','adsSpread'].includes(field))return value+'°';if(['hitSpeed','reload'].includes(field))return value.toFixed(2)+'s';if(field==='falloffStart')return units.legacyWeaponDistanceToMeters(value,map).toFixed(2)+' m';if(field==='speed')return units.legacyWeaponSpeedToMetersPerSecond(value,map).toFixed(2)+' m/s';if(field==='preferred')return units.worldDistanceToMeters(value,map).toFixed(2)+' m';return String(value);};
const note={version:'WEAPON BALANCE UPDATE 9.0',date:'OCTOBER 8, 2026',title:'ARENA REFINED',letter:'The supplied weapon data and new semi-automatic FAL are active. Prior complete patch samples are archived once at configuration activation. Lifetime careers, familiarity, progression, seasons, earnings and historical samples are preserved. Application and ruleset versions remain separate.',changes:[]};
for(const name of Object.keys(candidate)){
 const rows=changes.filter(change=>change.weapon===name);if(!rows.length)continue;
 note.changes.push({weapon:name,kind:baseline[name]?'ADJUSTED':'NEW WEAPON',items:rows.filter(change=>labels[change.field]).map(change=>(change.field==='hitSpeed'&&candidate[name].burstCount>1?'Burst cycle':labels[change.field])+': '+format(change.field,change.before)+' → '+format(change.field,change.after))});
}
const report={status:range===undefined?'AWAITING_FAL_RANGE':dryRun?'READY':'APPLIED',balanceVersion:'9.0',applicationVersion:require('../version.json').version,sourceUnitsPreserved:true,preferredWorld:range??null,changes,candidate,note};
const reportArg=args.find(arg=>arg.startsWith('--report='));
const reportFile=reportArg?path.resolve(reportArg.slice(9)):null;if(reportFile)assert.equal(path.extname(reportFile).toLowerCase(),'.json','Report must be JSON, never source');
if(!dryRun){
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 assert(equal(current,baseline)||equal(current,candidate),'Current weapon data has changed since the baseline. Preserve those edits and inspect before applying.');
 if(!equal(current,candidate)){
  const block='const WEAPONS = {\n'+Object.entries(candidate).map(([name,value])=>'  '+JSON.stringify(name)+': '+JSON.stringify(value)).join(',\n')+'\n}';
  let updated=source.replace(match[0],block);assert(!updated.includes("version:'WEAPON BALANCE UPDATE 9.0'")&&!updated.includes('"version":"WEAPON BALANCE UPDATE 9.0"'),'Another Balance9 configuration already exists');
  updated=updated.replace('const WEAPON_PATCH_NOTES = [','const WEAPON_PATCH_NOTES = [\n  '+JSON.stringify(note)+',');
  updated=updated.replace("  if(name==='SPAS-12')return", "  if(name==='FAL')return `Semi-automatic rifle with ${w.damage} body / ${w.head} head damage, a ${w.mag}-round magazine and measured ${(w.hitSpeed*1000).toFixed(0)} ms follow-ups. Each press fires one independently resolved round.`;\n  if(name==='SPAS-12')return");
  updated=updated.replace("name==='LW Tundra'?8.5:","name==='FAL'?5.8:name==='LW Tundra'?8.5:").replace("'SR-Aug':62}[name]","'SR-Aug':62,FAL:76}[name]");
  const styleMatch=updated.match(/const STYLE_WEAPON_PREFS=\{[\s\S]*?\n\};/);assert(styleMatch,'Existing style registry missing');
  const styles=JSON.parse(JSON.stringify(vm.runInNewContext('('+styleMatch[0].slice('const STYLE_WEAPON_PREFS='.length,-1)+')')));
  for(const [style,list]of Object.entries(styles))if(!list.includes('FAL')){const after=style==='Marksman'?'LR-762':style==='Rusher'?'War Head LMG':'AK47',index=list.indexOf(after);list.splice(index<0?list.length:index+1,0,'FAL');}
  updated=updated.replace(styleMatch[0],'const STYLE_WEAPON_PREFS='+JSON.stringify(styles)+';');
  fs.writeFileSync(gamePath,updated);
 }else {assert(source.includes('"version":"WEAPON BALANCE UPDATE 9.0"')&&source.includes("if(name==='FAL')return"),'Candidate constants exist but balance history/integration is incomplete; inspect rather than activating another patch');report.status='ALREADY_APPLIED';}
}
if(reportFile){fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,weapons:Object.keys(candidate).length,existingWeaponsChanged:new Set(changes.filter(change=>baseline[change.weapon]).map(change=>change.weapon)).size,preferredWorld:report.preferredWorld,configurationWritten:!dryRun&&report.status==='APPLIED'}));
