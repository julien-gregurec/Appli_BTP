export type ReferenceRal = { code: string; nom?: string; hex: `#${string}` };
export type CorrespondanceRal = ReferenceRal & { distance: number; approximative: true };

function rgb(hex:string) { const h=hex.replace("#",""); if(!/^[0-9a-f]{6}$/i.test(h)) throw new Error("Couleur HEX invalide"); return [0,2,4].map((i)=>parseInt(h.slice(i,i+2),16)/255); }
function lab(hex:string) {
  const [r,g,b]=rgb(hex).map((v)=>v>0.04045?Math.pow((v+0.055)/1.055,2.4):v/12.92);
  const x=(r*0.4124+g*0.3576+b*0.1805)/0.95047,y=(r*0.2126+g*0.7152+b*0.0722),z=(r*0.0193+g*0.1192+b*0.9505)/1.08883;
  const f=(v:number)=>v>0.008856?Math.cbrt(v):(7.787*v)+(16/116); return [(116*f(y))-16,500*(f(x)-f(y)),200*(f(y)-f(z))];
}
export function distanceLab(hexA:string,hexB:string){const a=lab(hexA),b=lab(hexB);return Math.sqrt(a.reduce((s,v,i)=>s+(v-b[i])**2,0));}
export function ralLePlusProche(hex:string,palette:ReferenceRal[]):CorrespondanceRal|null{
  if(!palette.length)return null;
  const resultat=palette.map((r)=>({...r,distance:Math.round(distanceLab(hex,r.hex)*100)/100,approximative:true as const})).sort((a,b)=>a.distance-b.distance)[0];
  return resultat;
}
