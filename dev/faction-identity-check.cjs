'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const Identity=require('../faction-identity.js'),{CONFIG,DEFAULT_LOGO,validateLogo,renderLogo}=Identity;
const copy=value=>JSON.parse(JSON.stringify(value));
test('Logo stores only a compact curated configuration and renders deterministically after persistence',()=>{
 const result=validateLogo(DEFAULT_LOGO);assert.equal(result.ok,true);assert.deepEqual(result.logo,DEFAULT_LOGO);assert.notEqual(result.logo,DEFAULT_LOGO);
 const saved=JSON.stringify(result.logo);assert(saved.length<250);assert.equal(renderLogo(JSON.parse(saved)),renderLogo(DEFAULT_LOGO));assert(Object.isFrozen(CONFIG)&&Object.isFrozen(CONFIG.colors)&&Object.isFrozen(CONFIG.colors[0])&&Object.isFrozen(DEFAULT_LOGO));
});
test('Each configurable component has original deterministic geometry and substantial combinations',()=>{
 let combinations=1;for(const key of ['backgroundShape','primarySymbol','secondarySymbol','border','pattern']){const variants=CONFIG[key].map(row=>renderLogo({...DEFAULT_LOGO,[key]:row.id}));assert.equal(new Set(variants).size,CONFIG[key].length);combinations*=CONFIG[key].length;}
 const pairs=CONFIG.colors.flatMap(a=>CONFIG.colors.filter(b=>Identity.contrastRatio(a.id,b.id)>=CONFIG.minimumContrast).map(b=>[a.id,b.id]));
 assert(pairs.length>50);assert(combinations*pairs.length>500000);
 for(const [primaryColor,secondaryColor]of pairs)assert.equal(validateLogo({...DEFAULT_LOGO,primaryColor,secondaryColor}).ok,true);
});
test('Unsafe data, unknown components, versions and malformed saved logos fail without repair',()=>{
 const invalid=[null,[],{},false,'<svg>',{...DEFAULT_LOGO,schemaVersion:'1'},{...DEFAULT_LOGO,schemaVersion:2},{...DEFAULT_LOGO,schemaVersion:NaN},{...DEFAULT_LOGO,primaryColor:'#ffffff'},{...DEFAULT_LOGO,primarySymbol:'<script>alert(1)</script>'},{...DEFAULT_LOGO,secondarySymbol:'https://example.com/icon.svg'},{...DEFAULT_LOGO,path:'M0 0'},{...DEFAULT_LOGO,svg:'<svg onload="alert(1)">'},{...DEFAULT_LOGO,upload:'data:image/svg+xml;base64,AAAA'},{...DEFAULT_LOGO,primaryColor:'forest',secondaryColor:'forest'},{...DEFAULT_LOGO,primaryColor:'pine',secondaryColor:'forest'}];
 const missing=copy(DEFAULT_LOGO);delete missing.border;invalid.push(missing);const symbol=copy(DEFAULT_LOGO);symbol[Symbol('svg')]='<svg>';invalid.push(symbol);const inherited=Object.create(DEFAULT_LOGO);invalid.push(inherited);for(const key of Object.keys(DEFAULT_LOGO))for(const value of [null,{},[],{toString:null}])invalid.push({...DEFAULT_LOGO,[key]:value});
 for(const input of invalid){const result=validateLogo(input);assert.equal(result.ok,false);assert.equal(result.logo,null);assert(result.errors.length);assert.throws(()=>renderLogo(input),TypeError);}
});
test('SVG title is escaped, presentation boundaries validate, no user content becomes markup',()=>{
 const title='<script>alert("x")</script> & " \'',svg=renderLogo(DEFAULT_LOGO,{title,size:24});assert(svg.includes('&lt;script&gt;'));assert(!svg.includes('<script>'));assert(!/onload=|href=|url\(|<image|<foreignObject|<animate|\bid=/.test(svg));assert(svg.includes('role="img"')&&svg.includes('aria-label="')&&svg.includes('<title>'));
 const decorative=renderLogo(DEFAULT_LOGO,{decorative:true});assert(decorative.includes('aria-hidden="true"'));assert(!decorative.includes('<title>'));
 for(const options of [{size:'24'},{size:Infinity},{size:24.5},{size:11},{size:513},{title:'\u0000'},{title:null},{title:'x'.repeat(161)},{decorative:'yes'}])assert.throws(()=>renderLogo(DEFAULT_LOGO,options),TypeError);
});
test('Unknown and low-contrast colors are rejected; ratio matches accessible sRGB calculation',()=>{
 assert.equal(Identity.contrastRatio('unknown','ivory'),null);assert.equal(Identity.contrastRatio('ivory','ivory'),1);assert(Identity.contrastRatio('ivory','charcoal')>12);assert.equal(Identity.contrastRatio('forest','ivory'),Identity.contrastRatio('ivory','forest'));
});
test('Same shared browser UMD exports configuration and safe renderer',()=>{
 const window={},context=vm.createContext({window});vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../faction-identity.js'),'utf8'),context);const api=window.SARFactionIdentity;assert(api);assert.equal(api.renderLogo(api.DEFAULT_LOGO,{size:16}),renderLogo(DEFAULT_LOGO,{size:16}));assert.deepEqual(JSON.parse(JSON.stringify(api.CONFIG)),CONFIG);
});
