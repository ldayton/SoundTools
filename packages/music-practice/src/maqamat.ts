// Fretted reference forms, checked against MaqamWorld's maqam/jins diagrams.
// These pitch collections do not encode sayr, modulation, or regional intonation.
export const MAQAMAT = {
  hijaz: {name:'Hijaz', intervals:[0,1,4,5,7,8,10], form:'Hijaz + Nahawand on degree 4. Rast is another upper-jins option.'},
  kurd: {name:'Kurd', intervals:[0,1,3,5,7,8,10], form:'Kurd + Nahawand on degree 4.'},
  nahawand: {name:'Nahawand', intervals:[0,2,3,5,7,8,11], form:'Nahawand + Hijaz on degree 5. The Kurd upper-jins variant lowers degree 7.'},
  ajam: {name:'Ajam', intervals:[0,2,4,5,7,9,11], form:'Ajam + Upper Ajam on degree 5.'},
  nikriz: {name:'Nikriz', intervals:[0,2,3,6,7,9,10], form:'Nikriz + Nahawand on degree 5.'},
  hijazkar: {name:'Hijazkar', intervals:[0,1,4,5,7,8,11], form:'Hijaz + Nikriz on degree 4.'},
} as const;
export type MaqamQuality = keyof typeof MAQAMAT;
export const MAQAM_QUALITIES = Object.keys(MAQAMAT) as MaqamQuality[];
export function isMaqam(value: string): value is MaqamQuality { return Object.hasOwn(MAQAMAT,value); }
export const maqamSource = (quality: MaqamQuality) => `https://www.maqamworld.com/en/maqam/${quality}.php`;
