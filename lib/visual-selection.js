/** Stage 72 CreativeVisualTaxonomy + CreativePresetCatalog selection semantics.
 * Source: NightcoreLab stage-72-client-onboarding-final, 744b998.
 * Themes are colors/material; experiences are motion; reaction is energy gain.
 * GNARLY modes override the live renderer, preserving selected experience.
 */
export const CLASSIC_THEMES = Object.freeze(['ACID','CYBER NIGHT','CRIMSON','ULTRAVIOLET','SOLAR','ORCHID','SAPPHIRE','ATOMIC','LAGOON','VOLT','PRISM','MAGMA','NOIR','ULTRAPINK','ULTRAORANGE','PUREWHITE','ULTRABLACK']);
export const MATERIAL_THEMES = Object.freeze(['XEROX SERPENTINE','PRISM CARMINE','SUBATOMIC BUBBLE','JACQUARD SIGNAL','ISOMETRIC CHASM','LENTICULAR WILD']);
export const GNARLY_MODES = Object.freeze(['GNARLY','GNARLY STRATA','GNARLY COMPILER','GNARLY ORGANISM']);
export const EXPERIENCES = Object.freeze([
 {id:'original',name:'Original',kind:1,motion:.42,category:'classic',detail:'Marble original, movimento de fluxo contínuo'},
 {id:'cyber-night',name:'Cyber Night',kind:5,motion:.58,category:'classic',detail:'Cromo, reflexos e luz noturna'},
 {id:'liquid-dream',name:'Liquid Dream',kind:6,motion:.40,category:'classic',detail:'Superfícies de vidro líquido'},
 {id:'neon-pulse',name:'Neon Pulse',kind:7,motion:.73,category:'classic',detail:'Pulsação luminosa em batidas'},
 {id:'chrome-night',name:'Chrome Night',kind:5,motion:.33,category:'classic',detail:'Reflexos metálicos de alto contraste'},
 {id:'organic-pulse',name:'Organic Pulse',kind:8,motion:.60,category:'classic',detail:'Turbulência orgânica guiada pelos graves'},
 {id:'cyber-marble',name:'Cyber Marble',kind:1,motion:.57,category:'classic',detail:'Mármore orgânico em camadas'},
 {id:'atmospheric-smoke',name:'Atmospheric Smoke',kind:9,motion:.29,category:'classic',detail:'Fumaça atmosférica de baixa densidade'},
 {id:'gnarly-exp-subcultural-archive',name:'Subcultural Archive',kind:2,motion:.49,category:'gnarly',detail:'Xerografia, zines e retícula'},
 {id:'gnarly-exp-caustic-dissection',name:'Caustic Dissection',kind:3,motion:.45,category:'gnarly',detail:'Cáusticas e prismas fragmentados'},
 {id:'gnarly-exp-tectonic-mesh',name:'The Tectonic Mesh',kind:10,motion:.52,category:'gnarly',detail:'Malha tectônica em ondas'},
 {id:'gnarly-exp-vector-drift-2000',name:'Vector Drift 2000',kind:11,motion:.62,category:'gnarly',detail:'Linhas vetoriais, deriva cinética'},
 {id:'gnarly-exp-liquid-monochrome',name:'The Liquid Monochrome',kind:6,motion:.44,category:'gnarly',detail:'Líquido monocromático com fricção'},
 {id:'gnarly-exp-nocturnal-lithograph',name:'Nocturnal Lithograph',kind:12,motion:.32,category:'gnarly',detail:'Litografia noturna, gravura em movimento'},
]);
export const REACTIONS=Object.freeze(['DESLIGADO','FLUIDO','REATIVO']);
export const ROLE_EXPLANATION='Tema = identidade e material. Experiência = comportamento visual. Ritmo visual = força da reação ao áudio. Modo GNARLY = universo autônomo que evolui ao longo da música.';
export const DEFAULT_EXPERIENCE='original';
const KIND_BY_THEME={'XEROX SERPENTINE':2,'PRISM CARMINE':3,'SUBATOMIC BUBBLE':6,'JACQUARD SIGNAL':12,'ISOMETRIC CHASM':10,'LENTICULAR WILD':4,'GNARLY STRATA':10,'GNARLY COMPILER':11,'GNARLY ORGANISM':8};
export function resolveVisual(theme='ACID',experience=DEFAULT_EXPERIENCE,reaction='FLUIDO'){
 const chosen=EXPERIENCES.find(x=>x.id===experience)||EXPERIENCES[0];
 const isGnarly=GNARLY_MODES.includes(theme);
 const isMaterial=MATERIAL_THEMES.includes(theme);
 const kind=isGnarly?(KIND_BY_THEME[theme]||13):isMaterial?(KIND_BY_THEME[theme]||1):chosen.kind;
 return {theme,experience:chosen.id,experienceName:chosen.name,kind,reaction:REACTIONS.includes(reaction)?reaction:'FLUIDO',motion:chosen.motion,override:isGnarly,description:isGnarly?'Modo GNARLY ativo; sua experiência fica salva para quando você voltar ao tema.':isMaterial?'Material do tema em primeiro plano; movimento definido pela experiência.':'Tema e experiência combinados.'};
}
export function restoredThemeAfterGnarly(previous='ACID'){
 return CLASSIC_THEMES.includes(previous)||MATERIAL_THEMES.includes(previous)?previous:'ACID';
}
