import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { modifierFournisseurAction } from "@/app/actions/commandes";
import { CoordonneesBancairesForm } from "@/components/CoordonneesBancairesForm";
import { DELAIS_PAIEMENT_FOURNISSEUR, libelleDelaiPaiementFournisseur } from "@/lib/echeances-fournisseurs";

const champ = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export default async function FournisseurDetailPage({ params, searchParams }: { params: Promise<{id:string}>; searchParams: Promise<{error?:string;success?:string}> }) {
  const { id } = await params;
  const messages = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const peutGererRib = !ctx.accesSupportPlateforme && (permissions === null || permissions.includes("gerer_coordonnees_bancaires"));
  const [{ data: fournisseur }, { data: rib }, { data: factures }] = await Promise.all([
    supabase.from("fournisseurs").select("*").eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle(),
    peutGererRib ? supabase.from("coordonnees_bancaires").select("titulaire,iban_quatre_derniers,verification_statut,verification_message").eq("entreprise_id", ctx.entrepriseId).eq("fournisseur_id", id).eq("actif", true).maybeSingle() : Promise.resolve({data:null}),
    supabase.from("depenses_fournisseurs").select("id,numero_piece,date_piece,date_echeance,montant_ttc,montant_regle,statut").eq("entreprise_id", ctx.entrepriseId).eq("fournisseur_id", id).order("date_piece", {ascending:false}).limit(20),
  ]);
  if (!fournisseur) notFound();
  const action = modifierFournisseurAction.bind(null, id);
  const input = (nom:string, label:string, valeur:string|null, type="text") => <label className="text-xs text-neutral-500">{label}<input name={nom} type={type} defaultValue={valeur ?? ""} className={`mt-1 ${champ}`}/></label>;
  return <main className="p-4 sm:p-8"><div className="mx-auto max-w-4xl space-y-6">
    <header><Link href="/fournisseurs" className="text-sm text-neutral-500 hover:underline">← Fournisseurs</Link><h1 className="mt-1 text-2xl font-semibold">{fournisseur.nom}</h1><p className="font-mono text-xs text-neutral-500">{fournisseur.reference}</p></header>
    {messages.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{messages.error}</p>}{messages.success && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{messages.success}</p>}
    <form action={action} className="grid gap-3 rounded-md border p-4 sm:grid-cols-2">
      <h2 className="font-semibold sm:col-span-2">Fiche fournisseur</h2>
      {input("nom","Nom / raison sociale",fournisseur.nom)}{input("contact_nom","Contact",fournisseur.contact_nom)}
      {input("email","Email",fournisseur.email,"email")}{input("telephone","Téléphone",fournisseur.telephone)}
      {input("adresse","Adresse",fournisseur.adresse)}{input("code_postal","Code postal",fournisseur.code_postal)}
      {input("ville","Ville",fournisseur.ville)}{input("siret","SIRET",fournisseur.siret)}
      <label className="text-xs text-neutral-500">Délai de paiement contractuel<select name="delai_paiement_jours" defaultValue={String(fournisseur.delai_paiement_jours ?? 30)} className={`mt-1 ${champ}`}>{DELAIS_PAIEMENT_FOURNISSEUR.map((delai) => <option key={delai} value={delai}>{libelleDelaiPaiementFournisseur(delai)}</option>)}</select></label>
      <label className="text-xs text-neutral-500 sm:col-span-2">Notes<textarea name="notes" rows={3} defaultValue={fournisseur.notes ?? ""} className={`mt-1 ${champ}`}/></label>
      <p className="text-xs text-neutral-500 sm:col-span-2">Ce délai préremplit automatiquement l’échéance de chaque nouvelle facture de ce fournisseur. L’échéance peut ensuite être ajustée selon la facture reçue.</p>
      <button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white sm:col-span-2">Enregistrer la fiche</button>
    </form>
    {peutGererRib && (
      <CoordonneesBancairesForm type="fournisseur" beneficiaireId={id} retour={`/fournisseurs/${id}`} rib={rib}/>
    )}
    <section className="rounded-md border p-4"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Dernières factures</h2><Link href={`/depenses`} className="text-sm text-blue-700">Toutes les factures →</Link></div><div className="mt-3 divide-y">{(factures ?? []).map((facture) => <Link key={facture.id} href={`/depenses/${facture.id}`} className="flex flex-wrap justify-between gap-2 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"><span><strong>{facture.numero_piece}</strong><small className="block text-neutral-500">Pièce du {facture.date_piece} · échéance {facture.date_echeance ?? "non renseignée"}</small></span><span className="text-right">{Number(facture.montant_ttc).toLocaleString("fr-FR",{style:"currency",currency:"EUR"})}<small className="block text-neutral-500">{facture.statut.replaceAll("_"," ")}</small></span></Link>)}{!factures?.length && <p className="py-4 text-sm text-neutral-500">Aucune facture enregistrée.</p>}</div></section>
  </div></main>;
}
