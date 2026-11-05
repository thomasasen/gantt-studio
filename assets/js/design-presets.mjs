// Single source of truth for project palettes, light and dark.
// Chart bars keep legible labels; dark surfaces use subdued contrast.
// All pre-existing palettes remain unchanged for backwards compatibility.
export const DESIGN_COLOR_FIELDS=Object.freeze([
  'primary','accent','workstream','critical','milestone','gate','pageBg','panelBg'
]);

export const DESIGN_PRESETS=Object.freeze([
  {
    id:'odin',label:'Gantt Studio',description:'Klar · Petrol & Blau',
    colors:{primary:'#20374E',accent:'#087E75',workstream:'#2C7B88',critical:'#30465F',
      milestone:'#95732C',gate:'#9C603F',pageBg:'#F3F6F8',panelBg:'#FFFFFF'}
  },
  {
    id:'neutral',label:'Neutral',description:'Reduziert · Schiefergrau',
    colors:{primary:'#334155',accent:'#64748B',workstream:'#64748B',critical:'#1E293B',
      milestone:'#475569',gate:'#78716C',pageBg:'#F1F5F9',panelBg:'#FFFFFF'}
  },
  {
    id:'nordlicht',label:'Nordlicht',description:'Frisch · Fjordblau & Türkis',
    colors:{primary:'#184E67',accent:'#116A70',workstream:'#246D80',critical:'#244E63',
      milestone:'#756626',gate:'#915D41',pageBg:'#F0F7F8',panelBg:'#FFFFFF'}
  },
  {
    id:'sandstein',label:'Sandstein',description:'Warm · Sand & Terrakotta',
    colors:{primary:'#5F4639',accent:'#926035',workstream:'#92624E',critical:'#563D36',
      milestone:'#826323',gate:'#8D4A39',pageBg:'#F8F4EE',panelBg:'#FFFDF9'}
  },
  {
    id:'waldgruen',label:'Waldgrün',description:'Natürlich · Wald & Salbei',
    colors:{primary:'#244735',accent:'#3F6D50',workstream:'#446D61',critical:'#304C3E',
      milestone:'#80712A',gate:'#925B38',pageBg:'#F2F6F0',panelBg:'#FFFFFF'}
  },
  {
    id:'marine',label:'Marine',description:'Prägnant · Navy & Kobaltblau',
    colors:{primary:'#1B315A',accent:'#295DAD',workstream:'#23668C',critical:'#293858',
      milestone:'#806C32',gate:'#915F3C',pageBg:'#F0F4FA',panelBg:'#FFFFFF'}
  },
  {
    id:'mitternacht',label:'Mitternacht',description:'Dunkel · Blaugrau & Eisblau',
    colors:{primary:'#BED0E0',accent:'#90B7C8',workstream:'#3B6A7B',critical:'#71546C',
      milestone:'#76613E',gate:'#805C48',pageBg:'#161F29',panelBg:'#202C39'}
  },
  {
    id:'graphit',label:'Graphit',description:'Dunkel · Anthrazit & Lavendel',
    colors:{primary:'#C9CED8',accent:'#B5A1C8',workstream:'#596C85',critical:'#745D79',
      milestone:'#796A4F',gate:'#765E58',pageBg:'#1C2027',panelBg:'#292E38'}
  },
  {
    id:'waldnacht',label:'Waldnacht',description:'Dunkel · Tannengrün & Salbei',
    colors:{primary:'#B7D5C4',accent:'#91B59E',workstream:'#406A60',critical:'#6F5662',
      milestone:'#796B43',gate:'#79584B',pageBg:'#16231F',panelBg:'#23332D'}
  },
  {
    id:'fjordlicht',label:'Fjordlicht',description:'Hybrid · Dunkler Schiefer & heller Fjord',
    colors:{primary:'#234557',accent:'#22666D',workstream:'#326A7B',critical:'#3B4F66',
      milestone:'#786337',gate:'#865A46',pageBg:'#26343E',panelBg:'#E8EFF0'}
  },
  {
    id:'kupferatelier',label:'Kupferatelier',description:'Hybrid · Graphit & warmes Papier',
    colors:{primary:'#50413E',accent:'#805846',workstream:'#806256',critical:'#63495B',
      milestone:'#78643C',gate:'#825648',pageBg:'#302D2E',panelBg:'#F0E9E0'}
  }
]);

export function findDesignPreset(id) {
  return DESIGN_PRESETS.find(preset=>preset.id===id)||null;
}

export function matchDesignPreset(colors){
  if(!colors)return null;
  return DESIGN_PRESETS.find(preset=>DESIGN_COLOR_FIELDS.every(key=>
    String(colors[key]||'').toUpperCase()===preset.colors[key].toUpperCase()
  ))||null;
}

export function relativeLuminance(hex){
  if(!/^#[\da-fA-F]{6}$/.test(String(hex||'')))return 1;
  const channels=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  const linear=channels.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];
}

// Persisted projects contain colors, not a design preset id. This also supports
// imported/custom dark projects without changing the export schema.
export function isDarkDesignColors(colors){
  return relativeLuminance(colors?.panelBg)<.19;
}

// Deliberate mixed-material composition: subdued dark application chrome, a
// light data canvas. Derive the layout from persisted colors, not preset IDs;
// custom edits and JSON import/export therefore preserve the behavior.
export function isHybridDesignColors(colors){
  return relativeLuminance(colors?.pageBg)<.19 &&
    relativeLuminance(colors?.panelBg)>.62;
}

export function designThemeMode(colors){
  return isHybridDesignColors(colors)?'hybrid':
    isDarkDesignColors(colors)?'dark':'light';
}
