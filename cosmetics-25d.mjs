import {GLTFLoader} from './vendor/addons/loaders/GLTFLoader.js';

// Presentation only: the account service owns entitlements. Never warm the
// wardrobe at boot; visible inspections and the equipped item request one GLB.
const manifestURL=new URL('./assets/25d/cosmetics/manifest.json',import.meta.url);
const records=new Map(),pending=new Map();
let manifestPromise,clock=0;
const MAX_IDLE_ITEMS=6;
export function cosmeticKey(value){return value?.id&&value?.operatorId?`${value.id}:${value.operatorId}:${value.styleId||'main'}`:'';}
async function manifest(){
  if(!manifestPromise)manifestPromise=fetch(manifestURL).then(async response=>{
    if(!response.ok)throw new Error('Appearance catalog unavailable');
    const value=await response.json();if(value.schema!==1||!value.cosmetics)throw new Error('Appearance catalog invalid');return value;
  }).catch(error=>{manifestPromise=null;throw error;});
  return manifestPromise;
}
function prune(){
  const idle=[...records.values()].filter(value=>!value.refs).sort((a,b)=>a.touched-b.touched);
  while(idle.length>MAX_IDLE_ITEMS){
    const record=idle.shift(),geometries=new Set(),materials=new Set();records.delete(record.id);
    record.scene.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])if(material)materials.add(material);});
    geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());
  }
}
export async function ensureCosmeticAssets(selection){
  if(!cosmeticKey(selection))return null;
  const catalog=await manifest(),item=catalog.cosmetics[selection.id],styleId=selection.styleId||'main';
  if(!item||item.operatorId!==selection.operatorId||!item.styles[styleId])throw new Error('Appearance is incompatible with this operator');
  // Export validation gates purchases on the server. A pending validation flag
  // remains inspectable to the local asset checks, never an ownership assertion.
  if(!records.has(selection.id)){
    if(!pending.has(selection.id))pending.set(selection.id,(async()=>{
      const path=item.styles.main.file;
      if(!/^assets\/25d\/cosmetics\/[a-z0-9.-]+\.glb$/.test(path))throw new Error('Invalid appearance asset path');
      const gltf=await new GLTFLoader().loadAsync(new URL('./'+path,import.meta.url).href);
      for(const [id,style] of Object.entries(item.styles)){
        const node=gltf.scene.getObjectByName(style.node);
        if(!node||Object.values(style.attachments).some(name=>!node.getObjectByName(name)))throw new Error('Appearance has incomplete attachments: '+id);
      }
      gltf.scene.traverse(node=>{if(node.isMesh){node.geometry.userData.sarShared=true;node.castShadow=node.receiveShadow=true;for(const material of Array.isArray(node.material)?node.material:[node.material])material.userData.sarShared=true;}});
      records.set(selection.id,{id:selection.id,item,scene:gltf.scene,refs:0,touched:++clock});
    })().finally(()=>pending.delete(selection.id)));
    await pending.get(selection.id);
  }
  const record=records.get(selection.id);record.touched=++clock;prune();return readyCosmetic(selection);
}
export function readyCosmetic(selection){
  const record=records.get(selection?.id),style=record?.item.styles[selection?.styleId||'main'];
  if(!style||record.item.operatorId!==selection?.operatorId)return null;
  return {palette:style.palette,lobbyPose:record.item.lobbyPose,style,record};
}
export function attachCosmetic(entity,selection){
  const ready=readyCosmetic(selection);if(!ready)return false;
  const {record,style}=ready;record.refs++;record.touched=++clock;
  const template=record.scene.getObjectByName(style.node);
  for(const [part,name] of Object.entries(style.attachments)){
    const child=template.getObjectByName(name).clone(true);child.position.set(0,0,0);child.quaternion.identity();child.scale.setScalar(1);
    child.name='cosmetic:'+part;entity.torso.add(child);if(part==='head')entity.helmet=child;
  }
  entity.cosmetic={id:selection.id,operatorId:selection.operatorId,styleId:selection.styleId||'main'};
  entity.cosmeticLobbyPose=ready.lobbyPose;
  let released=false;
  entity.group.userData.releaseCosmetic=()=>{if(released)return;released=true;record.refs--;record.touched=++clock;prune();};
  return true;
}
export function cosmeticDiagnostics(){return {residentItems:records.size,activeItems:[...records.values()].filter(value=>value.refs>0).length,idleItems:[...records.values()].filter(value=>!value.refs).length,pendingItems:pending.size,maxIdleItems:MAX_IDLE_ITEMS};}
