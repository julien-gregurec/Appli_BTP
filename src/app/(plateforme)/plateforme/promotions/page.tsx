import Link from "next/link";
import { notFound } from "next/navigation";
import { activerPromotionAction, desactiverPromotionAction } from "@/app/actions/promotions";
import { PromotionCommercialeForm } from "@/components/PromotionCommercialeForm";
import { aPermissionPlateforme } from "@/lib/plateforme";
import { createClient } from "@/lib/supabase/server";

type Promotion = {
  id:string;nom_interne:string;type_remise:"pourcentage"|"montant";valeur:number;duree:"once"|"repeating"|"forever";duree_mois:number|null;
  date_debut:string;date_fin:string|null;offres:string[];entreprise_id:string|null;entreprise_nom:string|null;justification:string;statut:string;
  est_pilote:boolean;perimetre_remise:string;code_promotionnel:string|null;limite_utilisations:number|null;cree_par_email:string|null;created_at:string;updated_at:string;
};

const badge:Record<string,string>={brouillon:"bg-neutral-100 text-neutral-700",actif:"bg-green-100 text-green-800",expire:"bg-amber-100 text-amber-800",desactive:"bg-red-100 text-red-800"};

export default async function PromotionsPage({searchParams}:{searchParams:Promise<{error?:string;succes?:string}>}){
  const peutGerer=await aPermissionPlateforme("gerer_remises");
  const peutConsulter=peutGerer||await aPermissionPlateforme("consulter_facturation");
  if(!peutConsulter)notFound();
  const messages=await searchParams;
  const supabase=await createClient();
  const[{data:promotions,error:promotionsErreur},{data:entreprises}]=await Promise.all([
    supabase.rpc("plateforme_promotions_lister"),
    supabase.rpc("plateforme_entreprises"),
  ]);
  const liste=(promotions??[]) as Promotion[];
  const societes=((entreprises??[]) as Array<{id:string;nom:string}>).map(({id,nom})=>({id,nom}));
  return <main className="p-4 sm:p-8"><div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-neutral-500">Plateforme · Stripe Test uniquement</p><h1 className="text-2xl font-bold">Promotions commerciales</h1><p className="mt-1 max-w-3xl text-sm text-neutral-500">Conditions séparées de la grille publique. Une promotion utilisée n’est jamais supprimée : elle reste traçable et peut être désactivée.</p></div><Link href="/plateforme" className="rounded-lg border px-4 py-2">Retour plateforme</Link></header>
    {messages.error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{messages.error}</p>:null}{messages.succes?<p className="rounded-lg bg-green-50 p-3 text-green-700">{messages.succes}</p>:null}{promotionsErreur?<p className="rounded-lg bg-red-50 p-3 text-red-700">{promotionsErreur.message}</p>:null}
    {peutGerer?<section className="rounded-2xl border p-5"><h2 className="mb-4 text-lg font-bold">Nouvelle condition commerciale</h2><PromotionCommercialeForm entreprises={societes}/></section>:<p className="rounded-xl border bg-neutral-50 p-4 text-sm">Consultation seule : seul le rôle total peut créer, modifier, activer ou désactiver une remise.</p>}
    <section className="space-y-3"><h2 className="text-lg font-bold">Registre et historique</h2>{liste.map((promotion)=><article key={promotion.id} className="rounded-2xl border p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{promotion.nom_interne}</h3><span className={`rounded-full px-2 py-0.5 text-xs ${badge[promotion.statut]??badge.brouillon}`}>{promotion.statut}</span>{promotion.est_pilote?<span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">Pilote</span>:null}</div><p className="mt-1 text-sm">{promotion.type_remise==="pourcentage"?`${promotion.valeur} %`:`${promotion.valeur} € HT`} · {promotion.duree==="once"?"ponctuelle":promotion.duree==="forever"?"permanente":`${promotion.duree_mois} mois`} · offres {promotion.offres.join(", ")}</p><p className="mt-1 text-xs text-neutral-500">{promotion.entreprise_nom??"Code sans entreprise imposée"} · {promotion.date_debut}{promotion.date_fin?` → ${promotion.date_fin}`:""} · créé par {promotion.cree_par_email??"compte supprimé"}</p><p className="mt-2 text-sm text-neutral-600">{promotion.justification}</p>{promotion.code_promotionnel?<p className="mt-2 font-mono text-sm">Code : {promotion.code_promotionnel}{promotion.limite_utilisations?` · ${promotion.limite_utilisations} utilisation(s) max`:""}</p>:null}</div>{peutGerer?<div className="flex gap-2">{promotion.statut==="brouillon"?<form action={activerPromotionAction.bind(null,promotion.id)}><button className="rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white">Activer Test</button></form>:null}{promotion.statut==="actif"?<form action={desactiverPromotionAction.bind(null,promotion.id)}><button className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700">Désactiver</button></form>:null}</div>:null}</div>
      {peutGerer&&promotion.statut==="brouillon"?<details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Modifier le brouillon</summary><div className="mt-4"><PromotionCommercialeForm entreprises={societes} libelleBouton="Enregistrer les modifications" initial={promotion}/></div></details>:null}
    </article>)}{!liste.length?<p className="rounded-xl border p-5 text-sm text-neutral-500">Aucune promotion enregistrée.</p>:null}</section>
    <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Limites volontaires :</strong> Sur mesure reste sur devis. Aucun Price spécifique n’est créé. PROMO‑V1 applique une seule remise active par entreprise et ne cumule pas plusieurs conditions ambiguës.</aside>
  </div></main>;
}
