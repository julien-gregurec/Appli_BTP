import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { StockKioskForm } from "@/components/StockKioskForm";
import { deconnecterCompteDepotAction } from "@/app/actions/auth";
import { prefixeIdentifiantEntreprise } from "@/lib/identifiants";

export default async function BorneStockPage({ searchParams }: { searchParams: Promise<{ error?: string; succes?: string; deconnexion?: string; erreur?: string }> }) {
  const messages = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const [{ data: chantiers }, { data: vehicules }, { data: outils }, { data: codes }, { data: entreprise }, { data: compteDepot }] = await Promise.all([
    supabase.from("chantiers").select("id,nom").eq("entreprise_id", ctx.entrepriseId).in("statut", ["accepte","a_preparer","en_attente_validation","en_commande_materiel","en_cours","en_pause"]).order("nom"),
    supabase.from("vehicules").select("id,immatriculation,marque,modele").eq("entreprise_id",ctx.entrepriseId).in("statut",["actif","maintenance"]).order("immatriculation"),
    supabase.from("outils").select("id,reference,designation").eq("entreprise_id",ctx.entrepriseId).not("statut","in",'(hors_service,perdu)').order("designation"),
    supabase.from("codes_identification").select("type_ressource,ressource_id,code").eq("entreprise_id",ctx.entrepriseId).eq("actif",true).in("type_ressource",["chantier","vehicule","outil"]),
    supabase.from("entreprises").select("nom,mode_identifiant_employe,prefixe_identifiant_employe").eq("id",ctx.entrepriseId).maybeSingle(),
    supabase.rpc("est_compte_depot_courant"),
  ]);
  const codeParRessource=new Map((codes??[]).map((code)=>[`${code.type_ressource}:${code.ressource_id}`,code.code]));
  const optionsChantiers=(chantiers??[]).map((chantier)=>({id:chantier.id,label:chantier.nom,code:codeParRessource.get(`chantier:${chantier.id}`)}));
  const optionsVehicules=(vehicules??[]).map((vehicule)=>({id:vehicule.id,label:`${vehicule.immatriculation} · ${vehicule.marque} ${vehicule.modele}`,code:codeParRessource.get(`vehicule:${vehicule.id}`)}));
  const optionsOutils=(outils??[]).map((outil)=>({id:outil.id,label:`${outil.reference} · ${outil.designation}`,code:codeParRessource.get(`outil:${outil.id}`)}));
  const prefixe=entreprise?.prefixe_identifiant_employe??prefixeIdentifiantEntreprise(entreprise?.nom??"");
  const exemple=entreprise?.mode_identifiant_employe==="prefixe_4_chiffres"?`${prefixe}-0001`:"Référence interne";
  return <main className="min-h-screen bg-neutral-50 p-3 dark:bg-neutral-950 sm:p-8"><div className="mx-auto max-w-5xl space-y-5">
    <div><Link href="/stock" className="text-sm text-neutral-500 hover:underline">← Stock</Link><h1 className="mt-2 text-2xl font-semibold">Borne stock sécurisée</h1><p className="mt-1 text-sm text-neutral-500">Le compte dépôt reste connecté en priorité. Chaque entrée ou sortie exige néanmoins l’identifiant et le mot de passe stock personnels du salarié, puis vérifie les droits de son poste.</p></div>
    {compteDepot===true&&<section className="rounded-lg border border-[#c9a24a]/60 bg-[#c9a24a]/10 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong>Mode dépôt prioritaire</strong><p className="text-xs text-neutral-600 dark:text-neutral-300">Ce compte reste connecté et s’ouvre directement sur la borne. Seule une personne connaissant son mot de passe peut le déconnecter.</p></div></div>
      <form action={deconnecterCompteDepotAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-[#c9a24a]/30 pt-3">
        <label className="text-xs text-neutral-600 dark:text-neutral-300">Mot de passe du compte dépôt
          <input name="mot_de_passe" type="password" required autoComplete="off" className="mt-1 block w-56 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
        </label>
        <button className="rounded-md border border-[#0d1b2a] px-3 py-2 text-xs font-semibold">Déconnecter le compte dépôt</button>
      </form>
      {messages.erreur && <p className="mt-2 text-xs font-medium text-red-700">{messages.erreur}</p>}
    </section>}
    {messages.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{messages.error}</p>}
    {messages.succes && <p className="rounded-lg bg-green-50 p-3 text-sm font-medium text-green-700">✓ {messages.succes}</p>}
    <StockKioskForm chantiers={optionsChantiers} vehicules={optionsVehicules} outils={optionsOutils} identifiantExemple={exemple} />
  </div></main>;
}
