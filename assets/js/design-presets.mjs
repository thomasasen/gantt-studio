// Single source of truth for the built-in, light-background project palettes.
// All new chart colors target at least 4.5:1 contrast with white labels.
// Keep the two original themes unchanged for backwards compatibility.
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
