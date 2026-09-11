"use client";

import { useState, useTransition } from "react";
import { analyserFichierImport, importerCatalogueV2Action, importerDonneesAction, type ResultatImport } from "@/app/actions/import";
import { LOGICIELS_SOURCE, logicielSource, suggererMappingImport, TYPES_IMPORT, typeImport, type ChampImport } from "@/lib/import/config";
import {
  CHAMPS_CATALOGUE_V2,
  CLES_RAPPROCHEMENT,
  erreurMappingCatalogueV2,
  LIBELLES_STATUT_IMPORT,
  lireCleRapprochement,
  STATUTS_LIGNE_IMPORT,
  suggererMappingCatalogueV2,
  type OptionsImportCatalogueV2,
} from "@/lib/import/catalogue-v2";
import type { CleRapprochement, StatutLigneImport } from "@/lib/devis/import-catalogue";
import type { RapportImportCatalogue } from "@/lib/devis/application-import-catalogue";

// Moteur de devis v2 : le profil catalogue enrichi n'existe que si l'analyse du fichier le signale
// (`catalogueV2`, drapeau serveur posé). Sinon l'assistant est strictement l'historique.
function mappingPropose(type: string, colonnes: string[], v2: OptionsImportCatalogueV2 | null): Record<string, number> {
  return type === "catalogue" && v2 ? suggererMappingCatalogueV2(colonnes) : suggererMappingImport(type, colonnes);
}

const TON_STATUT: Record<StatutLigneImport, string> = {
  creee: "text-green-700 dark:text-green-300",
  mise_a_jour: "text-green-700 dark:text-green-300",
  ignoree: "text-neutral-500",
  doublon: "text-amber-700 dark:text-amber-300",
  reference_absente: "text-amber-700 dark:text-amber-300",
  fournisseur_inconnu: "text-amber-700 dark:text-amber-300",
  valeur_invalide: "text-red-700 dark:text-red-300",
  refusee: "text-red-700 dark:text-red-300",
};

const pastille = (actif: boolean) =>
  `rounded-full border px-2.5 py-1 disabled:opacity-40 ${actif ? "border-[#0d1b2a] bg-[#0d1b2a] text-white" : "border-neutral-300 dark:border-neutral-700"}`;

