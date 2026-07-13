"use client";

import { useMemo, useState } from "react";

type LigneReception = {
  id: string;
  designation: string;
  quantite: number;
  quantite_recue: number;
  unite: string;
};

type Etat = "non_recu" | "partiel" | "recu";

const nombre = (valeur: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(valeur);

export function ReceptionCommandeForm({ lignes, action }: { lignes: LigneReception[]; action: (formData: FormData) => void | Promise<void> }) {
  const initial = Object.fromEntries(lignes.map((ligne) => {
    const recue = Number(ligne.quantite_recue);
    const commandee = Number(ligne.quantite);
    return [ligne.id, { etat: recue <= 0 ? "non_recu" : recue >= commandee ? "recu" : "partiel", quantite: recue }];
  })) as Record<string, { etat: Etat; quantite: number }>;
  const [receptions, setReceptions] = useState(initial);

  const valeurs = useMemo(() => lignes.map((ligne) => {
    const saisie = receptions[ligne.id] ?? { etat: "non_recu" as Etat, quantite: 0 };
    const commandee = Number(ligne.quantite);
    const recue = saisie.etat === "recu" ? commandee : saisie.etat === "non_recu" ? 0 : Math.min(commandee, Math.max(0, Number(saisie.quantite) || 0));
    return { ligne, recue, manquante: Math.max(0, commandee - recue), etat: saisie.etat };
  }), [lignes, receptions]);
  const incompletes = valeurs.filter((item) => item.manquante > 0);

  return (
    <form action={action} className="space-y-4 rounded-md border border-[#c9a24a]/50 bg-amber-50/50 p-4 dark:bg-amber-950/10">
      <div>
        <h2 className="text-sm font-semibold">Réception des articles</h2>
        <p className="text-xs text-neutral-500">Indiquez pour chaque article s’il est reçu, non reçu ou reçu partiellement. Les quantités manquantes restent visibles.</p>
      </div>
      <div className="space-y-3">
        {valeurs.map(({ ligne, recue, manquante, etat }) => (
          <div key={ligne.id} className="rounded-md border bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-sm">{ligne.designation}</p>
                <p className="text-xs text-neutral-500">Commandé : {nombre(Number(ligne.quantite))} {ligne.unite}</p>
              </div>
              <select
                aria-label={`État de réception de ${ligne.designation}`}
                value={etat}
                onChange={(event) => {
                  const nouvelEtat = event.target.value as Etat;
                  setReceptions((actuel) => ({ ...actuel, [ligne.id]: { etat: nouvelEtat, quantite: nouvelEtat === "recu" ? Number(ligne.quantite) : nouvelEtat === "non_recu" ? 0 : Math.min(Number(ligne.quantite), Math.max(0, actuel[ligne.id]?.quantite || 0)) } }));
                }}
                className="rounded-md border px-2 py-1.5 text-sm dark:bg-neutral-900"
              >
                <option value="non_recu">Non reçu</option>
                <option value="partiel">Reçu partiellement</option>
                <option value="recu">Reçu totalement</option>
              </select>
            </div>
            {etat === "partiel" && (
              <label className="mt-3 block text-xs text-neutral-500">
                Quantité reçue
                <input
                  type="number"
                  min="0.01"
                  max={ligne.quantite}
                  step="0.01"
                  required
                  value={receptions[ligne.id]?.quantite ?? 0}
                  onChange={(event) => setReceptions((actuel) => ({ ...actuel, [ligne.id]: { etat: "partiel", quantite: Number(event.target.value) } }))}
                  className="ml-2 w-28 rounded-md border px-2 py-1.5 text-right font-mono text-sm dark:bg-neutral-900"
                />
              </label>
            )}
            <input type="hidden" name={`reception_${ligne.id}`} value={recue} />
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <p className="rounded bg-green-50 px-2 py-1.5 text-green-800 dark:bg-green-950/30 dark:text-green-300">Reçu : <strong>{nombre(recue)} {ligne.unite}</strong></p>
              <p className={`rounded px-2 py-1.5 ${manquante ? "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300" : "bg-neutral-50 text-neutral-500 dark:bg-neutral-900"}`}>Manquant : <strong>{nombre(manquante)} {ligne.unite}</strong></p>
            </div>
          </div>
        ))}
      </div>
      <div className={`rounded-md px-3 py-2 text-sm ${incompletes.length ? "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" : "bg-green-100 text-green-900 dark:bg-green-950/40 dark:text-green-200"}`}>
        {incompletes.length ? `${incompletes.length} ligne(s) restent incomplètes. La commande sera marquée « reçue partiellement ».` : "Toutes les quantités sont reçues. La commande sera marquée « reçue »."}
      </div>
      <button type="submit" className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">Enregistrer la réception</button>
    </form>
  );
}
