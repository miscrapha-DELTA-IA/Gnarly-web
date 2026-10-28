/** Versioned, bounded, device-local appearance data. No song or transport state. */
export const APPEARANCE_KEY='gnarly.ipod.appearance.v1';
export const USER_PRESETS_KEY='gnarly.ipod.presets.v1';
export const MAX_USER_PRESETS=16;
export const MATERIALS=Object.freeze([
 ['brushed','Alumínio escovado','Grão usinado · acetinado'],['polished','Alumínio polido','Luz contínua · metal claro'],
 ['chrome','Cromo espelhado','Reflexos definidos · bordas frias'],['anodized','Alumínio anodizado','Cor profunda · microgrão'],
 ['gloss','Plástico ABS','Verniz brilhante · cantos macios'],['soft','Polímero soft-touch','Toque seco · luz difusa'],
 ['acrylic','Acrílico translúcido','Tinta transparente · circuitos à vista'],['frost','Acrílico fosco','Translucidez leitosa · luz suave'],
 ['carbon','Fibra de carbono','Trama diagonal · resina'],['ceramic','Cerâmica','Volume denso · brilho esmaltado'],
 ['rubber','Industrial emborrachado','Microperfuração · proteção'],['pearl','Perolizado','Reflexos quentes e frios'],
 ['holo','Holográfico','Espectro metálico · luz prismática'],['leather','Couro texturizado','Grão irregular · costura fina']
].map(([id,name,detail])=>Object.freeze({id,name,detail})));
const pattern=(id,name,group,palette)=>Object.freeze({id,name,group,palette});
export const PATTERNS=Object.freeze([
 pattern('none','Sem estampa','Essenciais',['#233127','#9caa88','#e6e4c8']),
 ...[
 ['woodland','Woodland',['#24392e','#78815a','#c2b68d']],['desert','Deserto',['#8b7254','#cfb792','#eee0bd']],
 ['digital','Camuflagem digital',['#273c32','#718b60','#b6c698']],['tiger','Tiger stripe',['#101c15','#677447','#b0a169']],
 ['urban','Urbana',['#252b38','#697182','#c5cbd0']],['snow','Neve',['#778f9c','#c8d6d9','#f6f3e9']],
 ['psyche','Camo psicodélica',['#7424d0','#f07eab','#c1fa35']]
 ].map(([id,name,palette])=>pattern(id,name,'Camuflagem',palette)),
 ...[
 ['checker','Checkerboard',['#11141a','#f3f0e6','#fe513d']],['graffiti','Graffiti',['#21152f','#baff26','#ed66af']],
 ['halftone','Halftone',['#14231c','#f9f2dc','#eaf763']],['stickers','Recortes',['#5224a4','#ee673e','#f8e188']],
 ['splatter','Paint splatter',['#12272a','#f4dfc1','#fa573b']],['distressed','Desgastado',['#182821','#c2bd9a','#f4efd8']],
 ['flames','Chamas',['#f4b7c9','#ec647d','#fff2d5']]
 ].map(([id,name,palette])=>pattern(id,name,'Streetwear',palette)),
 ...[
 ['stripes','Listras',['#122f2c','#e8dfb4','#f0a35a']],['waves','Ondas',['#1c425b','#8cbbcd','#d4ede7']],
 ['topo','Topografia',['#183c2e','#7ea979','#d7d4a3']],['dots','Polka dots',['#341d3a','#edccce','#fff0d6']],
 ['polygons','Polígonos',['#153b5b','#6e92c3','#d8ad73']],['optical','Op art',['#111820','#e8e6cf','#adfa35']],
 ['glitch','Glitch',['#3d1a84','#59ecd5','#f18ac8']],['symbols','Monograma G',['#213127','#a0b577','#edeacb']]
 ].map(([id,name,palette])=>pattern(id,name,'Gráficas',palette)),
 ...[
 ['marble','Mármore',['#6b747a','#e8e7da','#b6a88b']],['terrazzo','Terrazzo',['#c57d6b','#7a8f70','#e6d1a0']],
 ['weave','Trama carbono',['#111922','#3f4a56','#87969d']],['wood','Veios de madeira',['#512c24','#ae7750','#e5bc87']],
 ['metal','Grão metálico',['#637d83','#c5d3cd','#f4edda']],['iridescent','Iridescente',['#b9e4e0','#d79cda','#f7d49a']],
 ['mono','Microtextura',['#202b28','#8c9f92','#d7dfd3']]
 ].map(([id,name,palette])=>pattern(id,name,'Atelier',palette))
]);
export const PALETTE=['#eceee9','#1b2024','#b5c1c8','#c6ff32','#165ed8','#bb2742','#7c3bea','#f29bbb','#a6d9d7','#e9d5b0','#fc673c','#667c55'];
export const DEFAULT_APPEARANCE=Object.freeze({
 material:'brushed',frameFinish:'chrome',baseMode:'solid',angle:135,
 pattern:'none',scale:1,rotation:0,density:.7,x:0,y:0,contrast:1,texture:.55,finish:.65,tint:.12,
 colors:Object.freeze({body:'#c3cdcf',secondary:'#6f8291',tertiary:'#d7d8f4',frame:'#c4ced1',bezel:'#171c22',
  wheel:'#263038',center:'#1a2128',labels:'#e9ede5',brand:'#384a4c',metallic:'#e4f2ee',
  primary:'#24392e',secondaryInk:'#78815a',accent:'#c2b68d'})
});
const ids=list=>new Set(list.map(x=>x.id));
const materials=ids(MATERIALS),patterns=ids(PATTERNS);
const clamp=(value,fallback,min,max)=>typeof value==='number'&&Number.isFinite(value)?Math.min(max,Math.max(min,value)):fallback;
export const hex=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():null;
export function normalizeAppearance(raw={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))raw={};
 const out={...DEFAULT_APPEARANCE,colors:{...DEFAULT_APPEARANCE.colors}};
 out.material=materials.has(raw.material)?raw.material:out.material;
 out.pattern=patterns.has(raw.pattern)?raw.pattern:out.pattern;
 for(const [key,allowed] of Object.entries({frameFinish:['chrome','brushed','dark','color'],baseMode:['solid','duo','trio']}))
  if(allowed.includes(raw[key]))out[key]=raw[key];
 for(const [key,min,max] of [['angle',0,360],['scale',.4,2.4],['rotation',0,360],['density',.2,1],['x',-100,100],['y',-100,100],['contrast',.6,1.7],['texture',0,1],['finish',0,1],['tint',0,1]])
  out[key]=clamp(raw[key],out[key],min,max);
 out.seed=Math.round(clamp(raw.seed,72,0,4294967295));
 for(const key of Object.keys(out.colors))out.colors[key]=hex(raw.colors?.[key])||out.colors[key];
 return out;
}
function design(id,name,description,settings){return Object.freeze({id,name,description,config:normalizeAppearance(settings)})}
export const DEVICE_PRESETS=Object.freeze([
 design('silver','Classic Silver','Usinado. Preciso. Essencial.',{}),
 design('obsidian','Obsidian','Cerâmica escura e detalhes em grafite.',{material:'ceramic',colors:{body:'#20252b',frame:'#50585c',wheel:'#1a1e23',center:'#0e1319',brand:'#b7bfc2'}}),
 design('acid','Acid Laboratory','A experiência começa na matéria.',{material:'anodized',colors:{body:'#c5f646',wheel:'#182722',center:'#0e1b16',frame:'#d9e8ae',brand:'#2a3b20'}}),
 design('cyber','Cyber Chrome','Reflexos de uma edição do futuro.',{material:'chrome',colors:{body:'#a8bdce',wheel:'#314052',center:'#151f2c',brand:'#152e4a'},finish:.95}),
 design('woodland','Woodland Tactical','Camuflagem orgânica sobre metal.',{material:'brushed',pattern:'woodland',colors:{body:'#777e54',frame:'#62735d',wheel:'#29372c',center:'#17281f',brand:'#eee6b8'},finish:.3}),
 design('desert','Desert Sand','Tons minerais. Textura de campo.',{material:'rubber',pattern:'desert',colors:{body:'#c6af87',frame:'#9b8e77',wheel:'#554f3c',center:'#383b2e',brand:'#3b422e',primary:'#927a59',secondaryInk:'#cfbd9c',accent:'#f0e2bb'},finish:.2}),
 design('digital','Digital Field','Grade precisa. Verde utilitário.',{material:'soft',pattern:'digital',colors:{body:'#6b7c54',wheel:'#20382b',center:'#14251c',frame:'#8c9b76',brand:'#e5eacb',primary:'#283e31',secondaryInk:'#789163',accent:'#b1c291'}}),
 design('tiger','Tiger Stripe','Listras selvagens, acabamento acetinado.',{material:'anodized',pattern:'tiger',colors:{body:'#a1a065',frame:'#848e65',wheel:'#223028',center:'#112018',brand:'#162b22',primary:'#152c21',secondaryInk:'#637443',accent:'#c9b374'},finish:.3}),
 design('carbon','Midnight Carbon','Fibra realçada por uma moldura cromada.',{material:'carbon',pattern:'weave',colors:{body:'#182129',frame:'#b9c3cc',wheel:'#2a343e',center:'#121b23',brand:'#b1c5cc',primary:'#121a22',secondaryInk:'#404b58',accent:'#809099'},texture:.85}),
 design('candy','Candy Pink','ABS laqueado. Cor sem timidez.',{material:'gloss',colors:{body:'#f18eb8',frame:'#f2b6ce',wheel:'#fbdbde',center:'#bd4c79',labels:'#533045',brand:'#78384e'},finish:.92}),
 design('holo','Holographic Dream','Um espectro sob a luz do estúdio.',{material:'holo',baseMode:'trio',colors:{body:'#aabcf4',secondary:'#dca2db',tertiary:'#a9e6d0',frame:'#cfdbec',wheel:'#39364f',center:'#28253f',brand:'#51406d'}}),
 design('cream','Retro Cream','Nostalgia com um toque de âmbar.',{material:'soft',colors:{body:'#e5d7b9',frame:'#bba787',wheel:'#755e43',center:'#493c30',labels:'#fff0ce',brand:'#766342'},finish:.25}),
 design('ice','Transparent Ice','A beleza está também por dentro.',{material:'acrylic',colors:{body:'#b8e5dc',frame:'#bddbd7',wheel:'#d1eee6',center:'#5e9c96',labels:'#233f40',brand:'#2e6a62'}}),
 design('smoke','Violet Smoke','Acrílico fumê. Reflexos suaves.',{material:'frost',colors:{body:'#9f8cb7',frame:'#7e7197',wheel:'#443b59',center:'#2b2944',brand:'#43384f'}}),
 design('titanium','Industrial Titanium','Metal honesto. Cinza quente.',{material:'brushed',frameFinish:'brushed',colors:{body:'#8e9692',frame:'#727e7c',wheel:'#343d3e',center:'#252f32',brand:'#31403f'},finish:.35,texture:.85}),
 design('racing','Racing Red','Vermelho de competição e cromo.',{material:'polished',pattern:'stripes',scale:1.7,colors:{body:'#ab2439',frame:'#ced3cb',wheel:'#e2e1d5',center:'#5c1425',labels:'#1f2022',brand:'#f8dfd3',primary:'#761325',secondaryInk:'#c53042',accent:'#efc8af'},finish:.85}),
 design('toxic','Neon Toxic','Fumaça transparente. Verde ácido.',{material:'acrylic',colors:{body:'#a9f937',frame:'#789b56',wheel:'#253923',center:'#172916',brand:'#274a22'},tint:.3}),
 design('graffiti','Street Edition','Grafismos na superfície. Atitude no objeto.',{material:'soft',pattern:'graffiti',colors:{body:'#b4ca8d',frame:'#6c7e58',wheel:'#2b3330',center:'#172620',brand:'#1e3029',primary:'#30233f',secondaryInk:'#c4f641',accent:'#ea7aab'},scale:.85}),
 design('checker','Checkerboard Club','Cerâmica e a energia do preto e branco.',{material:'ceramic',pattern:'checker',scale:.8,colors:{body:'#dce1d3',frame:'#929e98',wheel:'#a8d36a',center:'#253a2c',labels:'#193425',brand:'#2e4b2b',primary:'#1e2526',secondaryInk:'#f0efdf',accent:'#a8d36a'}}),
 design('pearl','Pearl & Petal','Chamas rosa sobre uma base perolizada.',{material:'pearl',pattern:'flames',colors:{body:'#f3ece3',frame:'#d7cbc3',wheel:'#edc7ce',center:'#b67e90',labels:'#533445',brand:'#9e627e',primary:'#edbdca',secondaryInk:'#dc8ea9',accent:'#fff2da'},scale:1.2,texture:.25}),
 design('cobalt','Cobalt Alloy','Azul profundo. Alumínio anodizado.',{material:'anodized',colors:{body:'#245bab',frame:'#8eabc7',wheel:'#173153',center:'#10213c',brand:'#c8d9e8'}}),
 design('marble','Mineral Archive','Veios minerais e detalhes em latão.',{material:'ceramic',pattern:'marble',colors:{body:'#d5d6c7',frame:'#c6ae7b',wheel:'#344c46',center:'#203b33',brand:'#4b6655',primary:'#6b8077',secondaryInk:'#c3cebc',accent:'#b6a47b'},scale:1.4})
]);
export function exportAppearance(config){return JSON.stringify({kind:'gnarly-ipod-appearance',version:1,appearance:normalizeAppearance(config)},null,2)}
export function importAppearance(text){
 if(typeof text!=='string'||text.length>32768)throw Error('Use uma configuração JSON de até 32 KB.');
 let data;try{data=JSON.parse(text)}catch{throw Error('O arquivo não contém um JSON válido.')}
 if(data?.kind!=='gnarly-ipod-appearance'||data.version!==1||!data.appearance||typeof data.appearance!=='object'||Array.isArray(data.appearance))throw Error('Configuração de iPod não reconhecida.');
 return normalizeAppearance(data.appearance);
}
const nameOf=value=>String(value||'').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,40);
export function createAppearanceStore(storage){
 const read=(key,max)=>{try{const value=storage?.getItem(key);return value&&value.length<=max?JSON.parse(value):null}catch{return null}};
 const saved=read(APPEARANCE_KEY,16384);
 let config=normalizeAppearance(saved?.appearance),enabled=saved?.version===1&&saved.enabled!==false;
 let users=read(USER_PRESETS_KEY,65536);
 users=Array.isArray(users)?users.slice(0,MAX_USER_PRESETS).filter(x=>typeof x?.id==='string'&&/^u-[a-z0-9-]{1,60}$/.test(x.id)&&nameOf(x.name)).map(x=>({id:x.id,name:nameOf(x.name),config:normalizeAppearance(x.config)})):[];
 let persistenceError=false,sequence=0,dirty=false;
 const listeners=new Set();
 const emit=()=>listeners.forEach(fn=>fn(api.snapshot()));
 const write=(key,value)=>{try{storage?.setItem(key,JSON.stringify(value));persistenceError=!storage;return !persistenceError}catch{persistenceError=true;return false}};
 const persist=()=>{if(dirty&&write(APPEARANCE_KEY,{version:1,enabled,appearance:config}))dirty=false};
 const api={
  snapshot:()=>({config:normalizeAppearance(config),enabled,users:users.map(x=>({...x,config:normalizeAppearance(x.config)})),persistenceError}),
  subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn)},
  update(patch){config=normalizeAppearance({...config,...patch,colors:{...config.colors,...patch?.colors}});enabled=true;dirty=true;emit();return config},
  apply(value){config=normalizeAppearance(value);enabled=true;dirty=true;persist();emit()},
  flush:persist,
  reset(){config=normalizeAppearance();enabled=true;dirty=true;persist();emit()},
  useLegacy(){enabled=false;dirty=true;persist();emit()},
  savePreset(raw){
   const name=nameOf(raw);if(!name)throw Error('Dê um nome ao seu design.');
   if(users.length>=MAX_USER_PRESETS)throw Error('Você pode guardar até 16 designs. Exclua um para continuar.');
   const id='u-'+Date.now().toString(36)+'-'+(++sequence).toString(36);
   users.push({id,name,config:normalizeAppearance(config)});write(USER_PRESETS_KEY,users);emit();return id;
  },
  renamePreset(id,raw){const name=nameOf(raw),item=users.find(x=>x.id===id);if(!name||!item)return false;item.name=name;write(USER_PRESETS_KEY,users);emit();return true},
  deletePreset(id){const next=users.filter(x=>x.id!==id);if(next.length===users.length)return false;users=next;write(USER_PRESETS_KEY,users);emit();return true}
 };
 return Object.freeze(api);
}
