import { describe, expect, it } from "vitest";
import { estStockFaible, filtrerInventaire } from "@/lib/recherche-colors";
import type { SeauColors } from "@/lib/colors-types";

const seau = (id:string, teinte:string, pct:number, emplacement:string): SeauColors => ({ id,entreprise_id:"a",emplacement_id:emplacement,marque:"Sto",produit:"StoColor",reference_produit:"REF",teinte_nom:teinte,teinte_reference:null,couleur_hex:"#FFFFFF",ral_approxime:null,ral_distance:null,ral_confirme:false,mode_quantite:"volume",quantite_nominale:10,quantite_restante:pct/10,unite:"l",pourcentage_saisi:null,pourcentage_restant:pct,densite_kg_l:null,etat:"ferme",date_ouverture:null,photo_principale_path:null,notes:null,created_at:"",updated_at:"",archived_at:null,etat_avant_archivage:null });
const base=[seau("1","Blanc cassé",15,"depot"),seau("2","Rouge",80,"camion")];
describe("recherche inventaire",()=>{
  it("cherche sans dépendre des accents",()=>expect(filtrerInventaire(base,{q:"blanc casse"})).toHaveLength(1));
  it("filtre l’emplacement",()=>expect(filtrerInventaire(base,{emplacementId:"camion"})[0]?.id).toBe("2"));
  it("filtre le stock faible",()=>expect(filtrerInventaire(base,{stockFaible:true},20)[0]?.id).toBe("1"));
  it("exclut uniformément les seaux vides et archivés du stock faible",()=>{
    const vide={...seau("3","Vide",0,"depot"),etat:"vide" as const};
    const archive={...seau("4","Archivé",10,"depot"),etat:"archive" as const,archived_at:new Date().toISOString()};
    expect(estStockFaible(vide,20)).toBe(false);
    expect(estStockFaible(archive,20)).toBe(false);
    expect(filtrerInventaire([...base,vide,archive],{stockFaible:true},20).map((item)=>item.id)).toEqual(["1"]);
  });
});