export function ImportWizard() {
  const [typeCle, setTypeCle] = useState("clients");
  const [sourceCle, setSourceCle] = useState("generique");
  const [entete, setEntete] = useState<string[]>([]);
  const [lignes, setLignes] = useState<string[][]>([]);
  const [total, setTotal] = useState(0);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<ResultatImport | null>(null);
  const [catalogueV2, setCatalogueV2] = useState<OptionsImportCatalogueV2 | null>(null);
  const [cleRapprochement, setCleRapprochement] = useState<CleRapprochement>("reference_interne");
  const [rapportCatalogue, setRapportCatalogue] = useState<RapportImportCatalogue | null>(null);
  const [filtreStatut, setFiltreStatut] = useState<StatutLigneImport | null>(null);
  const [analyse, demarrerAnalyse] = useTransition();
  const [importe, demarrerImport] = useTransition();

  const conf = typeImport(typeCle)!;
  const v2 = typeCle === "catalogue" && catalogueV2 !== null;
  const champs: readonly ChampImport[] = v2 ? CHAMPS_CATALOGUE_V2 : conf.champs;

  function onFichier(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErreur(null); setResultat(null); setRapportCatalogue(null);
    const formData = new FormData(e.currentTarget);
    demarrerAnalyse(async () => {
      const res = await analyserFichierImport(formData);
      if (res.erreur) { setErreur(res.erreur); setEntete([]); setLignes([]); return; }
      if (res.total === 0) { setErreur("Aucune ligne de données détectée."); setEntete([]); setLignes([]); return; }
      const optionsV2 = res.catalogueV2 ?? null;
      setCatalogueV2(optionsV2);
      setEntete(res.entete); setLignes(res.lignes); setTotal(res.total);
      setMapping(mappingPropose(typeCle, res.entete, optionsV2));
    });
  }

  function lancerImportCatalogueV2() {
    const probleme = erreurMappingCatalogueV2(mapping, cleRapprochement);
    if (probleme) { setErreur(probleme); return; }
    setErreur(null);
    demarrerImport(async () => {
      const res = await importerCatalogueV2Action({ entete, mapping, lignes, cleRapprochement });
      if ("erreur" in res) { setErreur(res.erreur); return; }
      setFiltreStatut(null);
      setRapportCatalogue(res);
    });
  }

  function lancerImport() {
    if (v2) { lancerImportCatalogueV2(); return; }
    const manquants = conf.champs.filter((c) => c.requis && (mapping[c.cle] ?? -1) < 0);
    if (manquants.length) { setErreur(`Champs obligatoires non mappés : ${manquants.map((c) => c.libelle).join(", ")}`); return; }
    setErreur(null);
    demarrerImport(async () => {
      const res = await importerDonneesAction({
        type: typeCle,
        mapping,
        lignes,
        sourceLogiciel: logicielSource(sourceCle).libelle,
      });
      setResultat(res);
    });
  }

  const apercu = lignes.slice(0, 5);
  const lignesRapport = rapportCatalogue
    ? rapportCatalogue.lignes.filter((l) => filtreStatut === null || l.statut === filtreStatut)
    : [];

  return (
    <div className="space-y-6">
      {/* Étape 1 : type + fichier */}
      <form onSubmit={onFichier} className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="grid gap-3 lg:grid-cols-3">
          <label className="text-sm">
            <span className="font-medium">Logiciel d’origine</span>
            <select value={sourceCle} onChange={(e) => {
              setSourceCle(e.target.value);
              if (entete.length) setMapping(mappingPropose(typeCle, entete, catalogueV2));
            }} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900">
              {LOGICIELS_SOURCE.map((logiciel) => <option key={logiciel.cle} value={logiciel.cle}>{logiciel.libelle}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium">Type de données</span>
            <select value={typeCle} onChange={(e) => { setTypeCle(e.target.value); setEntete([]); setLignes([]); setResultat(null); setRapportCatalogue(null); setMapping({}); }}
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900">
              {TYPES_IMPORT.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium">Fichier (CSV ou Excel)</span>
            <input name="fichier" type="file" accept=".csv,.xlsx,.xls,text/csv" required
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
          </label>
        </div>
        <p className="text-xs text-neutral-500">
          {logicielSource(sourceCle).description} {conf.description} La première ligne du fichier doit contenir les intitulés de colonnes.
        </p>
        <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
          Aucun mot de passe ni sauvegarde propriétaire n’est demandé : utilisez l’export CSV/XLSX officiel de votre logiciel. Vous pourrez contrôler chaque correspondance avant l’import.
        </p>
        <button type="submit" disabled={analyse} className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {analyse ? "Analyse…" : "Analyser le fichier"}
        </button>
      </form>

      {erreur && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>}

      {/* Étape 2 : mapping */}
      {entete.length > 0 && !resultat && !rapportCatalogue && (
        <div className="space-y-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <div>
            <h3 className="font-semibold">Correspondance des colonnes</h3>
            <p className="text-xs text-neutral-500">{total} ligne(s) détectée(s). Le profil {logicielSource(sourceCle).libelle} a proposé les correspondances ; vérifiez-les avant l’import.</p>
          </div>
          {v2 && catalogueV2 && (
            <div className="space-y-2 rounded-md bg-neutral-50 p-3 dark:bg-neutral-900">
              {!catalogueV2.autorise && (
                <p className="text-sm text-red-700 dark:text-red-300">
                  Vous n’avez pas le droit d’importer dans le catalogue des devis (accès et gestion des devis requis).
                </p>
              )}
              <label className="block text-sm">
                <span className="font-medium">Rapprocher les lignes du catalogue par</span>
                <select value={cleRapprochement} onChange={(e) => setCleRapprochement(lireCleRapprochement(e.target.value) ?? "reference_interne")}
                  className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm sm:w-80 dark:border-neutral-700 dark:bg-neutral-900">
                  {CLES_RAPPROCHEMENT.map((c) => <option key={c.cle} value={c.cle}>{c.libelle}</option>)}
                </select>
                <span className="mt-0.5 block text-[11px] text-neutral-400">
                  Une ligne dont la clé désigne un article existant le met à jour — seuls les champs qui changent, une cellule vide n’efface rien.
                  Sinon, elle crée un nouvel article. Une clé partagée par plusieurs articles n’en modifie aucun.
                </span>
              </label>
              {!catalogueV2.prixAchat && (
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Vous n’avez pas le droit de modifier les prix d’achat : la colonne « Prix d’achat HT » ne sera pas importée.
                </p>
              )}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {champs.map((champ) => (
              <label key={champ.cle} className="text-sm">
                <span className="font-medium">{champ.libelle}{champ.requis && <span className="text-red-600"> *</span>}</span>
                <select value={mapping[champ.cle] ?? -1} onChange={(e) => setMapping((m) => ({ ...m, [champ.cle]: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900">
                  <option value={-1}>— Ignorer —</option>
                  {entete.map((col, idx) => <option key={idx} value={idx}>{col || `Colonne ${idx + 1}`}</option>)}
                </select>
                {champ.aide && <span className="mt-0.5 block text-[11px] text-neutral-400">{champ.aide}</span>}
              </label>
            ))}
          </div>

          {/* Aperçu */}
          <div className="overflow-x-auto rounded border border-neutral-100 dark:border-neutral-800">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 text-left dark:bg-neutral-900">
                <tr>{champs.filter((c) => (mapping[c.cle] ?? -1) >= 0).map((c) => <th key={c.cle} className="px-2 py-1">{c.libelle}</th>)}</tr>
              </thead>
              <tbody>
                {apercu.map((l, i) => (
                  <tr key={i} className="border-t border-neutral-100 dark:border-neutral-800">
                    {champs.filter((c) => (mapping[c.cle] ?? -1) >= 0).map((c) => <td key={c.cle} className="px-2 py-1">{l[mapping[c.cle]] ?? ""}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button onClick={lancerImport} disabled={importe || (v2 && catalogueV2?.autorise === false)} className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {importe ? "Import en cours…" : `Importer ${total} ligne(s)`}
          </button>
        </div>
      )}

      {/* Étape 3 : résultat */}
      {resultat && (
        <div className="space-y-2 rounded-md border border-green-200 bg-green-50/50 p-4 dark:border-green-900 dark:bg-green-950/20">
          <h3 className="font-semibold text-green-800 dark:text-green-300">Import terminé</h3>
          <p className="text-sm">✅ {resultat.inseres} enregistrement(s) importé(s){resultat.ignores > 0 && ` · ${resultat.ignores} ligne(s) ignorée(s)`}.</p>
          {resultat.erreurs.length > 0 && (
            <ul className="list-inside list-disc text-xs text-red-700">
              {resultat.erreurs.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          <button onClick={() => { setResultat(null); setEntete([]); setLignes([]); }} className="rounded-md border px-3 py-2 text-sm">Nouvel import</button>
        </div>
      )}

      {/* Étape 3 bis : rapport ligne à ligne du catalogue (moteur v2) */}
      {rapportCatalogue && (
        <div className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <div>
            <h3 className="font-semibold">Import du catalogue terminé</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              {rapportCatalogue.lignes.length} ligne(s) : {rapportCatalogue.synthese.creee} article(s) créé(s),{" "}
              {rapportCatalogue.synthese.mise_a_jour} mis à jour, {rapportCatalogue.synthese.ignoree} sans effet,{" "}
              {rapportCatalogue.lignes.length - rapportCatalogue.synthese.creee - rapportCatalogue.synthese.mise_a_jour - rapportCatalogue.synthese.ignoree} non importée(s).
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button type="button" onClick={() => setFiltreStatut(null)} className={pastille(filtreStatut === null)}>
              Toutes : {rapportCatalogue.lignes.length}
            </button>
            {STATUTS_LIGNE_IMPORT.map((s) => (
              <button key={s} type="button" onClick={() => setFiltreStatut(s)} disabled={rapportCatalogue.synthese[s] === 0} className={pastille(filtreStatut === s)}>
                {LIBELLES_STATUT_IMPORT[s]} : {rapportCatalogue.synthese[s]}
              </button>
            ))}
          </div>
          {rapportCatalogue.colonnesInconnues.length > 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              Colonne(s) du fichier non importée(s), faute d’être associée(s) à un champ : {rapportCatalogue.colonnesInconnues.map((c) => `« ${c} »`).join(", ")}.
            </p>
          )}
          <div className="max-h-96 overflow-auto rounded border border-neutral-100 dark:border-neutral-800">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-neutral-50 text-left dark:bg-neutral-900">
                <tr>
                  <th className="px-2 py-1">Ligne</th>
                  <th className="px-2 py-1">Statut</th>
                  <th className="px-2 py-1">Message</th>
                </tr>
              </thead>
              <tbody>
                {lignesRapport.map((l) => (
                  <tr key={l.numeroLigne} className="border-t border-neutral-100 align-top dark:border-neutral-800">
                    <td className="px-2 py-1 tabular-nums">{l.numeroLigne}</td>
                    <td className={`whitespace-nowrap px-2 py-1 font-medium ${TON_STATUT[l.statut]}`}>{LIBELLES_STATUT_IMPORT[l.statut]}</td>
                    <td className="px-2 py-1">{l.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-neutral-400">
            La ligne 1 est celle des intitulés ; les lignes entièrement vides du fichier ne sont pas numérotées.
          </p>
          <button onClick={() => { setRapportCatalogue(null); setEntete([]); setLignes([]); }} className="rounded-md border px-3 py-2 text-sm">Nouvel import</button>
        </div>
      )}
    </div>
  );
}
