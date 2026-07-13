import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ajouterJustificatifDepenseAction, ajouterReglementDepenseAction, supprimerReglementDepenseAction } from "@/app/actions/depenses";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { DEPENSE_CATEGORIES, DEPENSE_STATUTS } from "@/lib/depenses";
import { euros } from "@/lib/devis";

const un = <T,>(valeur: T | T[] | null): T | null => Array.isArray(valeur) ? valeur[0] ?? null : valeur;

export default async function DepensePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const { id } = await params;
  const messages = await searchParams;
  const contexte = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(contexte);
  const peutGerer = permissions === null || permissions.includes("gerer_achats");
  const [{ data: depense }, { data: reglements }] = await Promise.all([
    supabase.from("depenses_fournisseurs").select("*,fournisseur:fournisseurs(nom),chantier:chantiers(id,nom),commande:commandes_fournisseurs(id,numero),vehicule:vehicules(id,immatriculation,marque,modele),outil:outils(id,reference,designation),employe:employes(id,prenom,nom)").eq("id", id).eq("entreprise_id", contexte.entrepriseId).maybeSingle(),
    supabase.from("reglements_fournisseurs").select("*").eq("depense_id", id).eq("entreprise_id", contexte.entrepriseId).order("date", { ascending: false }),
  ]);
  if (!depense) notFound();

  const fournisseur = un(depense.fournisseur as { nom: string } | { nom: string }[] | null);
  const chantier = un(depense.chantier as { id: string; nom: string } | { id: string; nom: string }[] | null);
  const commande = un(depense.commande as { id: string; numero: string } | { id: string; numero: string }[] | null);
  const vehicule = un(depense.vehicule as { id: string; immatriculation: string; marque: string; modele: string } | { id: string; immatriculation: string; marque: string; modele: string }[] | null);
  const outil = un(depense.outil as { id: string; reference: string; designation: string } | { id: string; reference: string; designation: string }[] | null);
  const employe = un(depense.employe as { id: string; prenom: string; nom: string } | { id: string; prenom: string; nom: string }[] | null);
  const statut = DEPENSE_STATUTS[depense.statut];
  const reste = Math.max(0, Number(depense.montant_ttc) - Number(depense.montant_regle));
  let justificatifUrl: string | null = null;
  if (depense.justificatif_storage_path) {
    const { data } = await supabase.storage.from("factures-fournisseurs").createSignedUrl(depense.justificatif_storage_path, 900);
    justificatifUrl = data?.signedUrl ?? null;
  }

  return (
    <main className="p-8"><div className="mx-auto max-w-4xl space-y-6">
      <div><Link href="/depenses" className="text-sm text-neutral-500 hover:underline">← Dépenses</Link><h1 className="mt-1 text-xl font-semibold">{depense.numero_piece}</h1><p className="text-sm text-neutral-500">{fournisseur?.nom} · {DEPENSE_CATEGORIES[depense.categorie]}</p></div>
      {messages.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{messages.error}</p>}
      {messages.success && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{messages.success}</p>}
      <div className="grid grid-cols-3 gap-3"><div className="rounded border p-3">TTC<strong className="block">{euros(depense.montant_ttc)}</strong></div><div className="rounded border p-3">Réglé<strong className="block text-green-700">{euros(depense.montant_regle)}</strong></div><div className="rounded border p-3">Reste<strong className="block text-amber-700">{euros(reste)}</strong></div></div>

      <section className="grid grid-cols-2 gap-2 rounded border p-4 text-sm dark:border-neutral-800">
        <p><b>Statut :</b> <span style={{ color: statut?.couleur }}>{statut?.label}</span></p><p><b>Date :</b> {depense.date_piece} · <b>Échéance :</b> {depense.date_echeance ?? "—"}</p><p><b>HT :</b> {euros(depense.montant_ht)} · <b>TVA :</b> {euros(depense.montant_tva)}</p>
        {chantier && <p><b>Chantier :</b> <Link href={`/chantiers/${chantier.id}`} className="hover:underline">{chantier.nom}</Link></p>}
        {commande && <p><b>Commande :</b> <Link href={`/commandes/${commande.id}`} className="hover:underline">{commande.numero}</Link></p>}
        {vehicule && <p><b>Véhicule :</b> <Link href={`/flotte/${vehicule.id}`} className="hover:underline">{vehicule.immatriculation} · {vehicule.marque} {vehicule.modele}</Link></p>}
        {outil && <p><b>Outil :</b> <Link href={`/outillage/${outil.id}`} className="hover:underline">{outil.reference} · {outil.designation}</Link></p>}
        {employe && <p><b>Ouvrier :</b> <Link href={`/employes/${employe.id}`} className="hover:underline">{employe.prenom} {employe.nom}</Link></p>}
      </section>

      <section className="rounded border p-4 dark:border-neutral-800">
        <div className="flex items-center justify-between"><div><h2 className="font-semibold">Facture numérisée</h2><p className="text-xs text-neutral-500">PDF, photo ou scan · 20 Mo maximum</p></div>{justificatifUrl && <a href={justificatifUrl} target="_blank" rel="noreferrer" className="rounded border px-3 py-2 text-sm font-medium">Ouvrir le justificatif</a>}</div>
        {justificatifUrl && depense.justificatif_mime_type?.startsWith("image/") && <Image src={justificatifUrl} alt={depense.justificatif_nom ?? "Facture fournisseur"} width={760} height={420} unoptimized className="mt-3 max-h-80 w-full rounded bg-neutral-50 object-contain" />}
        {peutGerer && <form action={ajouterJustificatifDepenseAction.bind(null, id)} encType="multipart/form-data" className="mt-3 flex gap-3 border-t pt-3"><input name="justificatif" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" capture="environment" required className="flex-1 rounded border px-3 py-2 text-sm"/><button className="rounded bg-[#0d1b2a] px-4 py-2 text-sm font-medium text-white">{depense.justificatif_storage_path ? "Remplacer" : "Scanner / importer"}</button></form>}
      </section>

      {peutGerer && reste > 0 && !["annulee", "litige"].includes(depense.statut) && <form action={ajouterReglementDepenseAction.bind(null, id)} className="grid grid-cols-4 gap-2 rounded border p-4 dark:border-neutral-800"><input name="montant" type="number" min="0.01" max={reste} step="0.01" defaultValue={reste} required className="rounded border px-3 py-2 text-sm dark:bg-neutral-900"/><input name="date" type="date" defaultValue={new Date().toISOString().slice(0,10)} required className="rounded border px-3 py-2 text-sm dark:bg-neutral-900"/><select name="mode" className="rounded border px-3 py-2 text-sm dark:bg-neutral-900"><option value="virement">Virement</option><option value="prelevement">Prélèvement</option><option value="cb">Carte</option><option value="cheque">Chèque</option><option value="especes">Espèces</option></select><input name="reference" placeholder="Référence" className="rounded border px-3 py-2 text-sm dark:bg-neutral-900"/><button className="col-span-4 rounded bg-neutral-900 px-4 py-2 text-sm text-white dark:bg-white dark:text-neutral-900">Enregistrer le règlement</button></form>}

      <section><h2 className="mb-2 font-semibold">Règlements</h2>{reglements?.map((reglement) => <div key={reglement.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-2 text-sm"><span>{reglement.date} · {reglement.mode}</span><span className="text-neutral-500">{reglement.reference ?? ""}</span><strong>{euros(reglement.montant)}</strong>{peutGerer && <form action={supprimerReglementDepenseAction.bind(null, id, reglement.id)}><ConfirmSubmitButton message={`Annuler ce règlement de ${euros(reglement.montant)} ? Le solde de la facture fournisseur sera recalculé automatiquement.`} className="text-xs text-red-600 hover:underline">Annuler ce paiement</ConfirmSubmitButton></form>}</div>)}{(!reglements || !reglements.length) && <p className="text-sm text-neutral-500">Aucun règlement.</p>}</section>
    </div></main>
  );
}
