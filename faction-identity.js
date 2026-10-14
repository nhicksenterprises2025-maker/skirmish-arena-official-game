(function(root){
 'use strict';
 const options=rows=>Object.freeze(rows.map(([id,label,value])=>Object.freeze(value?{id,label,value}:{id,label})));
 const CONFIG=Object.freeze({
  schemaVersion:1,
  backgroundShape:options([['shield','Shield'],['circle','Circle'],['hexagon','Hexagon'],['diamond','Diamond'],['square','Square'],['arch','Arch'],['octagon','Octagon'],['pennant','Pennant']]),
  primarySymbol:options([['arrow','Arrow'],['tower','Tower'],['mountain','Mountain'],['flame','Flame'],['compass','Compass'],['blade','Blade'],['wing','Wing'],['anchor','Anchor'],['bolt','Bolt'],['oak','Oak'],['moon','Moon'],['bridge','Bridge']]),
  secondarySymbol:options([['none','None'],['star','Star'],['dots','Three dots'],['chevron','Chevron'],['wings','Wings'],['laurel','Laurel'],['rays','Rays']]),
  border:options([['none','None'],['single','Single'],['double','Double'],['inset','Inset']]),
  pattern:options([['solid','Solid'],['split','Split'],['diagonal','Diagonal'],['stripes','Stripes'],['checker','Checker']]),
  colors:options([['charcoal','Charcoal','#242c28'],['forest','Forest','#304c39'],['pine','Pine','#42624a'],['slate','Slate','#445660'],['navy','Navy','#293d51'],['burgundy','Burgundy','#633d43'],['rust','Rust','#92583e'],['sage','Sage','#afbea0'],['sand','Sand','#d2bc91'],['gold','Gold','#d4ae61'],['silver','Silver','#c8ceca'],['ivory','Ivory','#eeeede']]),
  minimumContrast:3
 });
 const DEFAULT_LOGO=Object.freeze({schemaVersion:1,backgroundShape:'shield',primarySymbol:'compass',secondarySymbol:'none',border:'single',pattern:'solid',primaryColor:'ivory',secondaryColor:'forest'});
 const fields=['schemaVersion','backgroundShape','primarySymbol','secondarySymbol','border','pattern','primaryColor','secondaryColor'];
 const allowed=Object.fromEntries(fields.slice(1).map(key=>[key,new Set((key.endsWith('Color')?CONFIG.colors:CONFIG[key]).map(row=>row.id))]));
 const colors=Object.fromEntries(CONFIG.colors.map(row=>[row.id,row.value]));
 function luminance(color){const channels=color.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;}
 function contrastRatio(foreground,background){if(typeof foreground!=='string'||typeof background!=='string'||!Object.hasOwn(colors,foreground)||!Object.hasOwn(colors,background))return null;const a=luminance(colors[foreground]),b=luminance(colors[background]);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
 function validateLogo(input){
  const errors=[];
  if(!input||typeof input!=='object'||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))return {ok:false,logo:null,errors:['Choose a valid faction logo configuration.']};
  const keys=Reflect.ownKeys(input);
  if(keys.some(key=>typeof key!=='string'||!fields.includes(key)))errors.push('Logo contains an unsupported component.');
  if(keys.length!==fields.length||fields.some(key=>!Object.hasOwn(input,key)))errors.push('Choose every faction logo component.');
  if(input.schemaVersion!==CONFIG.schemaVersion)errors.push('Unsupported faction logo version.');
  for(const key of fields.slice(1))if(typeof input[key]!=='string'||!allowed[key].has(input[key]))errors.push('Choose an approved '+key.replace(/([A-Z])/g,' $1').toLowerCase()+'.');
  const contrast=contrastRatio(input.primaryColor,input.secondaryColor);
  if(contrast!==null&&contrast<CONFIG.minimumContrast)errors.push('Primary and secondary colors need at least 3:1 contrast.');
  return errors.length?{ok:false,logo:null,errors}:{ok:true,logo:Object.fromEntries(fields.map(key=>[key,input[key]])),errors:[]};
 }
 const backgrounds={shield:'M16 12H84V49C84 69 66 84 50 92C34 84 16 69 16 49Z',circle:'M50 8A42 42 0 1 1 50 92A42 42 0 1 1 50 8Z',hexagon:'M28 10H72L92 50L72 90H28L8 50Z',diamond:'M50 6L94 50L50 94L6 50Z',square:'M12 12H88V88H12Z',arch:'M12 88V42C12 23 28 8 50 8C72 8 88 23 88 42V88Z',octagon:'M28 8H72L92 28V72L72 92H28L8 72V28Z',pennant:'M14 10H86V80L50 92L14 80Z'};
 const symbols={
  arrow:'M50 26L72 49H59V69H41V49H28Z',
  tower:'M32 29H42V36H46V29H54V36H58V29H68V46H63V68H37V46H32Z M46 68V55H54V68Z',
  mountain:'M26 67L43 34L53 50L60 39L76 67Z M39 44L43 37L48 46L43 43Z',
  flame:'M51 25C55 42 69 43 69 56C69 67 60 72 50 72C39 72 31 65 31 56C31 46 40 39 42 32C48 43 45 49 49 53C54 48 54 38 51 25Z',
  compass:'M50 25L57 43L75 50L57 57L50 75L43 57L25 50L43 43Z M50 44L44 50L50 56L56 50Z',
  blade:'M55 24L64 33L52 58L62 63L58 71L46 65L41 74L33 70L38 61L29 55L34 48L44 52Z',
  wing:'M29 31L75 45L67 55L52 50L63 61L55 69L37 57Z',
  anchor:'M45 27H55V35H62V43H55V62C61 59 64 54 66 49H74C72 62 62 69 50 73C38 69 28 62 26 49H34C36 54 39 59 45 62V43H38V35H45Z',
  bolt:'M48 25H68L56 45H72L42 75L47 55H29Z',
  oak:'M45 70V57H32L25 48L33 36H41L50 25L59 36H67L75 48L68 57H55V70Z',
  moon:'M57 25C42 24 29 34 29 49C29 65 43 76 59 73C68 71 74 65 77 57C54 65 39 39 57 25Z',
  bridge:'M25 43H75V54H69V69H59V54H41V69H31V54H25Z M34 33H42V43H34Z M58 33H66V43H58Z'
 };
 const accents={none:'',star:'M50 76L52 80L57 81L53 84L54 88L50 86L46 88L47 84L43 81L48 80Z',dots:'M44 81A2 2 0 1 1 40 81A2 2 0 1 1 44 81Z M52 81A2 2 0 1 1 48 81A2 2 0 1 1 52 81Z M60 81A2 2 0 1 1 56 81A2 2 0 1 1 60 81Z',chevron:'M37 76L50 82L63 76V81L50 88L37 81Z',wings:'M24 66L38 73L43 81L30 78Z M76 66L62 73L57 81L70 78Z',laurel:'M22 51L27 59L27 69L21 64Z M25 69L33 73L36 81L28 78Z M78 51L73 59L73 69L79 64Z M75 69L67 73L64 81L72 78Z',rays:'M29 29L33 27L37 35L33 38Z M71 29L67 27L63 35L67 38Z M48 17H52V23H48Z'};
 const patterns={solid:'',split:'M29 34H49V71H29Z',diagonal:'M28 56L60 26L65 31L33 61Z M36 73L71 40L74 46L42 77Z',stripes:'M28 35H72V39H28Z M28 47H72V51H28Z M28 59H72V63H28Z',checker:'M30 34H40V44H30Z M50 34H60V44H50Z M40 44H50V54H40Z M60 44H70V54H60Z M30 54H40V64H30Z M50 54H60V64H50Z'};
 function escape(value){return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));}
 function renderLogo(input,options={}){
  const result=validateLogo(input);if(!result.ok)throw new TypeError(result.errors.join(' '));
  const {size=48,title='Faction logo',decorative=false}=options;
  if(!Number.isInteger(size)||size<12||size>512)throw new TypeError('Faction logo size must be an integer from 12 to 512.');
  if(typeof title!=='string'||title.length>160||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(title)||typeof decorative!=='boolean')throw new TypeError('Invalid faction logo presentation.');
  const logo=result.logo,primary=colors[logo.primaryColor],secondary=colors[logo.secondaryColor],shape=backgrounds[logo.backgroundShape];
  let border='';
  if(logo.border==='single'||logo.border==='double')border='<path d="'+shape+'" fill="none" stroke="'+primary+'" stroke-width="3"/>';
  if(logo.border==='double'||logo.border==='inset')border+='<path d="'+shape+'" transform="translate(8 8) scale(.84)" fill="none" stroke="'+primary+'" stroke-width="2"/>';
  const accessibility=decorative?'aria-hidden="true"':'role="img" aria-label="'+escape(title)+'"';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+size+'" height="'+size+'" viewBox="-4 -4 108 108" '+accessibility+' focusable="false">'+(decorative?'':'<title>'+escape(title)+'</title>')+'<path d="'+shape+'" fill="'+secondary+'"/>'+(patterns[logo.pattern]?'<path d="'+patterns[logo.pattern]+'" fill="'+primary+'" opacity=".14"/>':'')+border+'<path d="'+symbols[logo.primarySymbol]+'" fill="'+primary+'" fill-rule="evenodd"/>'+(accents[logo.secondarySymbol]?'<path d="'+accents[logo.secondarySymbol]+'" fill="'+primary+'"/>':'')+'</svg>';
 }
 const api=Object.freeze({CONFIG,DEFAULT_LOGO,validateLogo,renderLogo,contrastRatio});
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SARFactionIdentity=api;
})(typeof window!=='undefined'?window:globalThis);
