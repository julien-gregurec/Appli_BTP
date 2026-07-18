import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { Lien as Link } from "@/components/Lien";
import { creerSousTraitantAction, changerActivationSousTraitantAction } from "@/app/actions/sous-traitants";
import { DELAIS_PAIEMENT_FOURNISSEUR, libelleDelaiPaiementFournisseur } from "@/lib/echeances-fournisseurs";
import { permissionsUtilisateur } from "@/lib/permissions";

const champ = "rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export default async function SousTraitantsPage({ searchParams }: { searchParams: Promise<{error?:string}> }) {
  const { error } = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const peutGerer = permissions === null || permissions.includes("gerer_sous_traitants");
  const { data: sousTraitants } = await supabase.from("fournisseurs")
    .select("id,reference,nom,specialite,contact_nom,email,telephone,ville,actif")
    .eq("entreprise_id", ctx.entrepriseId).eq("type_tiers", "sous_traitant").order("nom");
  return <main className="p-4 sm:p-8"><div className="mx-auto max-w-5xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">Sous-traitants</h1><p className="text-sm text-neutral-500">Entreprises partenaires, missions, RIB, factures et coûts par chantier.</p></div><Link href="/rentabilite" className="rounded-md border px-3 py-2 text-sm">Voir la rentabilité</Link></header>
    {error&&<p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {peutGerer && <form action={creerSousTraitantAction} className="space-y-3 rounded-md border border-dashed bg-neutral-50 p-4 dark:bg-neutral-900/50">
      <h2 className="font-semibold">Nouveau sous-traitant</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><input name="nom" required placeholder="Raison sociale *" className={champ}/><input name="specialite" placeholder="Spécialité" className={champ}/><input name="contact_nom" placeholder="Contact" className={champ}/><input name="telephone" placeholder="Téléphone" className={champ}/><input name="email" type="email" placeholder="E-mail" className={champ}/><input name="siret" placeholder="SIRET" className={champ}/><select name="delai_paiement_jours" defaultValue="30" className={champ}>{DELAIS_PAIEMENT_FOURNISSEUR.map(delai=><option key={delai} value={delai}>{libelleDelaiPaiementFournisseur(delai)}</option>)}</select></div>
      <button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Créer la fiche</button>
    </form>}
      <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[720px] text-sm"><thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900"><tr><th className="px-3 py-2">Réf.</th><th>Entreprise</th><th>Spécialité</th><th>Contact</th><th>Ville</th><th className="px-3 text-right">Action</th></tr></thead><tbody>{(sousTraitants??[]).map(item=><tr key={item.id} className={`border-t ${item.actif?"":"opacity-50"}`}><td className="px-3 py-3 font-mono text-xs text-neutral-500">{item.reference}</td><td><Link href={`/sous-traitants/${item.id}`} className="font-semibold hover:underline">{item.nom}</Link>{item.email&&<small className="block text-neutral-500">{item.email}</small>}</td><td>{item.specialite??"—"}</td><td>{item.contact_nom??"—"}{item.telephone&&<small className="block text-neutral-500">{item.telephone}</small>}</td><td>{item.ville??"—"}</td><td className="px-3 text-right"><div className="flex justify-end gap-3"><Link href={`/sous-traitants/${item.id}`} className="text-blue-700">{peutGerer?"Gérer":"Consulter"}</Link>{peutGerer&&<form action={changerActivationSousTraitantAction.bind(null,item.id,!item.actif)}><button className="text-neutral-500">{item.actif?"Désactiver":"Réactiver"}</button></form>}</div></td></tr>)}{!sousTraitants?.length&&<tr><td colSpan={6} className="p-8 text-center text-neutral-500">Aucun sous-traitant enregistré.</td></tr>}</tbody></table></div>
  </div></main>;
}
