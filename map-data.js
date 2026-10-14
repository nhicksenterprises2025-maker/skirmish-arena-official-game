(function(root){
 'use strict';
 // Map cells describe geography only. Weapon tuning keeps its legacy units.
 const freeze=value=>{if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;};
 const road=(x,y,w,h,major=false)=>({x,y,w,h,major});
 const box=(x,y,w,h,kind='crate',asset)=>({type:'rect',x,y,w,h,kind,...(asset?{asset}: {})});
 const tree=(x,y,r=32)=>({type:'circle',x,y,r,kind:'tree'});
 const spawn=(x,y,team)=>({x,y,...(team===undefined?{}:{team})});
 const zone=(id,label,x,y,radius=140)=>({id,label,x,y,radius});
 const objectives={
  'brightfield-blocks':{domination:[zone('A','A',1060,1440),zone('B','B',2160,1440),zone('C','C',3260,1440)],hardpoint:[zone('P1','Central Crossing',2160,1440),zone('P2','Northwest Lane',710,520),zone('P3','Northeast Lane',3610,520),zone('P4','Southeast Lane',3610,2360),zone('P5','Southwest Lane',710,2360)]},
  'foundry-crossing':{domination:[zone('A','A',400,1152),zone('B','B',1536,1152),zone('C','C',2640,1152)],hardpoint:[zone('P1','Workshop Crossing',1536,1152),zone('P2','Northwest Yard',400,392),zone('P3','Northeast Yard',2640,392),zone('P4','Southeast Yard',2640,1888),zone('P5','Southwest Yard',400,1888)]},
  'relay-fields':{domination:[zone('A','A',1440,1504),zone('B','B',2560,1280),zone('C','C',3680,1504)],hardpoint:[zone('P1','Central Relay',2560,1280),zone('P2','West Crossing',624,1504),zone('P3','North Control Lane',2560,560),zone('P4','East Crossing',4496,1504),zone('P5','South Control Lane',2560,2528)]}
 };
 const definition=(id,name,w,h,theme,identity,layout)=>({id,name,revision:id==='brightfield-blocks'?'brightfield-district-2':id+'-1',permanent:id==='brightfield-blocks',world:{w,h},grid:{columns:w/32,rows:h/32,cellWorld:32,tileAreaM2:2},metersPerWorldUnit:Math.SQRT2/32,theme,identity,objectives:objectives[id],layout});
 const registry=freeze({
  'brightfield-blocks':definition('brightfield-blocks','Brightfield Blocks',4320,2880,'neighborhood','Residential lanes, gardens and two-door homes.',null),
  'foundry-crossing':definition('foundry-crossing','Foundry Crossing',3072,2304,'foundry','Compact workshops, short yard crossings and several flanking routes.',{
   roads:[road(0,1040,3072,224,true),road(352,0,160,2304),road(2560,0,160,2304),road(0,320,3072,144),road(0,1824,3072,128),road(1456,464,144,1360)],
   surfaces:[{x:80,y:584,w:208,h:1040,kind:'driveway'},{x:2784,y:584,w:208,h:1040,kind:'driveway'},{x:560,y:520,w:736,h:464,kind:'driveway'},{x:1760,y:520,w:736,h:464,kind:'driveway'},{x:560,y:1320,w:736,h:456,kind:'driveway'},{x:1760,y:1320,w:736,h:456,kind:'driveway'}],
   buildings:[
    [704,560,512,384,'south',0,'Machine Shop'],[1824,560,544,384,'south',1,'Assembly Workshop'],
    [704,1360,544,352,'east',2,'Dispatch Workshop'],[1824,1360,544,352,'west',3,'Tool Room'],
    [1360,72,352,176,'west',1,'North Office'],[1360,2016,352,208,'east',0,'South Office']
   ],
   cover:[
    box(96,640,128,80,'utility','foundry_press'),box(96,912,96,64),box(96,1440,112,72,'utility','foundry_press'),box(112,1968,96,64),
    box(2816,640,128,80,'utility','foundry_press'),box(2880,912,96,64),box(2816,1440,112,72,'utility','foundry_press'),box(2816,1968,96,64),
    box(576,640,64,128,'utility','foundry_rack'),box(2464,640,64,128,'utility','foundry_rack'),
    box(576,1440,64,128,'utility','foundry_rack'),box(2464,1440,64,128,'utility','foundry_rack'),
    box(1280,656,96,64),box(1696,656,64,96),box(1280,1440,64,96),box(1696,1568,96,64),
    box(768,1064,112,64,'utility','foundry_workbench'),box(2192,1176,112,64,'utility','foundry_workbench'),
    box(1112,1136,80,96),box(1880,1072,80,96),
    box(1056,144,160,80,'utility','foundry_rack'),box(1856,144,160,80,'utility','foundry_rack'),
    box(960,2096,144,80,'utility','foundry_rack'),box(1952,2096,144,80,'utility','foundry_rack'),
    box(848,656,72,48,'interior','foundry_workbench'),box(2040,656,72,48,'interior','foundry_workbench'),
    box(848,1424,72,48,'interior','foundry_workbench'),box(2040,1424,72,48,'interior','foundry_workbench'),
    tree(280,224,28),tree(2792,224,28),tree(280,2112,28),tree(2792,2112,28)
   ],
   spawns:[
    spawn(128,160,0),spawn(240,400,0),spawn(160,1120,0),spawn(256,1656,0),spawn(160,2160,0),spawn(608,160,0),spawn(608,2048,0),spawn(960,496,0),
    spawn(2944,160,1),spawn(2832,400,1),spawn(2912,1120,1),spawn(2816,1656,1),spawn(2912,2160,1),spawn(2464,160,1),spawn(2464,2048,1),spawn(2112,496,1),
    spawn(960,800),spawn(2096,800),spawn(976,1528),spawn(2096,1528),spawn(1536,320),spawn(1536,1936),spawn(1360,896),spawn(1712,896),
    spawn(1360,1648),spawn(1728,1376),spawn(672,1264),spawn(2400,1264),spawn(1136,1952),spawn(1888,1952),spawn(1216,320),spawn(1856,320)
   ],
   outerWorld:[
    {kind:'industrial',x:-560,y:560,w:300,h:880,tone:0},{kind:'industrial',x:3328,y:592,w:400,h:832,tone:1},
    {kind:'industrial',x:656,y:-480,w:880,h:256,tone:2},{kind:'industrial',x:1824,y:2560,w:784,h:320,tone:0}
   ]
  }),
  'relay-fields':definition('relay-fields','Relay Fields',5120,3072,'relay','Open relay lanes, offset utility sheds and sheltered crossing routes.',{
   roads:[road(0,1376,5120,256,true),road(0,480,5120,160),road(0,2448,5120,160),road(544,0,160,3072),road(4416,0,160,3072),road(2496,640,128,1808)],
   surfaces:[{x:2320,y:928,w:144,h:144,kind:'driveway'},{x:2720,y:1952,w:144,h:144,kind:'driveway'},{x:1840,y:880,w:144,h:112,kind:'driveway'},{x:3040,y:1088,w:144,h:112,kind:'driveway'},{x:1888,y:2032,w:144,h:112,kind:'driveway'},{x:3072,y:1872,w:144,h:112,kind:'driveway'}],
   buildings:[
    [1008,800,608,384,'south',0,'West Relay Shed'],[3520,800,576,384,'south',1,'East Relay Shed'],
    [1056,1824,576,384,'north',2,'West Maintenance'],[3520,1824,576,384,'north',3,'East Maintenance'],
    [1920,96,512,288,'east',1,'North Control'],[2688,2704,512,272,'west',0,'South Control']
   ],
   cover:[
    box(2336,944,112,112,'landmark','relay_mast'),box(2736,1968,112,112,'landmark','relay_mast'),
    box(864,1280,176,64,'utility','relay_generator'),box(4080,1664,176,64,'utility','relay_generator'),
    box(1808,1392,144,64,'barrier','relay_barrier'),box(3168,1552,144,64,'barrier','relay_barrier'),box(2504,1464,112,80,'utility','relay_generator'),
    box(1376,512,128,64,'barrier','relay_barrier'),box(3584,576,128,64,'barrier','relay_barrier'),
    box(1504,2480,128,64,'barrier','relay_barrier'),box(3456,2544,128,64,'barrier','relay_barrier'),
    box(1856,896,112,80,'utility','relay_generator'),box(3056,1104,112,80,'utility','relay_generator'),
    box(1904,2048,112,80,'utility','relay_generator'),box(3088,1888,112,80,'utility','relay_generator'),
    box(224,800,128,64),box(224,1968,128,64),box(4768,800,128,64),box(4768,1968,128,64),
    box(768,944,64,144,'barrier','relay_barrier'),box(4288,944,64,144,'barrier','relay_barrier'),
    box(768,1920,64,144,'barrier','relay_barrier'),box(4288,1920,64,144,'barrier','relay_barrier'),
    box(1216,864,80,48,'interior'),box(3744,864,80,48,'interior'),box(1280,1888,80,48,'interior'),box(3744,1888,80,48,'interior'),
    tree(880,192),tree(1648,224),tree(2992,240),tree(4208,192),tree(912,2864),tree(1856,2880),tree(3520,2864),tree(4224,2880),
    tree(864,688),tree(4240,688),tree(864,2352),tree(4240,2352),tree(2064,704),tree(2976,2368)
   ],
   spawns:[
    spawn(160,192,0),spawn(368,400,0),spawn(160,1152,0),spawn(320,1504,0),spawn(160,1792,0),spawn(368,2704,0),spawn(160,2880,0),spawn(864,1664,0),
    spawn(4960,192,1),spawn(4752,400,1),spawn(4960,1152,1),spawn(4800,1504,1),spawn(4960,1792,1),spawn(4752,2704,1),spawn(4960,2880,1),spawn(4256,1280,1),
    spawn(1312,1008),spawn(3808,1008),spawn(1344,2032),spawn(3808,2032),spawn(2336,560),spawn(2784,2528),spawn(1760,1504),spawn(3360,1504),
    spawn(2128,1264),spawn(2944,1760),spawn(1760,2400),spawn(3360,704),spawn(1856,416),spawn(3296,2656),spawn(832,2240),spawn(4288,2240)
   ],
   outerWorld:[
    {kind:'relay',x:-592,y:320,w:256,h:800,tone:0},{kind:'relay',x:5456,y:1856,w:352,h:704,tone:1},
    {kind:'industrial',x:944,y:-528,w:880,h:304,tone:2},{kind:'industrial',x:3488,y:3328,w:784,h:288,tone:0},
    {kind:'tree',x:-176,y:2304,r:68},{kind:'tree',x:5328,y:448,r:64}
   ]
  })
 });
 const get=id=>typeof id==='string'&&Object.hasOwn(registry,id)?registry[id]:null;
 const list=()=>Object.values(registry);
 const api=Object.freeze({schema:1,defaultMapId:'brightfield-blocks',registry,get,list});
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SARMaps=api;
})(typeof window!=='undefined'?window:globalThis);
