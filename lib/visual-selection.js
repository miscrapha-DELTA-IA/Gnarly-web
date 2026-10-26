/** Stage 72 CreativeVisualTaxonomy + CreativePresetCatalog selection semantics.
 * Source: NightcoreLab stage-72-client-onboarding-final, 744b998.
 * Themes are colors/material; experiences are motion; reaction is energy gain.
 * GNARLY modes override the live renderer, preserving selected experience.
 */
export const CLASSIC_THEMES = Object.freeze(['ACID','CYBER NIGHT','CRIMSON','ULTRAVIOLET','SOLAR','ORCHID','SAPPHIRE','ATOMIC','LAGOON','VOLT','PRISM','MAGMA','NOIR','ULTRAPINK','ULTRAORANGE','PUREWHITE','ULTRABLACK']);
export const MATERIAL_THEMES = Object.freeze(['XEROX SERPENTINE','PRISM CARMINE','SUBATOMIC BUBBLE','JACQUARD SIGNAL','ISOMETRIC CHASM','LENTICULAR WILD']);
export const GNARLY_MODES = Object.freeze(['GNARLY','GNARLY 2','GNARLY STRATA','GNARLY COMPILER','GNARLY ORGANISM']);
/** Original Swift curated 5-stop color families, now usable with ANY WebGL experience.
 * Source: NightcoreLab/Sources/Creative/VisualMaterial/VisualMaterialCatalog.swift.
 * Do not alter the existing MarbleTheme or CreativeUniverse authored palettes.
 */
