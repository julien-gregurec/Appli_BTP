import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { Lien as Link } from "@/components/Lien";
import { nomClient } from "@/lib/chantier-statuts";
import { appliquerCorrespondancesAction, creerDevisDepuisImportAction, enregistrerCorrespondanceAction } from "@/app/actions/imports-tools";
import {
  ecartTexte, ETAT_PROJET_LIBELLES, IMPORTS_TOOLS_CHEMIN, importToolsHref, montantImport, resumeComparaison, sourceImport, statutImport,
  STATUT_COMPARAISON_LIBELLES, type ComparaisonImports, type ImportTools,
} from "@/lib/imports-tools";

/**
 * Détail d'un import Tools (Lot 11) : snapshot immuable, lignes, correspondances ouvrage Tools → prestation GP,
 * comparaison avec une autre version, création EXPLICITE d'un devis brouillon. Rien ici ne modifie un devis existant.
 */
const LIGNES_AFFICHEES = 300;
const champ = "mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const carte = "rounded-xl border border-neutral-200 p-4 dark:border-neutral-800";

type Ligne = {
  id: string; ordre: number; designation: string; lot: string; etat_projet: string; nature: string; unite: string; quantite: number | null;
  prix_unitaire_estimatif: number | null; montant_estimatif: number | null; corrige: boolean; emplacement: string; correspondance: string; prestation_id: string | null;
};
type OuvrageSnapshot = { ref: string; cle: string; code: string | null; nom: string; unite: string; lot: string };
type Detail = ImportTools & {
  dossier: { releve?: { dateReleve?: string | null }; chantier?: { adresse?: string | null; ville?: string | null }; transmission?: { le?: string } };
  verification: { empreinte?: string; totalServeur?: string; lignes?: number };
  photos: { ref: string; legende: string | null; storagePath: string }[] | null;
  annotations: { ref: string; texte: string }[] | null;
  anomalies: { code: string; message: string; gravite: string }[] | null;
  revetements: unknown[] | null;
  etats: Record<string, string> | null;
  ouvrages: OuvrageSnapshot[] | null;
};

