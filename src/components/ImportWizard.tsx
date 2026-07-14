"use client";

import { useState, useTransition } from "react";
import { analyserFichierImport, importerDonneesAction, type ResultatImport } from "@/app/actions/import";
import { TYPES_IMPORT, typeImport } from "@/lib/import/config";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

export function ImportWizard() {
  const [typeCle, setTypeCle] = useState("clients");
  const [entete, setEntete] = useState<string[]>([]);
  const [lignes, setLignes] = useState<string[][]>([]);
  const [total, setTotal] = useState(0);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<ResultatImport | null>(null);
  const [analyse, demarrerAnalyse] = useTransition();
  const [importe, demarrerImport] = useTransition();

  const conf = typeImport(typeCle)!;

  function autoMapper(colonnes: string[]) {
    const m: Record<string, number> = {};
    for (const champ of conf.champs) {
      const cibles = [norm(champ.cle), norm(champ.libelle)];
      const idx = colonnes.findIndex((c) => { const nc = norm(c); return cibles.some((t) => nc === t || nc.includes(t) || t.includes(nc)); });
      m[champ.cle] = idx;
    }
    return m;
  }

  function onFichier(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErreur(null); setResultat(null);
    const formData = new FormData(e.currentTarget);
    demarrerAnalyse(async () => {
      const res = await analyserFichierImport(formData);
      if (res.erreur) { setErreur(res.erreur); setEntete([]); setLignes([]); return; }
      if (res.total === 0) { setErreur("Aucune ligne de données détectée."); setEntete([]); setLignes([]); return; }
      setEntete(res.entete); setLignes(res.lignes); setTotal(res.total);
      setMapping(autoMapper(res.entete));
    });
  }

  function lancerImport() {
    const manquants = conf.champs.filter((c) => c.requis && (mapping[c.cle] ?? -1) < 0);
    if (manquants.length) { setErreur(`Champs obligatoires non mappés : ${manquants.map((c) => c.libelle).join(", ")}`); return; }
    setErreur(null);
    demarrerImport(async () => {
      const res = await importerDonneesAction({ type: typeCle, mapping, lignes });
      setResultat(res);
    });
  }

  const apercu = lignes.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Étape 1 : type + fichier */}
      <form onSubmit={onFichier} className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="font-medium">Type de données</span>
            <select value={typeCle} onChange={(e) => { setTypeCle(e.target.value); setEntete([]); setLignes([]); setResultat(null); }}
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
        <p className="text-xs text-neutral-500">{conf.description} La première ligne du fichier doit contenir les intitulés de colonnes.</p>
        <button type="submit" disabled={analyse} className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {analyse ? "Analyse…" : "Analyser le fichier"}
        </button>
      </form>

      {erreur && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>}

      {/* Étape 2 : mapping */}
      {entete.length > 0 && !resultat && (
        <div className="space-y-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <div>
            <h3 className="font-semibold">Correspondance des colonnes</h3>
            <p className="text-xs text-neutral-500">{total} ligne(s) détectée(s). Associez chaque champ à une colonne de votre fichier.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {conf.champs.map((champ) => (
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
                <tr>{conf.champs.filter((c) => (mapping[c.cle] ?? -1) >= 0).map((c) => <th key={c.cle} className="px-2 py-1">{c.libelle}</th>)}</tr>
              </thead>
              <tbody>
                {apercu.map((l, i) => (
                  <tr key={i} className="border-t border-neutral-100 dark:border-neutral-800">
                    {conf.champs.filter((c) => (mapping[c.cle] ?? -1) >= 0).map((c) => <td key={c.cle} className="px-2 py-1">{l[mapping[c.cle]] ?? ""}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button onClick={lancerImport} disabled={importe} className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
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
    </div>
  );
}