export const NATIVE_COLOR_STOPS=Object.freeze({
 'NEON PULSE COLORS':['#040406','#FF0088','#00FF9D','#00E5FF','#F8FAFC'],
 'AGATE ZEBRA COLORS':['#FFFFFF','#050507','#6C7A9C','#F28C28','#FFFFFF'],
 'VOID GLOSS COLORS':['#000000','#00D2E6','#00E5A3','#F4DCE0','#FF1A1A'],
 'TERRAZZO MAGMA COLORS':['#0B0D11','#E87A1E','#D91414','#D8DEC8','#081E4A'],
 'AIRBRUSH MIRAGE COLORS':['#121214','#FF3B30','#8E7CFF','#FFB340','#EBF2D5'],
 'GROOVE EBRU COLORS':['#008B94','#F5A623','#EE4035','#F8B195','#26292C'],
 'CYMATIC RORSCHACH COLORS':['#050714','#6699CC','#F5F9FF','#6699CC','#050714']
});
export const NATIVE_COLOR_THEMES=Object.freeze(Object.keys(NATIVE_COLOR_STOPS));
export const CREATIVE_COLOR_THEMES=Object.freeze([
 'SUBCULTURAL ARCHIVE COLORS','CAUSTIC DISSECTION COLORS','TECTONIC MESH COLORS',
 'VECTOR DRIFT COLORS','LIQUID MONOCHROME COLORS','NOCTURNAL LITHOGRAPH COLORS'
]);
export const EXPERIENCES = Object.freeze([
 {id:'original',name:'Original',kind:1,motion:.42,category:'classic',detail:'Marble original, movimento de fluxo contínuo'},
 {id:'cyber-night',name:'Cyber Night',kind:5,motion:.58,category:'classic',detail:'Cromo, reflexos e luz noturna'},
 {id:'liquid-dream',name:'Liquid Dream',kind:6,motion:.40,category:'classic',detail:'Superfícies de vidro líquido'},
 {id:'neon-pulse',name:'Neon Pulse',kind:7,motion:.73,category:'classic',detail:'Pulsação luminosa em batidas'},
 {id:'chrome-night',name:'Chrome Night',kind:5,motion:.33,category:'classic',detail:'Reflexos metálicos de alto contraste'},
 {id:'organic-pulse',name:'Organic Pulse',kind:8,motion:.60,category:'classic',detail:'Turbulência orgânica guiada pelos graves'},
 {id:'cyber-marble',name:'Cyber Marble',kind:1,motion:.57,category:'classic',detail:'Mármore orgânico em camadas'},
 {id:'atmospheric-smoke',name:'Atmospheric Smoke',kind:9,motion:.29,category:'classic',detail:'Fumaça atmosférica de baixa densidade'},
 {id:'agate-zebra',name:'Agate Zebra',kind:1,motion:.4,category:'classic',detail:'Listras minerais e sulcos em alto-relevo'},
 {id:'void-gloss',name:'Void Gloss',kind:1,motion:.4,category:'classic',detail:'Obsidiana com veios brilhantes'},
 {id:'terrazzo-magma',name:'Terrazzo Magma',kind:1,motion:.4,category:'classic',detail:'Terraço vulcânico com partículas'},
 {id:'airbrush-mirage',name:'Airbrush Mirage',kind:1,motion:.4,category:'classic',detail:'Aerografia difusa, sem cortes bruscos'},
 {id:'groove-ebru',name:'Groove Ebru',kind:1,motion:.4,category:'classic',detail:'Mármore fluido com estrias penteadas'},
 {id:'cymatic-rorschach',name:'Cymatic Rorschach',kind:1,motion:.4,category:'classic',detail:'Interferência bilateral e círculos gravados'},
 {id:'gnarly-texture-organic-web',name:'Organic Web',kind:21,motion:.38,category:'classic',detail:'Teia elástica, filamentos e anéis em espaço negativo'},
 {id:'gnarly-texture-fractured-cells',name:'Fractured Cells',kind:22,motion:.42,category:'classic',detail:'Placas celulares fraturadas, tinta seca e microgrão'},
 {id:'gnarly-texture-plasma-lava',name:'Plasma Lava',kind:23,motion:.56,category:'classic',detail:'Litoral incandescente e poças escuras com borda reativa'},
 {id:'gnarly-texture-topographic-moire',name:'Topographic Moiré',kind:24,motion:.35,category:'classic',detail:'Topografia gravada, isolinhas e interferência fina'},
 {id:'gnarly-exp-subcultural-archive',name:'Subcultural Archive',kind:2,motion:.49,category:'gnarly',detail:'Xerografia, zines e retícula'},
 {id:'gnarly-exp-caustic-dissection',name:'Caustic Dissection',kind:3,motion:.45,category:'gnarly',detail:'Cáusticas e prismas fragmentados'},
 {id:'gnarly-exp-tectonic-mesh',name:'The Tectonic Mesh',kind:10,motion:.52,category:'gnarly',detail:'Malha tectônica em ondas'},
 {id:'gnarly-exp-vector-drift-2000',name:'Vector Drift 2000',kind:11,motion:.62,category:'gnarly',detail:'Linhas vetoriais, deriva cinética'},
 {id:'gnarly-exp-liquid-monochrome',name:'The Liquid Monochrome',kind:6,motion:.44,category:'gnarly',detail:'Líquido monocromático com fricção'},
 {id:'gnarly-exp-nocturnal-lithograph',name:'Nocturnal Lithograph',kind:12,motion:.32,category:'gnarly',detail:'Litografia noturna, gravura em movimento'},
]);
export const REACTIONS=Object.freeze(['DESLIGADO','FLUIDO','REATIVO']);
export const ROLE_EXPLANATION='Tema = paleta. Material = superfície. Experiência = geometria e movimento. Ritmo = reatividade. GNARLY 2 combina e alterna as três camadas mantendo as escolhas manuais.';
export const DEFAULT_EXPERIENCE='original';
export const TEXTURE_FAMILIES=Object.freeze({
 'gnarly-texture-organic-web':1,'gnarly-texture-fractured-cells':2,
 'gnarly-texture-plasma-lava':3,'gnarly-texture-topographic-moire':4
});
const KIND_BY_THEME={'XEROX SERPENTINE':2,'PRISM CARMINE':3,'SUBATOMIC BUBBLE':6,'JACQUARD SIGNAL':12,'ISOMETRIC CHASM':10,'LENTICULAR WILD':4,'GNARLY STRATA':10,'GNARLY COMPILER':11,'GNARLY ORGANISM':8};
export function resolveVisual(theme='ACID',experience=DEFAULT_EXPERIENCE,reaction='FLUIDO'){
 const chosen=EXPERIENCES.find(x=>x.id===experience)||EXPERIENCES[0];
 const isGnarly=GNARLY_MODES.includes(theme);
 const isMaterial=MATERIAL_THEMES.includes(theme);
 const kind=isGnarly?(KIND_BY_THEME[theme]||13):isMaterial?(KIND_BY_THEME[theme]||1):chosen.kind;
 const texture=isGnarly?null:(TEXTURE_FAMILIES[chosen.id]??null);
 const look=isGnarly?(CREATIVE_LOOKS[theme]??null):texture?null:(CREATIVE_LOOKS[chosen.id]??CREATIVE_LOOKS[theme]??null);
 // The primary authored visual is UNCHANGED. A secondary lightweight shader
 // draws the selected experience with constant-alpha blending when the
 // material/special GNARLY visual would otherwise swallow that experience.
 const needsCompose=(isMaterial||(isGnarly&&theme!=='GNARLY'&&theme!=='GNARLY 2'))&&chosen.id!=='original';
 const secondary=needsCompose?{
  experience:chosen.id,look:CREATIVE_LOOKS[chosen.id]??null,texture:TEXTURE_FAMILIES[chosen.id]??null
 }:null;
 return {theme,experience:chosen.id,experienceName:chosen.name,kind,look,texture,secondary,
  reaction:REACTIONS.includes(reaction)?reaction:'FLUIDO',motion:chosen.motion,override:isGnarly,
  description:theme==='GNARLY 2'?'Compositor procedural: paleta, material e experiência evoluem ao longo da música.':needsCompose?'Material preservado + experiência combinada em camada transparente.':isGnarly?'GNARLY original preservado; tema anterior influencia as cores.':'Tema e experiência combinados.'};
}
export function restoredThemeAfterGnarly(previous='ACID'){
 return CLASSIC_THEMES.includes(previous)||MATERIAL_THEMES.includes(previous)||NATIVE_COLOR_THEMES.includes(previous)||CREATIVE_COLOR_THEMES.includes(previous)?previous:'ACID';
}