export default async function ImportToolsDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string; comparer?: string }>;
}) {
  const { id } = await params;
  const { error, success, comparer } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const peutGerer = permissions === null || permissions.includes("gerer_devis");

  const { data: brut } = await supabase.from("gp_tools_imports")
    .select("*, photos:snapshot->photos, annotations:snapshot->annotations, anomalies:snapshot->anomalies, revetements:snapshot->revetements, etats:snapshot->etatsProjetes, ouvrages:snapshot->quantitatif->ouvrages")
    .eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  if (!brut) notFound();
  const imp = { ...(brut as Record<string, unknown>), snapshot: undefined } as unknown as Detail;

  const [{ data: lignes, count }, { data: journal }, { data: autres }, { data: prestations }, { data: correspondances }, { data: clients }, { data: chantiers }, comparaison, suivante] = await Promise.all([
    supabase.from("gp_tools_imports_lignes").select("id,ordre,designation,lot,etat_projet,nature,unite,quantite,prix_unitaire_estimatif,montant_estimatif,corrige,emplacement,correspondance,prestation_id", { count: "exact" })
      .eq("import_id", id).order("ordre").limit(LIGNES_AFFICHEES),
    supabase.from("gp_tools_imports_journal").select("id,action,source_version,created_at,details,auteur:utilisateurs(prenom,nom)").eq("import_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("gp_tools_imports").select("id,source_version,devis_id,created_at").eq("entreprise_id", ctx.entrepriseId)
      .eq("source_releve_id", imp.source_releve_id).eq("source_etat", imp.source_etat).neq("id", id).order("source_version", { ascending: false }),
    supabase.from("prestations_catalogue").select("id,designation,unite,prix_unitaire_ht").eq("entreprise_id", ctx.entrepriseId).eq("actif", true).order("designation").limit(1000),
    supabase.from("gp_tools_correspondances_ouvrages").select("tools_cle,prestation_id").eq("entreprise_id", ctx.entrepriseId),
    imp.client_id ? Promise.resolve({ data: [] }) : supabase.from("clients").select("id,nom,prenom,societe,raison_sociale").eq("entreprise_id", ctx.entrepriseId).order("nom").limit(500),
    supabase.from("chantiers").select("id,nom").eq("entreprise_id", ctx.entrepriseId).not("statut", "in", "(archive,annule)").order("nom").limit(500),
    comparer && /^[0-9a-f-]{36}$/i.test(comparer)
      ? supabase.rpc("gp_tools_import_comparer", { p_import_id: comparer, p_autre_id: id }).then((r) => (r.error ? null : (r.data as ComparaisonImports)))
      : Promise.resolve(null),
    imp.nouvelle_version_id
      ? supabase.from("gp_tools_imports").select("id,source_version,montant_estimatif_ht").eq("id", imp.nouvelle_version_id).maybeSingle().then((r) => r.data)
      : Promise.resolve(null),
  ]);
  const statut = statutImport(imp);
  const corr = new Map((correspondances ?? []).map((c) => [c.tools_cle, c.prestation_id as string | null]));
  const ouvrages = [...new Map((imp.ouvrages ?? []).map((o) => [o.cle, o])).values()];
  const lignesListe = (lignes ?? []) as Ligne[];
  const precedent = (autres ?? []).find((a) => a.source_version < imp.source_version);

  return <main className="p-4 sm:p-8"><div className="mx-auto max-w-6xl space-y-6" data-testid="import-tools-detail" data-version={imp.source_version}>
    <header className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500"><Link href="/devis" className="hover:underline">Devis</Link> › <Link href={IMPORTS_TOOLS_CHEMIN} className="hover:underline">Imports Tools / Relevé</Link></p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{imp.releve_nom}{imp.releve_reference ? ` · ${imp.releve_reference}` : ""}</h1>
        <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold dark:bg-neutral-800" data-testid="import-statut">{statut.libelle}</span>
      </div>
      <p className="text-sm text-neutral-500" data-testid="import-source">{sourceImport(imp)} · reçu le {new Date(imp.created_at).toLocaleString("fr-FR")}</p>
    </header>
    {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700" role="alert" data-testid="import-erreur">{error}</p>}
    {success && <p className="rounded bg-green-50 p-3 text-sm text-green-700" role="status" data-testid="import-succes">{success}</p>}

    {suivante && <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" data-testid="import-nouvelle-version">
      <strong>Nouvelle version disponible : v{suivante.source_version}</strong> ({montantImport(suivante.montant_estimatif_ht)} HT estimatifs).
      {imp.devis_id ? " Le devis créé depuis cette version n'a pas été modifié." : ""}{" "}
      <Link href={importToolsHref(suivante.id, id)} className="font-semibold underline" data-testid="import-comparer-suivante">Comparer et ouvrir la version {suivante.source_version}</Link>
    </section>}

    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        ["Chantier", imp.chantier_nom, "import-chantier"], ["Client", imp.client_nom ?? "— (à choisir pour le devis)", "import-client"],
        ["Version", `v${imp.source_version} · contrat ${imp.contract_version}`, "import-version"], ["Ouvrages", String(imp.nb_ouvrages), "import-ouvrages"],
        ["Lignes", `${imp.nb_lignes} · ${imp.nb_lignes_liees} liée(s) · ${imp.nb_lignes_sans_prix} sans prix`, "import-lignes"],
        ["Montant estimatif Tools", `${montantImport(imp.montant_estimatif_ht)} HT`, "import-montant"],
        ["Main d'œuvre estimée", `${Number(imp.heures_estimees).toLocaleString("fr-FR")} h`, "import-heures"],
        ["Pièces jointes", `${imp.photos?.length ?? 0} photo(s) · ${imp.annotations?.length ?? 0} annotation(s) · ${imp.revetements?.length ?? 0} revêtement(s)`, "import-pj"],
      ].map(([t, v, tid]) => <div key={tid} className={carte}><dt className="text-xs text-neutral-500">{t}</dt><dd className="mt-1 font-semibold" data-testid={tid}>{v}</dd></div>)}
    </dl>
    {imp.etats && <p className="text-xs text-neutral-500" data-testid="import-etats">Dépose {montantImport(imp.etats.depose)} · Neuf {montantImport(imp.etats.neuf)} · Déplacement {montantImport(imp.etats.deplacement)} · Existant {montantImport(imp.etats.existant)} (HT, estimatifs Tools)</p>}

    <section className={carte} data-testid="import-devis">
      <h2 className="font-semibold">Chiffrage dans Gestion Pro</h2>
      {imp.devis_id ? <p className="mt-2 text-sm">Devis brouillon créé le {imp.devis_cree_le ? new Date(imp.devis_cree_le).toLocaleString("fr-FR") : "—"} :{" "}
        <Link href={`/devis/${imp.devis_id}`} className="font-semibold underline" data-testid="import-lien-devis">ouvrir le devis</Link>. Les réimports de Tools ne le modifient jamais.</p>
        : imp.nouvelle_version_id ? <p className="mt-2 text-sm text-neutral-600">Une version plus récente existe : créez le devis depuis la dernière version.</p>
        : peutGerer ? <form action={creerDevisDepuisImportAction} className="mt-3 grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="import_id" value={imp.id} />
          {!imp.client_id && <label className="text-xs">Client Gestion Pro<select name="client_id" required className={champ} data-testid="import-devis-client"><option value="">Choisir…</option>
            {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{nomClient(c)}</option>)}</select></label>}
          {!imp.chantier_id && <label className="text-xs">Chantier (facultatif)<select name="chantier_id" className={champ}><option value="">Sans chantier</option>
            {(chantiers ?? []).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></label>}
          <p className="text-xs text-neutral-500 sm:col-span-3">Une ligne de devis par ouvrage et par état. Ligne liée : prestation, prix de vente et TVA du catalogue. Ligne non liée : désignation et base estimative HT Tools, à chiffrer. Le devis est un brouillon sans numéro.</p>
          <button className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-neutral-900 sm:col-span-1" data-testid="import-creer-devis">Créer un devis brouillon</button>
        </form> : <p className="mt-2 text-sm text-neutral-600">Création de devis réservée aux comptes autorisés à gérer les devis.</p>}
    </section>

    {comparaison && <section className={carte} data-testid="import-comparaison">
      <h2 className="font-semibold">Comparaison v{comparaison.a.version} → v{comparaison.b.version}</h2>
      <p className="mt-1 text-sm" data-testid="import-comparaison-resume">{resumeComparaison(comparaison)}</p>
      {comparaison.parLot.length > 0 && <ul className="mt-2 flex flex-wrap gap-2 text-xs">{comparaison.parLot.map((l) => <li key={l.lot} className="rounded bg-neutral-100 px-2 py-1 dark:bg-neutral-800" data-testid="import-comparaison-lot">{l.lot} : {ecartTexte(l.ecart)}</li>)}</ul>}
      <ul className="mt-3 divide-y text-sm">{comparaison.lignes.map((l) => <li key={l.ref} className="flex flex-wrap justify-between gap-2 py-1.5" data-testid="import-comparaison-ligne" data-statut={l.statut}>
        <span>{STATUT_COMPARAISON_LIBELLES[l.statut]} · {l.designation} · <span className="text-neutral-500">{l.emplacement} · {ETAT_PROJET_LIBELLES[l.etat] ?? l.etat}</span></span>
        <span className="font-mono">{l.quantiteA ?? "—"} → {l.quantiteB ?? "—"} {l.unite} · {l.montantA === null ? "—" : montantImport(l.montantA)} → {l.montantB === null ? "—" : montantImport(l.montantB)}</span>
      </li>)}</ul>
    </section>}
    {!comparaison && precedent && <p className="text-sm"><Link href={importToolsHref(id, precedent.id)} className="underline" data-testid="import-comparer-precedente">Comparer avec la version {precedent.source_version}</Link></p>}

    <section className={carte} data-testid="import-correspondances">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Correspondances ouvrage Tools → prestation Gestion Pro</h2>
        {peutGerer && <form action={appliquerCorrespondancesAction}><input type="hidden" name="import_id" value={imp.id} />
          <button className="rounded border px-3 py-1.5 text-xs font-semibold" data-testid="import-appliquer-correspondances">Réappliquer les correspondances</button></form>}
      </div>
      <p className="mt-1 text-xs text-neutral-500">Sans correspondance, la ligne est importée « non liée » : aucune donnée n&apos;est perdue (désignation, quantité, base estimative).</p>
      <ul className="mt-3 divide-y">{ouvrages.map((o) => {
        const prestation = corr.get(o.cle) ?? null;
        return <li key={o.cle} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" data-testid="import-ouvrage" data-cle={o.cle}>
          <span><strong>{o.nom}</strong> <span className="text-xs text-neutral-500">{o.code ? `${o.code} · ` : ""}{o.lot} · {o.unite}</span></span>
          {peutGerer ? <form action={enregistrerCorrespondanceAction} className="flex items-center gap-2">
            <input type="hidden" name="import_id" value={imp.id} /><input type="hidden" name="tools_cle" value={o.cle} /><input type="hidden" name="tools_libelle" value={o.nom} />
            <select name="prestation_id" defaultValue={prestation ?? ""} className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900" data-testid="import-ouvrage-prestation">
              <option value="">Non liée</option>{(prestations ?? []).map((p) => <option key={p.id} value={p.id}>{p.designation} ({p.unite})</option>)}
            </select>
            <button className="rounded border px-2 py-1.5 text-xs font-semibold" data-testid="import-ouvrage-enregistrer">Enregistrer</button>
          </form> : <span className="text-xs">{prestation ? "Liée" : "Non liée"}</span>}
        </li>;
      })}</ul>
    </section>

    <section className={carte} data-testid="import-lignes-section">
      <h2 className="font-semibold">Lignes importées ({count ?? lignesListe.length})</h2>
      {(count ?? 0) > LIGNES_AFFICHEES && <p className="text-xs text-neutral-500">Les {LIGNES_AFFICHEES} premières sont affichées ; toutes sont conservées dans l&apos;import.</p>}
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
        <thead className="text-xs text-neutral-500"><tr><th className="py-1">Ouvrage</th><th>Emplacement</th><th>État</th><th className="text-right">Quantité</th><th className="text-right">PU estimatif</th><th className="text-right">Montant estimatif</th><th>Lien GP</th></tr></thead>
        <tbody>{lignesListe.map((l) => <tr key={l.id} className="border-t border-neutral-100 dark:border-neutral-800" data-testid="import-ligne" data-correspondance={l.correspondance}>
          <td className="py-1.5">{l.designation}<span className="block text-xs text-neutral-500">{l.lot}{l.nature === "forfait" ? " · forfait" : ""}</span></td>
          <td className="text-xs">{l.emplacement}</td><td className="text-xs">{ETAT_PROJET_LIBELLES[l.etat_projet] ?? l.etat_projet}</td>
          <td className="text-right font-mono">{l.quantite === null ? "—" : `${Number(l.quantite).toLocaleString("fr-FR")} ${l.unite}`}</td>
          <td className="text-right font-mono">{l.prix_unitaire_estimatif === null ? "—" : montantImport(l.prix_unitaire_estimatif)}</td>
          <td className="text-right font-mono">{l.montant_estimatif === null ? "sans prix" : montantImport(l.montant_estimatif)}{l.corrige ? " *" : ""}</td>
          <td className="text-xs">{l.correspondance === "liee" ? "Liée" : "Non liée"}</td>
        </tr>)}</tbody>
      </table></div>
    </section>

    {((imp.anomalies?.length ?? 0) > 0 || (imp.annotations?.length ?? 0) > 0 || (imp.photos?.length ?? 0) > 0) && <section className={carte} data-testid="import-terrain">
      <h2 className="font-semibold">Terrain (snapshot Tools)</h2>
      {(imp.anomalies ?? []).map((a, k) => <p key={`an${k}`} className="text-sm">⚠ {a.message}</p>)}
      {(imp.annotations ?? []).map((a) => <p key={a.ref} className="text-sm">✎ {a.texte}</p>)}
      {(imp.photos ?? []).map((p) => <p key={p.ref} className="text-xs text-neutral-500">Photo : {p.legende ?? p.storagePath}</p>)}
    </section>}

    <section className={carte} data-testid="import-journal">
      <h2 className="font-semibold">Traçabilité</h2>
      <p className="mt-1 text-xs text-neutral-500">Empreinte serveur {imp.verification?.empreinte?.slice(0, 12)}… · total recalculé par le serveur {montantImport(imp.verification?.totalServeur)} · {imp.verification?.lignes} ligne(s) vérifiée(s).</p>
      <ul className="mt-2 space-y-1 text-sm">{(journal ?? []).map((j) => {
        const auteur = Array.isArray(j.auteur) ? j.auteur[0] : j.auteur;
        return <li key={j.id} data-testid="import-journal-ligne" data-action={j.action}>{new Date(j.created_at).toLocaleString("fr-FR")} · {({ import: "Import", nouvelle_version: "Nouvelle version reçue", reimport_identique: "Réimport identique (aucun doublon)", devis_cree: "Devis brouillon créé", correspondances_appliquees: "Correspondances appliquées", correspondance: "Correspondance" } as Record<string, string>)[j.action] ?? j.action}
          {auteur ? ` · ${[auteur.prenom, auteur.nom].filter(Boolean).join(" ")}` : ""} · v{j.source_version ?? imp.source_version}</li>;
      })}</ul>
    </section>
  </div></main>;
}
