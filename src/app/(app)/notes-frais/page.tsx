import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { euros } from "@/lib/devis";
import { TYPES_JUSTIFICATIF, statutNoteFrais } from "@/lib/notes-frais";
import { creerNoteFraisAction } from "@/app/actions/notes-frais";
import { permissionsUtilisateur } from "@/lib/permissions";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { ExpenseAmountFields } from "@/components/ExpenseAmountFields";
import { SearchableSelect } from "@/components/SearchableSelect";

const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export default async function NotesFraisPage({ searchParams }: { searchParams: Promise<{ error?: string; statut?: string; categorie?: string }> }) {
  const filtres = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const prototype = isEmailLoginDisabled();
  const permissions = await permissionsUtilisateur(ctx);
  const peutExporter = permissions?.includes("exporter_notes_frais") ?? false;
  const peutAdministrer = permissions?.includes("administrer_archivage_notes_frais") ?? false;
  if (prototype) return <main className="p-8"><div className="mx-auto max-w-4xl space-y-4"><h1 className="text-xl font-semibold">Notes de frais et justificatifs</h1><p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><strong>Module sécurisé fermé en mode prototype.</strong><br />Les justificatifs personnels exigent une identité individuelle. Ils deviendront accessibles après l’activation des comptes sécurisés et de la RLS de production.</p></div></main>;

  const [{ data: employe }, { data: categories }, { data: chantiers }] = await Promise.all([
    supabase.from("employes").select("id,prenom,nom").eq("entreprise_id", ctx.entrepriseId).eq("utilisateur_id", ctx.userId).maybeSingle(),
    supabase.from("categories_notes_frais").select("code,libelle").eq("entreprise_id", ctx.entrepriseId).eq("actif", true).order("ordre"),
    supabase.from("chantiers").select("id,nom").eq("entreprise_id", ctx.entrepriseId).not("statut", "in", "(archive,annule)").order("nom"),
  ]);
  let requete = supabase.from("notes_frais").select("id,reference,date_frais,montant_ttc,devise,categorie,fournisseur,statut,statut_export,verrouille_at,employe:employes(prenom,nom),chantier:chantiers!notes_frais_chantier_entreprise_fkey(nom)")
    .eq("entreprise_id", ctx.entrepriseId).order("date_frais", { ascending: false }).limit(300);
  if (filtres.statut) requete = requete.eq("statut", filtres.statut);
  if (filtres.categorie) requete = requete.eq("categorie", filtres.categorie);
  const { data: notes } = await requete;
  const liste = notes ?? [];
  const un = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;

  return <main className="p-8"><div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-semibold">Notes de frais et justificatifs</h1><p className="text-sm text-neutral-500">Création personnelle, validation, intégrité et transmission comptable.</p></div><div className="flex gap-2">{peutExporter && <Link href="/notes-frais/exports" className="rounded-md border px-3 py-2 text-sm font-medium">Exports comptables</Link>}{peutAdministrer && <Link href="/parametres/notes-frais" className="rounded-md border px-3 py-2 text-sm font-medium">Paramètres d’archivage</Link>}</div></div>
    {filtres.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{filtres.error}</p>}
    {!employe && <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">Votre compte doit être lié à une fiche employé active pour créer une dépense.</p>}

    <section className="rounded-lg border p-4"><h2 className="font-semibold">Nouvelle dépense</h2><p className="mt-1 text-xs text-neutral-500">Le brouillon sera créé d’abord. Vous pourrez ensuite photographier ou importer plusieurs pages.</p>
      <form action={creerNoteFraisAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-neutral-500">Date du justificatif<input name="date_frais" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={`${input} mt-1`} /></label>
        <label className="text-xs text-neutral-500">Fournisseur / commerçant<input name="fournisseur" placeholder="Nom du fournisseur" className={`${input} mt-1`} /></label>
        <label className="text-xs text-neutral-500">Catégorie<select name="categorie" className={`${input} mt-1`}>{(categories ?? []).map((c) => <option key={c.code} value={c.code}>{c.libelle}</option>)}</select></label>
        <label className="text-xs text-neutral-500">Type de justificatif<select name="type_document_principal" className={`${input} mt-1`}>{TYPES_JUSTIFICATIF.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}</select></label>
        <ExpenseAmountFields />
        <label className="text-xs text-neutral-500">Chantier<SearchableSelect name="chantier_id" options={(chantiers ?? []).map((c) => ({ value: c.id, label: c.nom }))} placeholder="Écrire le nom du chantier…" emptyLabel="Frais généraux" className="mt-1" /></label>
        <label className="text-xs text-neutral-500">Moyen de paiement<select name="moyen_paiement" className={`${input} mt-1`}><option value="">Non renseigné</option><option value="carte_entreprise">Carte entreprise</option><option value="carte_personnelle">Carte personnelle</option><option value="especes">Espèces</option><option value="virement">Virement</option><option value="autre">Autre</option></select></label>
        <label className="text-xs text-neutral-500">Devise<select name="devise" className={`${input} mt-1`}><option value="EUR">EUR</option><option value="CHF">CHF</option><option value="GBP">GBP</option><option value="USD">USD</option></select></label>
        <label className="text-xs text-neutral-500 sm:col-span-2 lg:col-span-4">Commentaire<textarea name="commentaire_salarie" rows={2} className={`${input} mt-1`} /></label>
        <button disabled={!employe} className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 sm:col-span-2 lg:col-span-4">Créer le brouillon et ajouter le justificatif</button>
      </form>
    </section>

    <form method="get" className="flex flex-wrap gap-2 rounded-lg border p-3"><select name="statut" defaultValue={filtres.statut ?? ""} className="rounded-md border px-3 py-2 text-sm"><option value="">Tous les statuts</option>{["brouillon","soumis","en_verification","correction_demandee","valide","refuse","exporte_comptabilite","verrouille","archive"].map((s) => <option key={s} value={s}>{statutNoteFrais(s).libelle}</option>)}</select><select name="categorie" defaultValue={filtres.categorie ?? ""} className="rounded-md border px-3 py-2 text-sm"><option value="">Toutes les catégories</option>{(categories ?? []).map((c) => <option key={c.code} value={c.code}>{c.libelle}</option>)}</select><button className="rounded-md border px-3 py-2 text-sm">Filtrer</button></form>

    <div className="grid gap-3 md:hidden">{liste.map((n) => { const st = statutNoteFrais(n.statut); const emp = un(n.employe as {prenom:string;nom:string}|{prenom:string;nom:string}[]|null); const chantier = un(n.chantier as {nom:string}|{nom:string}[]|null); return <Link key={n.id} href={`/notes-frais/${n.id}`} className="rounded-lg border p-4"><div className="flex justify-between gap-3"><strong>{n.reference}</strong><span className="text-xs" style={{color:st.couleur}}>{st.libelle}</span></div><p className="mt-2 text-sm">{n.fournisseur ?? "Sans fournisseur"} · {euros(n.montant_ttc)}</p><p className="mt-1 text-xs text-neutral-500">{n.date_frais} · {emp ? `${emp.prenom} ${emp.nom}` : "—"} · {chantier?.nom ?? "Frais généraux"}</p>{n.verrouille_at && <span className="mt-2 inline-block rounded-full bg-neutral-900 px-2 py-1 text-[10px] text-white">Document verrouillé</span>}</Link>; })}</div>
    <div className="hidden overflow-x-auto rounded-lg border md:block"><table className="w-full text-sm"><thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500"><tr><th className="px-3 py-2">Référence</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Salarié</th><th className="px-3 py-2">Fournisseur</th><th className="px-3 py-2">Chantier</th><th className="px-3 py-2 text-right">TTC</th><th className="px-3 py-2">Statut</th></tr></thead><tbody>{liste.map((n) => { const st = statutNoteFrais(n.statut); const emp = un(n.employe as {prenom:string;nom:string}|{prenom:string;nom:string}[]|null); const chantier = un(n.chantier as {nom:string}|{nom:string}[]|null); return <tr key={n.id} className="border-t"><td className="px-3 py-2"><Link href={`/notes-frais/${n.id}`} className="font-mono font-semibold hover:underline">{n.reference}</Link></td><td className="px-3 py-2">{n.date_frais}</td><td className="px-3 py-2">{emp ? `${emp.prenom} ${emp.nom}` : "—"}</td><td className="px-3 py-2">{n.fournisseur ?? "—"}</td><td className="px-3 py-2">{chantier?.nom ?? "Frais généraux"}</td><td className="px-3 py-2 text-right font-mono">{euros(n.montant_ttc)}</td><td className="px-3 py-2"><span style={{color:st.couleur}}>{st.libelle}</span>{n.verrouille_at && " 🔒"}</td></tr>; })}{!liste.length && <tr><td colSpan={7} className="p-8 text-center text-neutral-500">Aucune dépense accessible.</td></tr>}</tbody></table></div>
  </div></main>;
}