/** Native creative look IDs from CreativeUniverseCatalog.swift Stage 76. */
export const CREATIVE_LOOKS=Object.freeze({
 'XEROX SERPENTINE':1,'PRISM CARMINE':2,'SUBATOMIC BUBBLE':3,
 'JACQUARD SIGNAL':4,'ISOMETRIC CHASM':5,'LENTICULAR WILD':6,
 'GNARLY STRATA':13,'GNARLY COMPILER':14,'GNARLY ORGANISM':15,
 'gnarly-exp-subcultural-archive':7,'gnarly-exp-caustic-dissection':8,
 'gnarly-exp-tectonic-mesh':9,'gnarly-exp-vector-drift-2000':10,
 'gnarly-exp-liquid-monochrome':11,'gnarly-exp-nocturnal-lithograph':12
});
export const CREATIVE_PALETTES=Object.freeze({
 1:['#0d0d0e','#f2f0e6','#f7ee18'],2:['#38000c','#ff0d38','#79e5f2'],
 3:['#0a2246','#f5b82e','#3895d3'],4:['#0f0814','#b5944b','#521296'],
 5:['#020208','#0a19d6','#ffffff'],6:['#0a0909','#cf9b48','#f4eedf'],
 7:['#151413','#f0efea','#f6eb14'],8:['#38000c','#ff0d38','#e3e8ec'],
 9:['#242428','#a312ff','#b5944b'],10:['#060b0a','#6b9e38','#f3ffe3'],
 11:['#12080c','#dcdcdc','#ff0040'],12:['#08080a','#c8bfa3','#1f6a4e'],
 13:['#141820','#0a19d6','#d1a960'],14:['#030609','#68ecea','#f5b82e'],
 15:['#080608','#ff6ba5','#62c3d0']
});
const texture=(palette,textureA=[0,0,0,0],textureB=[0,0,0,0],textureC=[0,0,0])=>({type:'textured',palette,textureA,textureB,textureC,pulse:.42});
/** The same distinct native material family and normalized controls.
 * Metal's material type IDs: glass=1, chrome=2, organic=3, smoke=4, advanced=5.
 */
export const EXPERIENCE_MATERIALS=Object.freeze({
 'original':{type:'marble',pulse:.40,pulseWarp:.18,pulseGlow:.10},
 'cyber-night':{type:'marble',pulse:.60,pulseWarp:.12,pulseGlow:.12},
 'neon-pulse':texture(['#040406','#ff0088','#00ff9d','#00e5ff','#f8fafc'],[56,.78,0,0],[0,0,0,0],[0,0,0]),
 'liquid-dream':{type:'procedural',shaderKind:1,controls:[.7,.4,.5,.3],pulse:.4},
 'chrome-night':{type:'procedural',shaderKind:2,controls:[.9,.7,.55,.75],pulse:.35},
 'organic-pulse':{type:'procedural',shaderKind:3,controls:[.5,.6,.4,.65],pulse:.60},
 'cyber-marble':{type:'procedural',shaderKind:5,controls:[.6,.6,.65,.5],pulse:.60},
 'atmospheric-smoke':{type:'procedural',shaderKind:4,controls:[.6,.35,.3,.65],pulse:.20},
 'agate-zebra':texture(['#ffffff','#050507','#6c7a9c','#f28c28','#ffffff'],[38,.76,.12,.38]),
 'void-gloss':texture(['#000000','#00d2e6','#00e5a3','#f4dce0','#ff1a1a'],[22,.28,0,0],[0,0,.64,0]),
 'terrazzo-magma':texture(['#0b0d11','#e87a1e','#d91414','#d8dec8','#081e4a'],[10,.18,.78,.58]),
 'airbrush-mirage':texture(['#121214','#ff3b30','#8e7cff','#ffb340','#ebf2d5'],[0,0,0,.12],[96,.84,0,0]),
 'groove-ebru':texture(['#008b94','#f5a623','#ee4035','#f8b195','#26292c'],[38,.35,0,0],[0,0,0,5.2]),
 'cymatic-rorschach':texture(['#050714','#6699cc','#f5f9ff','#6699cc','#050714'],[0,0,0,0],[0,.22,0,0],[1,76,0])
});