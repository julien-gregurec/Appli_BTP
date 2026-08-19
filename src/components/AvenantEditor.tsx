"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LIGNE_TYPES, UNITES, TAUX_TVA, euros } from "@/lib/devis";
import { calcTotauxAvenant, type LigneAvenant } from "@/lib/avenants";
import { creerAvenantAction, modifierAvenantAction } from "@/app/actions/avenants";

const input = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const label = "text-sm font-medium";

function ligneVide(): LigneAvenant {
  return { designation: "", description: null, type: "fourniture", quantite: 1, unite: "u", prix_unitaire_ht: 0, remise_ligne: 0, taux_tva: 20 };
}

type AvenantInitial = {
  id: string;
  notes_client: string | null;
  notes_internes: string | null;
  lignes: LigneAvenant[];
};

export function AvenantEditor({
  devisId,
  devisNumero,
  devisMontantHt,
  chantierId,
  avenantInitial,
}: {
  devisId: string;
  devisNumero: string | null;
  devisMontantHt: number;
  chantierId: string;
  avenantInitial?: AvenantInitial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [notesClient, setNotesClient] = useState(avenantInitial?.notes_client ?? "");
  const [notesInternes, setNotesInternes] = useState(avenantInitial?.notes_internes ?? "");
  const [lignes, setLignes] = useState<LigneAvenant[]>(avenantInitial?.lignes.length ? avenantInitial.lignes : [ligneVide()]);

  const totaux = calcTotauxAvenant(lignes);
  const montantContractuelApres = devisMontantHt + totaux.ht;

  const majLigne = (index: number, patch: Partial<LigneAvenant>) => {
    setLignes((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const soumettre = () => {
    setErreur(null);
    startTransition(async () => {
      const payload = { devis_origine_id: devisId, notes_client: notesClient || null, notes_internes: notesInternes || null, lignes };
      const resultat = avenantInitial
        ? await modifierAvenantAction(avenantInitial.id, payload)
        : await creerAvenantAction(payload);
      if ("error" in resultat && resultat.error) {
        setErreur(resultat.error);
        return;
      }
      router.push(`/avenants/${resultat.id}`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
        Avenant au devis <span className="font-semibold">{devisNumero ?? "—"}</span> (montant actuel : {euros(devisMontantHt)}). Le devis d’origine reste inchangé.
      </div>

      <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
              <th className="p-2">Désignation</th>
              <th className="p-2">Type</th>
              <th className="p-2">Qté</th>
              <th className="p-2">Unité</th>
              <th className="p-2">PU HT</th>
              <th className="p-2">Remise %</th>
              <th className="p-2">TVA %</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={i} className="border-b border-neutral-100 dark:border-neutral-800">
                <td className="p-2"><input className={`${input} w-full`} value={l.designation} onChange={(e) => majLigne(i, { designation: e.target.value })} placeholder="Désignation" /></td>
                <td className="p-2">
                  <select className={input} value={l.type} onChange={(e) => majLigne(i, { type: e.target.value })}>
                    {LIGNE_TYPES.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}
                  </select>
                </td>
                <td className="p-2"><input type="number" step="any" className={`${input} w-24`} value={l.quantite} onChange={(e) => majLigne(i, { quantite: Number(e.target.value) })} title="Une quantité négative représente une moins-value" /></td>
                <td className="p-2">
                  <select className={input} value={l.unite} onChange={(e) => majLigne(i, { unite: e.target.value })}>
                    {UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </td>
                <td className="p-2"><input type="number" step="any" className={`${input} w-24`} value={l.prix_unitaire_ht} onChange={(e) => majLigne(i, { prix_unitaire_ht: Number(e.target.value) })} /></td>
                <td className="p-2"><input type="number" step="any" className={`${input} w-20`} value={l.remise_ligne} onChange={(e) => majLigne(i, { remise_ligne: Number(e.target.value) })} /></td>
                <td className="p-2">
                  <select className={input} value={l.taux_tva} onChange={(e) => majLigne(i, { taux_tva: Number(e.target.value) })}>
                    {TAUX_TVA.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td className="p-2">
                  <button type="button" onClick={() => setLignes((prev) => prev.filter((_, idx) => idx !== i))} className="text-xs text-red-600 hover:underline">Retirer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => setLignes((prev) => [...prev, ligneVide()])} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">+ Ajouter une ligne</button>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={label}>Notes client<textarea className={`${input} mt-1 w-full`} rows={3} value={notesClient} onChange={(e) => setNotesClient(e.target.value)} /></label>
        <label className={label}>Notes internes<textarea className={`${input} mt-1 w-full`} rows={3} value={notesInternes} onChange={(e) => setNotesInternes(e.target.value)} /></label>
      </div>

      <div className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
        <p>Variation HT de cet avenant : <span className="font-mono font-semibold">{euros(totaux.ht)}</span></p>
        <p>Montant contractuel si accepté : <span className="font-mono font-semibold">{euros(montantContractuelApres)}</span></p>
      </div>

      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      <div className="flex gap-3">
        <button type="button" disabled={pending} onClick={soumettre} className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {avenantInitial ? "Enregistrer les modifications" : "Créer l’avenant en brouillon"}
        </button>
        <a href={`/chantiers/${chantierId}`} className="rounded-md border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700">Annuler</a>
      </div>
    </div>
  );
}
