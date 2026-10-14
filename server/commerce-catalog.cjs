'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const baseOperators=[
  ['urban-assault','Urban Assault'],['woodland-scout','Woodland Scout'],['desert-runner','Desert Runner'],['blue-strike','Blue Strike'],
  ['crimson-guard','Crimson Guard'],['steel-recon','Steel Recon'],['ranger-elite','Ranger Elite'],['night-ops','Night Ops']
].map(([id,name])=>({id,name}));
const newOperators=[['field-ranger','Field Ranger','BASIC',50000],['metro-unit','Metro Unit','BASIC',50000],['frontier','Frontier','DETAILED',100000],['sentinel','Sentinel','DETAILED',100000],['nightfall','Nightfall','COOL DETAILED',150000],['hazard','Hazard','COOL DETAILED',150000],['vector','Vector','COOL DETAILED',150000],['obsidian','Obsidian','PREMIUM',250000],['aegis-prime','Aegis Prime','PREMIUM',250000],['specter','Specter','PREMIUM',250000]].map(([id,name,collection,priceUnits])=>({id,name,collection,priceUnits,requiresCosmeticId:id+'.signature'}));
const operators=Object.freeze([...baseOperators,...newOperators].map(Object.freeze));
const packs=Object.freeze([[500,699],[1000,1099],[1500,1499],[3000,2499],[7500,4999],[17500,9999]].map(([ac,moneyCents])=>Object.freeze({id:'ac-'+ac,name:ac.toLocaleString('en-US')+' AC',currency:'USD',moneyCents,creditUnits:ac*100})));
const cosmetic=(operatorId,slug,name,priceUnits,description,extra={})=>({id:operatorId+'.'+slug,operatorId,name,priceUnits,tier:priceUnits/100,description,styles:[{id:'main',name:'Main'}],lobbyPose:null,...extra});
// Keep the registry intact for existing ownership, saved selections and order
// retries. Only these distinct modeled outfits remain in the sale collection;
// recolors and small changes to the base kit are retired from new purchases.
const saleCollection=new Set(['urban-assault.containment','steel-recon.aegis','crimson-guard.monarch']);
const cosmetics=Object.freeze([
  ...baseOperators.flatMap(op=>[
    cosmetic(op.id,'helmet-off','Helmet Off',50000,'Finished head, hair and headset; '+op.name+' equipment and colors retained.'),
    cosmetic(op.id,'polar-camo','Polar Camo',50000,'White and light-gray camouflage with charcoal equipment.'),
    cosmetic(op.id,'carbon-camo','Carbon Camo',50000,'Black and slate camouflage with contrasting gray equipment.')
  ]),
  cosmetic('urban-assault','urban-utility','Urban Utility',100000,'Charcoal jacket, slate trousers, compact chest rig and orange utility tabs.'),
  cosmetic('steel-recon','alpine-scout','Alpine Scout',100000,'Off-white shell, dark harness, clear goggles and restrained snow-pattern panels.'),
  cosmetic('ranger-elite','workshop','Workshop',100000,'Mechanic coveralls, gloves and a neat tool pouch.'),
  cosmetic('woodland-scout','signal-runner','Signal Runner',100000,'Blue-gray lightweight outfit and compact communications gear with one short antenna.'),
  cosmetic('steel-recon','cold-front','Cold Front',150000,'Structured winter collar, insulated outfit, pale armor and enclosed goggles.'),
  cosmetic('urban-assault','containment','Containment',150000,'Enclosed respirator and sealed charcoal suit with controlled yellow-gray details.'),
  cosmetic('ranger-elite','recon-pilot','Recon Pilot',150000,'Original flight helmet, muted flight suit and fitted harness.'),
  cosmetic('night-ops','midnight-circuit','Midnight Circuit',150000,'Black and navy outfit, segmented visor and restrained blue panels.'),
  cosmetic('blue-strike','black-ice','Black Ice',250000,'Graphite armor and icy-blue visor. Includes White Ice and a lobby idle pose.',{styles:[{id:'main',name:'Black Ice'},{id:'white-ice',name:'White Ice'}],lobbyPose:'black-ice'}),
  cosmetic('steel-recon','aegis','Aegis',250000,'Segmented plating, enclosed faceplate and compact collar. Includes Aegis Arctic and a lobby idle pose.',{styles:[{id:'main',name:'Aegis'},{id:'aegis-arctic',name:'Aegis Arctic'}],lobbyPose:'aegis'}),
  cosmetic('crimson-guard','monarch','Monarch',250000,'Black kit, restrained brass trim and angular helmet. Includes Monarch Platinum and a lobby idle pose.',{styles:[{id:'main',name:'Monarch'},{id:'monarch-platinum',name:'Monarch Platinum'}],lobbyPose:'monarch'}),
  ...newOperators.map(op=>cosmetic(op.id,'signature',op.name,op.priceUnits,'Original '+op.name+' operator kit. Appearance only.',{collection:op.collection,newOperator:true}))
].map(item=>Object.freeze({...item,type:'operator-appearance',saleStatus:saleCollection.has(item.id)||item.newOperator?'active':'retired',storeListed:saleCollection.has(item.id)||item.newOperator===true,styles:Object.freeze(item.styles.map(Object.freeze))})));
const iconNames=['Ridge Watch','Metro Mark','Frontier Star','Sentinel Eye','Nightfall Moon','Hazard Chevron','Vector Cross','Obsidian Shard','Aegis Shield','Specter Mask','Arena Laurel','Precision Ring'];
const bannerNames=['Field Line','Metro Grid','Frontier Dusk','Sentinel Wall','Nightfall Horizon','Hazard Stripe','Vector Flow','Obsidian Facet'];
const poseNames=['Quiet Confidence','Arms Folded','Weapon Rest','Champion Stance','Tactical Ready','Over the Shoulder'];
const slug=name=>name.toLowerCase().replaceAll(' ','-');
const content=Object.freeze([
  ...iconNames.map(name=>({id:'profile-icon.'+slug(name),type:'profile-icon',name,priceUnits:15000,asset:'/assets/25d/cosmetics/icons/'+slug(name)+'.png'})),
  ...bannerNames.map(name=>({id:'profile-banner.'+slug(name),type:'profile-banner',name,priceUnits:30000,asset:'/assets/25d/cosmetics/banners/'+slug(name)+'.png'})),
  ...poseNames.map((name,i)=>({id:'victory-pose.'+slug(name),type:'victory-pose',name,priceUnits:i?50000:0,pose:slug(name),defaultOwned:i===0}))
].map(item=>Object.freeze({...item,description:item.type==='victory-pose'?'An end-of-match operator pose. Appearance only.':'Original '+item.type.replace('profile-','')+' artwork. Appearance only.',styles:Object.freeze([Object.freeze({id:'main',name:'Original'})]),saleStatus:item.defaultOwned?'default':'active',storeListed:!item.defaultOwned})));
const findProduct=id=>cosmetics.find(item=>item.id===id)||content.find(item=>item.id===id);

