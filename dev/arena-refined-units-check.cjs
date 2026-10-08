'use strict';
// Independent Audit 5 conversion acceptance. Every calibration below is a
// synthetic/hypothetical fixture, never the live Brightfield calibration.
// No engine/account initialization, storage migration or balance activation.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const reportPath=path.resolve(process.argv[2]||path.join(os.homedir(),'OneDrive','Documents','ChatGPT','freeshui','arena-refined-audit-5','units-results.json'));
const relativeReport=path.relative(root,reportPath);
assert.equal(path.extname(reportPath).toLowerCase(),'.json','Report output must be JSON');
assert.ok(relativeReport.startsWith('..'+path.sep)||path.isAbsolute(relativeReport),'Evidence must stay outside the project');
const preservedFiles=['game.js','version.json','build-meta.js','docs/arena-refined-audit.md','dev/fixtures/balance-6.0.json','dev/fixtures/balance-7.0.json','dev/fixtures/balance-8.0.json'];
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const before=Object.fromEntries(preservedFiles.map(file=>[file,sha(file)]));
const U=require('../distance-units.js');
const checks=[],copy=value=>JSON.parse(JSON.stringify(value));
function near(actual,expected,label){assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=1e-11*Math.max(1,Math.abs(expected)),(label||'conversion')+': '+actual+' versus '+expected);}
function run(name,check){check();checks.push(name);console.log('PASS '+name);}
const squareSpec={mapId:'synthetic-square-map',calibrationId:'fixture-square-v1',calibrationState:'confirmed',worldWidth:6400,worldHeight:3200,gridColumns:200,gridRows:100,tileAreaSquareMeters:2,tileShape:'square'};
let square;
try {
 run('Stable legacy units and immutable Node/browser API',()=>{
  assert.deepEqual(U.LEGACY_WEAPON_UNITS,{id:'legacy-weapon-tile-70wu-v1',worldUnitsPerTile:70});
  assert.ok(Object.isFrozen(U));assert.ok(Object.isFrozen(U.LEGACY_WEAPON_UNITS));
  assert.throws(()=>{U.LEGACY_WEAPON_UNITS.worldUnitsPerTile=32;},TypeError);
  const context=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(path.join(root,'distance-units.js'),'utf8'),context);
  assert.deepEqual(Object.keys(context.window.SARUnits).sort(),Object.keys(U).sort());
  assert.equal(context.window.SARUnits.legacyWeaponDistanceToWorld(3.5),245);
 });
 run('Current 4320 by 2880 world rejects incompatible 110 by 90 square 2 m2 cells',()=>{
  assert.throws(()=>U.calibrateMap({...squareSpec,mapId:'brightfield-conflict-fixture',worldWidth:4320,worldHeight:2880,gridColumns:110,gridRows:90}),/square|aspect|conflict/i);
  assert.throws(()=>U.calibrateMap({...squareSpec,calibrationState:'pending'}),/unconfirmed|confirmed/i);
  assert.throws(()=>U.worldDistanceToMeters(900,{mapId:'brightfield-blocks',calibrationState:'pending'}),/calibration|unconfirmed/i);
 });
 run('Two square meters means sqrt(2) meters per side, never two meters',()=>{
  square=U.calibrateMap(squareSpec);
  near(square.tileWidthMeters,Math.SQRT2);near(square.tileHeightMeters,Math.SQRT2);
  near(square.metersPerWorldUnit,Math.SQRT2/32);
  near(square.widthMeters,200*Math.SQRT2);near(square.heightMeters,100*Math.SQRT2);
  near(square.tileWidthMeters*square.tileHeightMeters,2);
  assert.notEqual(square.tileWidthMeters,2);assert.ok(Object.isFrozen(square));
  assert.throws(()=>{square.metersPerWorldUnit=1;},TypeError);
  assert.deepEqual(squareSpec,{mapId:'synthetic-square-map',calibrationId:'fixture-square-v1',calibrationState:'confirmed',worldWidth:6400,worldHeight:3200,gridColumns:200,gridRows:100,tileAreaSquareMeters:2,tileShape:'square'});
 });
 run('Calibration validates explicit shape, identity, dimensions and cell area',()=>{
  const invalid=[{mapId:''},{calibrationId:''},{tileShape:undefined},{tileShape:'hexagon'},{worldWidth:0},{worldHeight:-1},{gridColumns:110.5},{gridRows:0},{tileAreaSquareMeters:NaN},{tileAreaSquareMeters:Infinity},{worldWidth:'6400'}];
  for(const edit of invalid)assert.throws(()=>U.calibrateMap({...squareSpec,...edit}),undefined,JSON.stringify(edit));
  assert.throws(()=>U.calibrateMap(null));assert.throws(()=>U.calibrateMap({...squareSpec,calibrationState:undefined}));
 });
 run('Single scalar conversion is direction and camera independent with reversible distances',()=>{
  for(const value of [0,1,.125,70,245,900,4320,9876.54321]){
   near(U.worldDistanceToMeters(value,square),value*Math.SQRT2/32);
   near(U.metersToWorldDistance(U.worldDistanceToMeters(value,square),square),value);
  }
  for(const angle of [0,Math.PI/6,Math.PI/2,Math.PI*.87,Math.PI]){
   const dx=Math.cos(angle)*750,dy=Math.sin(angle)*750;
   near(Math.hypot(U.worldDistanceToMeters(Math.abs(dx),square),U.worldDistanceToMeters(Math.abs(dy),square)),U.worldDistanceToMeters(750,square));
  }
  for(const zoom of [.35,1,1.8,4])near(U.worldDistanceToMeters(900,{...copy(square),cameraZoom:zoom}),900*Math.SQRT2/32);
 });
 run('Future maps and explicitly hypothetical rectangle/square alternatives have independent metadata',()=>{
  const future=U.calibrateMap({...squareSpec,mapId:'synthetic-courtyard',calibrationId:'fixture-courtyard-v1',worldWidth:1000,worldHeight:1000,gridColumns:50,gridRows:50,tileAreaSquareMeters:9});
  near(future.tileWidthMeters,3);near(future.metersPerWorldUnit,.15);near(U.worldDistanceToMeters(200,future),30);
  assert.notEqual(future.metersPerWorldUnit,square.metersPerWorldUnit);
  // This is an unselected alternative, not permission to change Brightfield.
  const rectangle=U.calibrateMap({...squareSpec,mapId:'hypothetical-rectangle-alternative',calibrationId:'fixture-rectangle-only',worldWidth:4320,worldHeight:2880,gridColumns:110,gridRows:90,tileShape:'rectangle'});
  near(rectangle.tileWidthMeters*rectangle.tileHeightMeters,2);
  near(rectangle.tileWidthMeters/rectangle.tileHeightMeters,(4320/110)/(2880/90));
  near(rectangle.widthMeters/rectangle.heightMeters,1.5);
  near(rectangle.tileWidthMeters/(4320/110),rectangle.tileHeightMeters/(2880/90));
  const hypotheticalSquare=U.calibrateMap({...squareSpec,mapId:'hypothetical-square-grid-alternative',calibrationId:'fixture-square-alternative-only',worldWidth:4320,worldHeight:2880,gridColumns:135,gridRows:90});
  near(hypotheticalSquare.tileWidthMeters,Math.SQRT2);near(hypotheticalSquare.metersPerWorldUnit,Math.SQRT2/32);
 });
 run('Legacy weapon distance and speed stay 70 world units, distinct from new grid cells',()=>{
  for(const tileValue of [0,.5,3.5,7,22,32,45,80,105,125]){
   near(U.legacyWeaponDistanceToWorld(tileValue),tileValue*70);
   near(U.legacyWeaponSpeedToWorldPerSecond(tileValue),tileValue*70);
   near(U.legacyWeaponDistanceToMeters(tileValue,square),tileValue*70*Math.SQRT2/32);
   near(U.legacyWeaponSpeedToMetersPerSecond(tileValue,square),tileValue*70*Math.SQRT2/32);
  }
  assert.notEqual(U.legacyWeaponDistanceToMeters(1,square),square.tileWidthMeters);
 });
 run('Damage falloff and projectile travel time remain invariant at fixed world positions',()=>{
  const weapons=require('./fixtures/balance-8.0.json').weapons;
  for(const [name,w] of Object.entries(weapons)){
   const speedWorld=w.speed*70,speedMeters=U.legacyWeaponSpeedToMetersPerSecond(w.speed,square);
   const startMeters=U.legacyWeaponDistanceToMeters(w.falloffStart,square),fractionPerMeter=U.legacyFalloffFractionToPercentPerMeter(w.falloff,square)/100;
   for(const rangeWorld of [0,22,245,700,1400,2240,3150,4320,9000]){
    const meters=U.worldDistanceToMeters(rangeWorld,square);
    const original=Math.max(.45,1-Math.max(0,rangeWorld/70-w.falloffStart)*w.falloff);
    const converted=Math.max(.45,1-Math.max(0,meters-startMeters)*fractionPerMeter);
    near(converted,original,name+' falloff');near(w.damage*converted,w.damage*original,name+' body damage');near(w.head*converted,w.head*original,name+' head damage');
    near(meters/speedMeters,rangeWorld/speedWorld,name+' projectile travel');
   }
  }
  near(U.worldSpeedToMetersPerSecond(285,square),285*Math.SQRT2/32);
  near(U.worldDistanceToMeters(260,square),260*Math.SQRT2/32);
 });
 run('Falloff percentage per meter converts rate rather than relabeling per-tile percentage',()=>{
  const tileMeters=U.legacyWeaponDistanceToMeters(1,square);
  near(U.legacyFalloffFractionToPercentPerMeter(.025,square),2.5/tileMeters);
  near(U.legacyFalloffFractionToPercentPerMeter(.1,square)*tileMeters,10);
  near(U.legacyFalloffFractionToPercentPerMeter(0,square),0);
  assert.notEqual(U.legacyFalloffFractionToPercentPerMeter(.025,square),2.5);
 });
 run('Known world/tile/meter provenance resolves once and unknown historical units stay unknown',()=>{
  const world={distanceUnit:'world-unit',mapCalibration:square};
  const tiles={distanceUnit:'legacy-weapon-tile',legacyWorldUnitsPerTile:70,mapCalibration:square};
  const meters={distanceUnit:'meter'};
  near(U.resolveDistanceMeters(900,world),900*Math.SQRT2/32);
  near(U.resolveDistanceMeters(900/70,tiles),900*Math.SQRT2/32);
  const alreadyConverted=U.resolveDistanceMeters(900,world);
  assert.equal(U.resolveDistanceMeters(alreadyConverted,meters),alreadyConverted);
  for(const provenance of [null,{}, {distanceUnit:'unknown'},{distanceUnit:'world-unit'},{distanceUnit:'world-unit',mapCalibration:{...copy(square),calibrationState:'pending'}},{distanceUnit:'legacy-weapon-tile',mapCalibration:square},{...tiles,legacyWorldUnitsPerTile:32},{...tiles,legacyWorldUnitsPerTile:60}])assert.equal(U.resolveDistanceMeters(900,provenance),null);
  const archive={id:'legacy-unverified',meta:{'AR-15':{killDistance:2450,killDistanceN:4}}},snapshot=copy(archive);
  assert.equal(U.resolveDistanceMeters(archive.meta['AR-15'].killDistance,null),null);assert.deepEqual(archive,snapshot);
 });
 run('Measured averages retain original sums/counts and zero/unknown samples never invent meters',()=>{
  const provenance={distanceUnit:'world-unit',mapCalibration:square},raw={engagementDistance:1800,engagementDistanceN:2,killDistance:700,killDistanceN:1},beforeRaw=copy(raw);
  near(U.averageDistanceMeters(raw.engagementDistance,raw.engagementDistanceN,provenance),900*Math.SQRT2/32);
  near(U.averageDistanceMeters(raw.killDistance,raw.killDistanceN,provenance),700*Math.SQRT2/32);
  near(U.averageDistanceMeters(0,3,provenance),0);
  assert.equal(U.averageDistanceMeters(123,0,provenance),null);assert.equal(U.averageDistanceMeters(123,-1,provenance),null);assert.equal(U.averageDistanceMeters(123,1.5,provenance),null);assert.equal(U.averageDistanceMeters(123,'2',provenance),null);assert.equal(U.averageDistanceMeters(123,1,{}),null);
  for(const invalidSum of [null,undefined,'123',NaN,Infinity,-1])assert.equal(U.averageDistanceMeters(invalidSum,2,provenance),null);
  assert.deepEqual(raw,beforeRaw);
 });
 run('Persisted calibration roundtrips, rejects tampering and revalidates mutable metadata',()=>{
  const saved=copy(square);near(U.worldDistanceToMeters(900,saved),900*Math.SQRT2/32);
  near(U.worldDistanceToMeters(900,Object.freeze(copy(square))),900*Math.SQRT2/32);
  for(const edit of [{metersPerWorldUnit:1},{tileWidthMeters:2},{tileHeightMeters:2},{widthMeters:1},{heightMeters:1},{worldWidth:6300}])assert.throws(()=>U.worldDistanceToMeters(900,{...copy(square),...edit}));
  saved.metersPerWorldUnit=1;assert.throws(()=>U.worldDistanceToMeters(900,saved),/inconsistent/i);
  saved.metersPerWorldUnit=square.metersPerWorldUnit;near(U.worldDistanceToMeters(900,saved),900*Math.SQRT2/32);
 });
 run('Invalid distance/rate inputs fail explicitly while historical resolution fails closed',()=>{
  for(const invalid of [-1,NaN,Infinity,'70',null,undefined]){
   for(const convert of [U.legacyWeaponDistanceToWorld,U.legacyWeaponSpeedToWorldPerSecond])assert.throws(()=>convert(invalid));
   for(const convert of [U.worldDistanceToMeters,U.metersToWorldDistance,U.worldSpeedToMetersPerSecond,U.legacyWeaponDistanceToMeters,U.legacyWeaponSpeedToMetersPerSecond,U.legacyFalloffFractionToPercentPerMeter])assert.throws(()=>convert(invalid,square));
   assert.equal(U.resolveDistanceMeters(invalid,{distanceUnit:'meter'}),null);
  }
  assert.throws(()=>U.worldDistanceToMeters(900,null));assert.throws(()=>U.worldSpeedToMetersPerSecond(285,{metersPerWorldUnit:1}));
 });
 run('Unit checks never modify live source, metadata, balance fixtures or audit history',()=>{
  assert.deepEqual(Object.fromEntries(preservedFiles.map(file=>[file,sha(file)])),before);
 });
 fs.mkdirSync(path.dirname(reportPath),{recursive:true});
 fs.writeFileSync(reportPath,JSON.stringify({status:'PASS',scope:'Independent conversion layer; no live map calibration or Balance 9 activation',checks,fixtureDisclaimer:'All confirmed maps in this check are synthetic or explicitly hypothetical unselected alternatives.',preservedFiles:before,currentMapConflict:{worldWidth:4320,worldHeight:2880,requestedGridColumns:110,requestedGridRows:90,tileAreaSquareMeters:2,tileShape:'square',status:'REJECTED'},moduleSha256:sha('distance-units.js')},null,2)+'\n');
 console.log(checks.length+' independent units groups passed; '+reportPath);
} catch(error){
 console.error('FAIL '+error.stack);process.exitCode=1;
}
