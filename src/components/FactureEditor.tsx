"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { calcTotaux, euros, LIGNE_TYPES, TAUX_TVA, UNITES, type LigneDevis } from "@/lib/devis";
import { FACTURE_TYPES } from "@/lib/factures";
import { prestationVersLigne, type PrestationCatalogue } from "@/lib/prestations";
import { modifierFactureAction } from "@/app/actions/factures";

type Option = { id: string; label: string };
type FactureInitiale = {
  id: string; client_id: string; chantier_id: string | null; type: string;
  date_emission: string; date_echeance: string | null;
  notes_client: string | null; notes_internes: string | null; lignes: LigneDevis[];
};
const input = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const ligneVide = (): LigneDevis => ({ designation: "", description: null, type: "fourniture", quantite: 1, unite: "u", prix_unitaire_ht: 0, remise_ligne: 0, taux_tva: 20 });

export function FactureEditor({ facture, clients, chantiers, prestations }: {
  facture: FactureInitiale;
  clients: Option[];
  chantiers: { id: string; label: string; client_id: string }[];
  prestations: PrestationCatalogue[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [clientId, setClientId] = useState(facture.client_id);
  const [chantierId, setChantierId] = useState(facture.chantier_id ?? "");
  const [type, setType] = useState(facture.type);
  const [dateEmission, setDateEmission] = useState(facture.date_emission);
  const [dateEcheance, setDateEcheance] = useState(facture.date_echeance ?? "");
  const [notesClient, setNotesClient] = useState(facture.notes_client ?? "");
  const [notesInternes, setNotesInternes] = useState(facture.notes_internes ?? "");
  const [lignes, setLignes] = useState<LigneDevis[]>(facture.lignes.length ? facture.lignes : [ligneVide()]);
  const totaux = calcTotaux(lignes, 0);
  const maj = (i: number, cle: keyof LigneDevis, valeur: string | number) => setLignes((avant) => avant.map((ligne, index) => index === i ? { ...ligne, [cle]: valeur } : ligne));

  function insererPrestation(id: string) {
    const prestation = prestations.find((item) => item.id === id);
    if (prestation) setLignes((avant) => [...avant.filter((ligne) => ligne.designation.trim()), prestationVersLigne(prestation)]);
  }
  function enregistrer() {
    setErreur(null);
    if (!clientId) return setErreur("Choisissez un client.");
    startTransition(async () => {
      const resultat = await modifierFactureAction(facture.id, { client_id: clientId, chantier_id: chantierId || null, type, date_emission: dateEmission, date_echeance: dateEcheance || null, notes_client: notesClient || null, notes_internes: notesInternes || null, lignes });
      if (resultat.error) setErreur(resultat.error); else router.push(`/factures/${facture.id}`);
    });
  }

  return <div className="space-y-6">
    {erreur && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>}
    <div className="grid grid-cols-2 gap-4">
      <label className="space-y-1 text-sm font-medium">Client<select value={clientId} onChange={(e) => { setClientId(e.target.value); setChantierId(""); }} className={input + " w-full"}>{clients.map((client) => <option key={client.id} value={client.id}>{client.label}</option>)}</select></label>
      <label className="space-y-1 text-sm font-medium">Chantier<select value={chantierId} onChange={(e) => setChantierId(e.target.value)} className={input + " w-full"}><option value="">—</option>{chantiers.filter((chantier) => chantier.client_id === clientId).map((chantier) => <option key={chantier.id} value={chantier.id}>{chantier.label}</option>)}</select></label>
    </div>
    <div className="grid grid-cols-3 gap-4">
      <label className="space-y-1 text-sm font-medium">Type<select value={type} onChange={(e) => setType(e.target.value)} className={input + " w-full"}>{FACTURE_TYPES.map((item) => <option key={item.cle} value={item.cle}>{item.libelle}</option>)}</select></label>
      <label className="space-y-1 text-sm font-medium">Date d’émission<input type="date" value={dateEmission} onChange={(e) => setDateEmission(e.target.value)} className={input + " w-full"} /></label>
      <label className="space-y-1 text-sm font-medium">Échéance<input type="date" value={dateEcheance} onChange={(e) => setDateEcheance(e.target.value)} className={input + " w-full"} /></label>
    </div>
    <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900/50"><select value="" onChange={(e) => insererPrestation(e.target.value)} className={input + " w-full"}><option value="">— Insérer une prestation du catalogue —</option>{prestations.map((item) => <option key={item.id} value={item.id}>{item.designation} · {euros(item.prix_unitaire_ht)} HT/{item.unite}</option>)}</select></div>
    <div className="space-y-3">{lignes.map((ligne, i) => <div key={i} className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex gap-2"><input value={ligne.designation} onChange={(e) => maj(i, "designation", e.target.value)} placeholder="Désignation" className={input + " flex-1"} /><select value={ligne.type} onChange={(e) => maj(i, "type", e.target.value)} className={input}>{LIGNE_TYPES.map((item) => <option key={item.cle} value={item.cle}>{item.libelle}</option>)}</select>{lignes.length > 1 && <button type="button" onClick={() => setLignes((avant) => avant.filter((_, index) => index !== i))} className="px-2 text-neutral-400 hover:text-red-600">×</button>}</div>
      <textarea rows={2} value={ligne.description ?? ""} onChange={(e) => maj(i, "description", e.target.value)} placeholder="Description" className={input + " mt-2 w-full"} />
      <div className="mt-2 flex flex-wrap items-center gap-2"><input type="number" step="0.01" value={ligne.quantite} onChange={(e) => maj(i, "quantite", Number(e.target.value))} className={input + " w-20"} /><select value={ligne.unite} onChange={(e) => maj(i, "unite", e.target.value)} className={input}>{UNITES.map((unite) => <option key={unite}>{unite}</option>)}</select><span>×</span><input type="number" step="0.01" value={ligne.prix_unitaire_ht} onChange={(e) => maj(i, "prix_unitaire_ht", Number(e.target.value))} className={input + " w-28"} /><span>€ HT · remise</span><input type="number" min="0" max="100" value={ligne.remise_ligne} onChange={(e) => maj(i, "remise_ligne", Number(e.target.value))} className={input + " w-16"} /><span>% · TVA</span><select value={ligne.taux_tva} onChange={(e) => maj(i, "taux_tva", Number(e.target.value))} className={input}>{TAUX_TVA.map((taux) => <option key={taux} value={taux}>{taux} %</option>)}</select><span className="ml-auto font-mono">{euros(ligne.quantite * ligne.prix_unitaire_ht * (1 - ligne.remise_ligne / 100))}</span></div>
    </div>)}</div>
    <button type="button" onClick={() => setLignes((avant) => [...avant, ligneVide()])} className="text-sm text-neutral-600 hover:underline">+ Ajouter une ligne</button>
    <div className="grid grid-cols-2 gap-4"><label className="space-y-1 text-sm font-medium">Notes visibles client<textarea rows={3} value={notesClient} onChange={(e) => setNotesClient(e.target.value)} className={input + " w-full"} /></label><label className="space-y-1 text-sm font-medium">Notes internes<textarea rows={3} value={notesInternes} onChange={(e) => setNotesInternes(e.target.value)} className={input + " w-full"} /></label></div>
    <div className="flex justify-between rounded-md border border-neutral-200 p-4"><span>Total HT : <strong>{euros(totaux.ht)}</strong> · TVA : <strong>{euros(totaux.tva)}</strong></span><span className="font-mono text-xl font-semibold">{euros(totaux.ttc)} TTC</span></div>
    <button type="button" onClick={enregistrer} disabled={pending} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{pending ? "Enregistrement…" : "Enregistrer les modifications"}</button>
  </div>;
}
