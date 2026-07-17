import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ajouterJustificatifDepenseAction, ajouterReglementDepenseAction, classerFactureFournisseurAction, supprimerReglementDepenseAction } from "@/app/actions/depenses";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { DEPENSE_CATEGORIES, DEPENSE_STATUTS } from "@/lib/depenses";
import { euros } from "@/lib/devis";
import { preparerLotVirementsAction } from "@/app/actions/paiements-bancaires";

const un = <T,>(valeur: T | T[] | null): T | null => Array.isArray(valeur) ? valeur[0] ?? null : valeur;

export default async function DepensePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const { id } = await params;
  const messages = await searchParams;
  const contexte = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(contexte);
  const peutGerer = permissions === null || permissions.includes("gerer_achats");
  const peutPreparerVirement = permissions === null || permissions.includes("preparer_virements");
  const [{ data: depense }, { data: reglements }, { data: chantiers }] = await Promise.all([
    supabase.from("depenses_fournisseurs").select("*,fournisseur:fournisseurs(nom),chantier:chantiers(id,nom),commande:commandes_fournisseurs(id,numero),vehicule:vehicules(id,immatriculation,marque,modele),outil:outils(id,reference,designation),employe:employes(id,prenom,nom)").eq("id", id).eq("entreprise_id", contexte.entrepriseId).maybeSingle(),
    supabase.from("reglements_fournisseurs").select("*").eq("depense_id", id).eq("entreprise_id", contexte.entrepriseId).order("date", { ascending: false }),
    peutGerer
      ? supabase.from("chantiers").select("id,nom,reference_interne").eq("entreprise_id", contexte.entrepriseId).not("statut", "in", "(archive,annule)").order("nom")
      : Promise.resolve({ data: [] }),
  ]);
  if (!depense) notFound();

  const [{ data: ribFournisseur }, { data: connexionBancaire }] = peutPreparerVirement
    ? await Promise.all([
        supabase.from("coordonnees_bancaires").select("id,iban_quatre_derniers,verification_statut").eq("entreprise_id", contexte.entrepriseId).eq("fournisseur_id", depense.fournisseur_id).eq("actif", true).maybeSingle(),
        supabase.from("connexions_bancaires").select("provider,statut,environnement").eq("entreprise_id", contexte.entrepriseId).maybeSingle(),
      ])
    : [{ data: null }, { data: null }];

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
    <main className="p-4 sm:p-8"><div className="mx-auto max-w-4xl space-y-6">
      <div><Link href="/depenses" className="text-sm text-neutral-500 hover:underline">← Dépenses</Link><h1 className="mt-1 text-xl font-semibold">{depense.numero_piece}</h1><p className="text-sm text-neutral-500">{fournisseur?.nom} · {DEPENSE_CATEGORIES[depense.categorie]}</p></div>
      {messages.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{messages.error}</p>}
      {messages.success && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{messages.success}</p>}
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded border p-3">TTC<strong className="block">{euros(depense.montant_ttc)}</strong></div><div className="rounded border p-3">Réglé<strong className="block text-green-700">{euros(depense.montant_regle)}</strong></div><div className="rounded border p-3">Reste<strong className="block text-amber-700">{euros(reste)}</strong></div></div>

      <section className="grid gap-2 rounded border p-4 text-sm dark:border-neutral-800 sm:grid-cols-2">
        <p><b>Statut :</b> <span style={{ color: statut?.couleur }}>{statut?.label}</span></p><p><b>Date :</b> {depense.date_piece} · <b>Échéance :</b> {depense.date_echeance ?? "—"}</p><p><b>HT :</b> {euros(depense.montant_ht)} · <b>TVA ({Number(depense.taux_tva).toLocaleString("fr-FR")} %) :</b> {euros(depense.montant_tva)} · <b>TTC :</b> {euros(depense.montant_ttc)}</p>
        {chantier && <p><b>Chantier :</b> <Link href={`/chantiers/${chantier.id}`} className="hover:underline">{chantier.nom}</Link></p>}
        {commande && <p><b>Commande :</b> <Link href={`/commandes/${commande.id}`} className="hover:underline">{commande.numero}</Link></p>}
        {vehicule && <p><b>Véhicule :</b> <Link href={`/flotte/${vehicule.id}`} className="hover:underline">{vehicule.immatriculation} · {vehicule.marque} {vehicule.modele}</Link></p>}
        {outil && <p><b>Outil :</b> <Link href={`/outillage/${outil.id}`} className="hover:underline">{outil.reference} · {outil.designation}</Link></p>}
        {employe && <p><b>Ouvrier :</b> <Link href={`/employes/${employe.id}`} className="hover:underline">{employe.prenom} {employe.nom}</Link></p>}
      </section>
      {peutGerer && <form action={classerFactureFournisseurAction.bind(null, id)} className="flex flex-col gap-3 rounded border p-4 sm:flex-row sm:items-end dark:border-neutral-800">
        <label className="flex-1 text-sm font-medium">Classer dans un chantier
          <select name="chantier_id" defaultValue={chantier?.id ?? ""} className="mt-1 w-full rounded border px-3 py-2 text-sm dark:bg-neutral-900">
            <option value="">Sans chantier · frais généraux</option>
            {(chantiers ?? []).map((item) => <option key={item.id} value={item.id}>{item.nom}{item.reference_interne ? ` · ${item.reference_interne}` : ""}</option>)}
          </select>
        </label>
        <button className="rounded bg-[#0d1b2a] px-4 py-2 text-sm font-medium text-white">Enregistrer le classement</button>
      </form>}
      {depense.travaux_effectues&&<section className="rounded border p-4"><h2 className="font-semibold">Travaux et pièces détaillés</h2><p className="mt-2 whitespace-pre-wrap text-sm">{depense.travaux_effectues}</p></section>}

      <section className="rounded border p-4 dark:border-neutral-800">
        <div className="flex items-center justify-between"><div><h2 className="font-semibold">Facture numérisée</h2><p className="text-xs text-neutral-500">PDF, photo ou scan · 20 Mo maximum</p></div>{justificatifUrl && <a href={justificatifUrl} target="_blank" rel="noreferrer" className="rounded border px-3 py-2 text-sm font-medium">Ouvrir le justificatif</a>}</div>
        {justificatifUrl && depense.justificatif_mime_type?.startsWith("image/") && <Image src={justificatifUrl} alt={depense.justificatif_nom ?? "Facture fournisseur"} width={760} height={420} unoptimized className="mt-3 max-h-80 w-full rounded bg-neutral-50 object-contain" />}
        {peutGerer && <form action={ajouterJustificatifDepenseAction.bind(null, id)} encType="multipart/form-data" className="mt-3 flex gap-3 border-t pt-3"><input name="justificatif" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" capture="environment" required className="flex-1 rounded border px-3 py-2 text-sm"/><button className="rounded bg-[#0d1b2a] px-4 py-2 text-sm font-medium text-white">{depense.justificatif_storage_path ? "Remplacer" : "Scanner / importer"}</button></form>}
      </section>

      {peutPreparerVirement && reste > 0 && !["annulee", "litige"].includes(depense.statut) && <section className="rounded-xl border-2 border-blue-700 p-4 dark:border-blue-500">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-semibold">Régler cette facture fournisseur</h2><p className="mt-1 text-sm text-neutral-500">Préparez le virement de {euros(reste)} vers {fournisseur?.nom}. Le règlement ne sera comptabilisé qu’après confirmation bancaire.</p></div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${connexionBancaire && ["pret", "actif"].includes(connexionBancaire.statut) ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>{connexionBancaire && ["pret", "actif"].includes(connexionBancaire.statut) ? `Banque prête · ${connexionBancaire.environnement}` : "Prestataire bancaire à activer"}</span>
        </div>
        {ribFournisseur?.verification_statut === "verifie" ? <form action={preparerLotVirementsAction} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <input type="hidden" name="sources" value={`depense:${id}`}/>
          <label className="text-sm font-medium">Date souhaitée du virement<input name="date_execution" type="date" min={new Date().toISOString().slice(0,10)} defaultValue={new Date().toISOString().slice(0,10)} required className="mt-1 w-full rounded border px-3 py-2 text-sm dark:bg-neutral-900"/></label>
          <button className="rounded bg-blue-700 px-5 py-2 text-sm font-semibold text-white">Préparer le virement de {euros(reste)}</button>
          <p className="text-xs text-neutral-500 sm:col-span-2">RIB vérifié · IBAN •••• {ribFournisseur.iban_quatre_derniers}. Après préparation, le lot devra être validé puis authentifié auprès de la banque.</p>
        </form> : <div className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900"><strong>RIB fournisseur requis.</strong> {ribFournisseur ? "Le RIB enregistré doit être vérifié avant tout virement." : "Ajoutez le RIB du fournisseur puis faites-le vérifier."} <Link href="/paiements-bancaires" className="ml-1 font-semibold underline">Ouvrir Banque & paie</Link></div>}
      </section>}

      {peutGerer && reste > 0 && !["annulee", "litige"].includes(depense.statut) && <details className="rounded border p-4 dark:border-neutral-800"><summary className="cursor-pointer font-semibold">Enregistrer un paiement effectué hors Liria</summary><form action={ajouterReglementDepenseAction.bind(null, id)} className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><p className="text-xs text-neutral-500 sm:col-span-2 lg:col-span-4">Uniquement après un prélèvement, paiement par carte, chèque ou virement déjà effectué directement depuis la banque.</p><input name="montant" type="number" min="0.01" max={reste} step="0.01" defaultValue={reste} required className="rounded border px-3 py-2 text-sm dark:bg-neutral-900"/><input name="date" type="date" defaultValue={new Date().toISOString().slice(0,10)} required className="rounded border px-3 py-2 text-sm dark:bg-neutral-900"/><select name="mode" className="rounded border px-3 py-2 text-sm dark:bg-neutral-900"><option value="virement">Virement</option><option value="prelevement">Prélèvement</option><option value="cb">Carte</option><option value="cheque">Chèque</option><option value="especes">Espèces</option></select><input name="reference" placeholder="Référence bancaire" className="rounded border px-3 py-2 text-sm dark:bg-neutral-900"/><button className="rounded bg-neutral-900 px-4 py-2 text-sm text-white dark:bg-white dark:text-neutral-900 sm:col-span-2 lg:col-span-4">Enregistrer ce paiement déjà effectué</button></form></details>}

      <section><h2 className="mb-2 font-semibold">Paiements fournisseur — sorties d’argent</h2><p className="mb-3 rounded-md bg-blue-50 p-3 text-xs text-blue-900">Les virements initiés dans Liria sont préparés, contrôlés, validés puis confirmés par le prestataire bancaire. Les autres moyens de paiement restent enregistrables manuellement après leur exécution.</p>{reglements?.map((reglement) => <div key={reglement.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-2 text-sm"><span>{reglement.date} · {reglement.mode}</span><span className="text-neutral-500">{reglement.reference ?? ""}</span><strong>{euros(reglement.montant)}</strong>{peutGerer && <form action={supprimerReglementDepenseAction.bind(null, id, reglement.id)}><ConfirmSubmitButton message={`Annuler ce règlement de ${euros(reglement.montant)} ? Le solde de la facture fournisseur sera recalculé automatiquement.`} className="text-xs text-red-600 hover:underline">Annuler ce paiement</ConfirmSubmitButton></form>}</div>)}{(!reglements || !reglements.length) && <p className="text-sm text-neutral-500">Aucun paiement fournisseur enregistré.</p>}</section>
    </div></main>
  );
}