// Only exported, verified assets can be sold. The manifest is an asset build
// artifact, never supplied by a client. Cache exact file signatures per process.
let readinessCache=null;
function assetReadiness(){
  const file=path.join(ROOT,'assets/25d/cosmetics/manifest.json');
  try{
    const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
    const signatures=[fs.statSync(file).mtimeMs,fs.statSync(file).size];
    const files=new Map();
    for(const entry of Object.values(manifest.cosmetics||{}))for(const style of Object.values(entry.styles||{})){
      const relative=style.file;
      if(typeof relative!=='string'||!/^assets\/25d\/cosmetics\/[a-z0-9._-]+\.glb$/.test(relative))continue;
      const target=path.join(ROOT,relative);try{const stat=fs.statSync(target);files.set(relative,{target,stat});signatures.push(relative,stat.size,stat.mtimeMs);}catch{signatures.push(relative,'missing');}
    }
    const signature=JSON.stringify(signatures);
    if(readinessCache?.signature===signature)return readinessCache.items;
    const hashes=new Map(),items={};
    for(const item of cosmetics){
      const entry=manifest.cosmetics?.[item.id];
      const valid=manifest.schema===1&&entry?.verified===true&&entry.operatorId===item.operatorId&&(entry.lobbyPose||null)===item.lobbyPose&&item.styles.every(style=>{
        const asset=entry.styles?.[style.id],found=files.get(asset?.file);
        if(!found||!found.stat.isFile()||found.stat.size!==asset.bytes||!/^[a-f0-9]{64}$/.test(asset.sha256||'')||typeof asset.node!=='string'||!asset.node)return false;
        if(!hashes.has(asset.file))hashes.set(asset.file,crypto.createHash('sha256').update(fs.readFileSync(found.target)).digest('hex'));
        return hashes.get(asset.file)===asset.sha256;
      });
      items[item.id]=valid===true;
    }
    readinessCache={signature,items};return items;
  }catch{return {};}
}
function contentReadiness(){
  try{const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'assets/25d/cosmetics/content-manifest.json'),'utf8')),hashes=new Map(),items={};
    for(const item of content){const entry=manifest.content?.[item.id]||manifest.content?.[item.id.slice(item.id.indexOf('.')+1)],relative=entry?.file;if(manifest.schema!==1||entry?.verified!==true||entry.kind!==item.type||typeof relative!=='string'||!/^assets\/25d\/cosmetics\/(?:icons\/[-a-z0-9]+\.png|banners\/[-a-z0-9]+\.png|victory-poses\.json)$/.test(relative))continue;
      if(item.asset&&'/'+relative!==item.asset||item.pose&&entry.pose!==item.pose)continue;
      const target=path.join(ROOT,relative),stat=fs.statSync(target);if(!stat.isFile()||stat.size!==entry.bytes||!/^[a-f0-9]{64}$/.test(entry.sha256||''))continue;
      if(!hashes.has(relative))hashes.set(relative,crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'));if(hashes.get(relative)!==entry.sha256)continue;
      if(item.pose){const poses=JSON.parse(fs.readFileSync(target,'utf8'));if(poses.schema!==1||!Object.hasOwn(poses.poses||{},item.pose))continue;}items[item.id]=true;
    }return items;
  }catch{return {};}
}
function productReady(item){return item?.type==='operator-appearance'?assetReadiness()[item.id]===true:contentReadiness()[item?.id]===true;}
function catalog(environment){const ready={...assetReadiness(),...contentReadiness()},rows=items=>items.map(item=>({...item,available:item.saleStatus==='active'&&ready[item.id]===true,assetStatus:ready[item.id]?'READY':'UNAVAILABLE'}));return {schema:1,environment,checkoutAvailable:false,earningStatus:'validation-required',packs,operators,cosmetics:rows(cosmetics),content:rows(content)};}
module.exports={operators,packs,cosmetics,content,findProduct,catalog,assetReadiness,contentReadiness,productReady};
