(function(root){
 'use strict';
 // Legacy weapon units are not map-grid cells. Simulation values stay in world
 // units; a confirmed, map-specific calibration is required for meter display.
 const LEGACY_WEAPON_UNITS=Object.freeze({id:'legacy-weapon-tile-70wu-v1',worldUnitsPerTile:70});
 const scales=new WeakMap();
 function positive(value,name){if(typeof value!=='number'||!Number.isFinite(value)||value<=0)throw new RangeError(name+' must be positive and finite');return value;}
 function distance(value){if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw new RangeError('Distance/rate must be finite and nonnegative');return value;}
 function label(value,name){if(typeof value!=='string'||!value.trim())throw new TypeError(name+' is required');return value;}
 function close(a,b){return Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(a),Math.abs(b));}
 function calibrateMap(spec){
  if(!spec||spec.calibrationState!=='confirmed')throw new RangeError('Map meter calibration is unconfirmed');
  const mapId=label(spec.mapId,'mapId'),calibrationId=label(spec.calibrationId,'calibrationId');
  const worldWidth=positive(spec.worldWidth,'worldWidth'),worldHeight=positive(spec.worldHeight,'worldHeight');
  const gridColumns=positive(spec.gridColumns,'gridColumns'),gridRows=positive(spec.gridRows,'gridRows');
  if(!Number.isInteger(gridColumns)||!Number.isInteger(gridRows))throw new RangeError('Grid dimensions must be whole cells');
  const tileAreaSquareMeters=positive(spec.tileAreaSquareMeters,'tileAreaSquareMeters'),tileShape=spec.tileShape;
  if(tileShape!=='square'&&tileShape!=='rectangle')throw new RangeError('Explicit square/rectangle tileShape is required');
  const worldCellWidth=worldWidth/gridColumns,worldCellHeight=worldHeight/gridRows;
  if(tileShape==='square'&&!close(worldCellWidth,worldCellHeight))throw new RangeError('Square map cells conflict with unchanged world aspect ratio');
  const metersPerWorldUnit=Math.sqrt(tileAreaSquareMeters/(worldCellWidth*worldCellHeight));
  positive(metersPerWorldUnit,'metersPerWorldUnit');
  const value=Object.freeze({schema:1,mapId,calibrationId,calibrationState:'confirmed',worldWidth,worldHeight,gridColumns,gridRows,tileAreaSquareMeters,tileShape,metersPerWorldUnit,tileWidthMeters:worldCellWidth*metersPerWorldUnit,tileHeightMeters:worldCellHeight*metersPerWorldUnit,widthMeters:worldWidth*metersPerWorldUnit,heightMeters:worldHeight*metersPerWorldUnit});
  scales.set(value,metersPerWorldUnit);return value;
 }
 function scale(map){
  if(!map||typeof map!=='object')throw new RangeError('Explicit map calibration is required');
  if(scales.has(map))return scales.get(map);
  // Persisted metadata must reconstruct the same calibration. Never trust a
  // loose multiplier or reuse a different map's scale silently.
  const verified=calibrateMap(map);
  for(const key of ['metersPerWorldUnit','tileWidthMeters','tileHeightMeters','widthMeters','heightMeters'])if(map[key]!==undefined&&!close(map[key],verified[key]))throw new RangeError('Inconsistent map calibration: '+key);
  // Cache only immutable definitions; mutable imported JSON is revalidated.
  if(Object.isFrozen(map))scales.set(map,verified.metersPerWorldUnit);
  return verified.metersPerWorldUnit;
 }
 const legacyWeaponDistanceToWorld=value=>distance(value)*LEGACY_WEAPON_UNITS.worldUnitsPerTile;
 const legacyWeaponSpeedToWorldPerSecond=legacyWeaponDistanceToWorld;
 const worldDistanceToMeters=(value,map)=>distance(value)*scale(map);
 const metersToWorldDistance=(value,map)=>distance(value)/scale(map);
 const worldSpeedToMetersPerSecond=worldDistanceToMeters;
 const legacyWeaponDistanceToMeters=(value,map)=>worldDistanceToMeters(legacyWeaponDistanceToWorld(value),map);
 const legacyWeaponSpeedToMetersPerSecond=legacyWeaponDistanceToMeters;
 const legacyFalloffFractionToPercentPerMeter=(value,map)=>distance(value)*100/legacyWeaponDistanceToMeters(1,map);
 function resolveDistanceMeters(value,provenance){
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||!provenance)return null;
  if(provenance.distanceUnit==='meter')return value; // Explicitly already converted.
  if(provenance.distanceUnit!=='world-unit'&&provenance.distanceUnit!=='legacy-weapon-tile')return null;
  if(provenance.distanceUnit==='legacy-weapon-tile'&&provenance.legacyWorldUnitsPerTile!==LEGACY_WEAPON_UNITS.worldUnitsPerTile)return null;
  try{return worldDistanceToMeters(provenance.distanceUnit==='world-unit'?value:legacyWeaponDistanceToWorld(value),provenance.mapCalibration);}catch(error){if(error instanceof RangeError||error instanceof TypeError)return null;throw error;}
 }
 function averageDistanceMeters(sum,count,provenance){return typeof sum==='number'&&Number.isFinite(sum)&&sum>=0&&typeof count==='number'&&Number.isInteger(count)&&count>0?resolveDistanceMeters(sum/count,provenance):null;}
 // Confirmed 2026-10-07: square 2 m² cells, with the existing world unchanged.
 // Every future map declares its own dimensions/calibration here; neither the
 // renderer nor weapon tuning interprets these cells as legacy weapon tiles.
 const MAPS=Object.freeze({'brightfield-blocks':calibrateMap({mapId:'brightfield-blocks',calibrationId:'brightfield-square-2m2-v1',calibrationState:'confirmed',worldWidth:4320,worldHeight:2880,gridColumns:135,gridRows:90,tileAreaSquareMeters:2,tileShape:'square'})});
 function mapCalibration(mapId){const map=MAPS[mapId];if(!map)throw new RangeError('Unknown map calibration: '+mapId);return map;}
 function worldProvenance(map){scale(map);return Object.freeze({distanceUnit:'world-unit',sourceUnitsId:LEGACY_WEAPON_UNITS.id,legacyWorldUnitsPerTile:LEGACY_WEAPON_UNITS.worldUnitsPerTile,mapId:map.mapId,calibrationId:map.calibrationId,mapCalibration:map});}
 const api=Object.freeze({LEGACY_WEAPON_UNITS,MAPS,mapCalibration,worldProvenance,calibrateMap,legacyWeaponDistanceToWorld,legacyWeaponSpeedToWorldPerSecond,worldDistanceToMeters,metersToWorldDistance,worldSpeedToMetersPerSecond,legacyWeaponDistanceToMeters,legacyWeaponSpeedToMetersPerSecond,legacyFalloffFractionToPercentPerMeter,resolveDistanceMeters,averageDistanceMeters});
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SARUnits=api;
})(typeof window!=='undefined'?window:globalThis);
