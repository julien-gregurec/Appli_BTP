"use client";

import { useMemo, useState } from "react";
import { creerDepenseAction } from "@/app/actions/depenses";
import { DEPENSE_CATEGORIES } from "@/lib/depenses";
import { calculerMontantsTva, TAUX_TVA_FRANCE } from "@/lib/tva";
import { calculerEcheanceFournisseur, libelleDelaiPaiementFournisseur } from "@/lib/echeances-fournisseurs";

type Option = { id: string; nom: string; delai_paiement_jours?: number | null };
type Commande = { id: string; numero: string; fournisseur_id: string };
type Vehicule = { id: string; immatriculation: string; marque: string; modele: string };
type Outil = { id: string; reference: string; designation: string };
type Employe = { id: string; prenom: string; nom: string };

const cls = "rounded-md border px-3 py-2 text-sm dark:bg-neutral-900";
const montant = (valeur: number | null) => valeur === null ? "" : valeur.toFixed(2);

export function DepenseFournisseurForm({
  fournisseurs,
  chantiers,
  commandes,
  vehicules,
  outils,
  employes,
  chantierInitial = "",
  fournisseurInitial = "",
  categorieInitiale = "materiaux",
}: {
  fournisseurs: Option[];
  chantiers: Option[];
  commandes: Commande[];
  vehicules: Vehicule[];
  outils: Outil[];
  employes: Employe[];
  chantierInitial?: string;
  fournisseurInitial?: string;
  categorieInitiale?: string;
}) {
  const fournisseurInitialValide = fournisseurs.some((item) => item.id === fournisseurInitial) ? fournisseurInitial : "";
  const categorieInitialeValide = Object.hasOwn(DEPENSE_CATEGORIES, categorieInitiale) ? categorieInitiale : "materiaux";
  const dateAujourdhui = new Date().toISOString().slice(0, 10);
  const delaiInitial = Number(fournisseurs.find((item) => item.id === fournisseurInitialValide)?.delai_paiement_jours ?? 30);
  const [fournisseurId, setFournisseurId] = useState(fournisseurInitialValide);
  const [commandeId, setCommandeId] = useState("");
  const [htBrut, setHtBrut] = useState("");
  const [taux, setTaux] = useState(20);
  const [datePiece, setDatePiece] = useState(dateAujourdhui);
  const [dateEcheance, setDateEcheance] = useState(
    fournisseurInitialValide ? calculerEcheanceFournisseur(dateAujourdhui, delaiInitial) : "",
  );

  const commandesDisponibles = useMemo(
    () => commandes.filter((commande) => commande.fournisseur_id === fournisseurId),
    [commandes, fournisseurId],
  );
  const ht = htBrut === "" ? null : Number(htBrut);
  const calcul = ht !== null && Number.isFinite(ht) && ht >= 0 ? calculerMontantsTva(ht, taux) : null;
  const fournisseurSelectionne = fournisseurs.find((item) => item.id === fournisseurId);
  const delaiSelectionne = Number(fournisseurSelectionne?.delai_paiement_jours ?? 30);

  const actualiserFournisseur = (id: string) => {
    setFournisseurId(id);
    setCommandeId("");
    const delai = Number(fournisseurs.find((item) => item.id === id)?.delai_paiement_jours ?? 30);
    setDateEcheance(id ? calculerEcheanceFournisseur(datePiece, delai) : "");
  };

  const actualiserDatePiece = (date: string) => {
    setDatePiece(date);
    setDateEcheance(fournisseurId ? calculerEcheanceFournisseur(date, delaiSelectionne) : "");
  };

  return (
    <form action={creerDepenseAction} className="grid gap-3 rounded border p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="sm:col-span-2 lg:col-span-4">
        <h2 className="font-semibold">Nouvelle facture fournisseur</h2>
        <p className="mt-1 text-xs text-neutral-500">Sélectionnez le taux indiqué sur la facture : les montants TVA et TTC sont calculés automatiquement puis sécurisés côté serveur.</p>
      </div>
      <select
        name="fournisseur_id"
        required
        value={fournisseurId}
        onChange={(event) => actualiserFournisseur(event.target.value)}
        className={cls}
      >
        <option value="">Fournisseur *</option>
        {fournisseurs.map((item) => <option key={item.id} value={item.id}>{item.nom}</option>)}
      </select>
      <input name="numero_piece" required placeholder="N° facture fournisseur *" className={cls}/>
      <select name="categorie" defaultValue={categorieInitialeValide} className={cls}>{Object.entries(DEPENSE_CATEGORIES).map(([valeur, libelle]) => <option key={valeur} value={valeur}>{libelle}</option>)}</select>
      <select name="chantier_id" defaultValue={chantierInitial} className={cls}><option value="">Sans chantier</option>{chantiers.map((item) => <option key={item.id} value={item.id}>{item.nom}</option>)}</select>
      <label className="text-xs text-neutral-500">Date de facture<input name="date_piece" type="date" required value={datePiece} onChange={(event) => actualiserDatePiece(event.target.value)} className={`mt-1 w-full ${cls}`}/></label>
      <label className="text-xs text-neutral-500">Échéance calculée<input name="date_echeance" type="date" value={dateEcheance} onChange={(event) => setDateEcheance(event.target.value)} className={`mt-1 w-full ${cls}`}/>{fournisseurId && <small className="mt-1 block">Délai fournisseur : {libelleDelaiPaiementFournisseur(delaiSelectionne)}</small>}</label>
      <label className="text-xs text-neutral-500">Montant HT
        <input name="montant_ht" type="number" inputMode="decimal" min="0" step="0.01" required value={htBrut} onChange={(event) => setHtBrut(event.target.value)} className={`mt-1 w-full ${cls}`}/>
      </label>
      <label className="text-xs text-neutral-500">Taux de TVA
        <select name="taux_tva" value={taux} onChange={(event) => setTaux(Number(event.target.value))} className={`mt-1 w-full ${cls}`}>
          {TAUX_TVA_FRANCE.map((valeur) => <option key={valeur} value={valeur}>{valeur === 0 ? "0 % — exonéré" : `${String(valeur).replace(".", ",")} %`}</option>)}
        </select>
      </label>
      <label className="text-xs text-neutral-500">Montant TVA calculé
        <input name="montant_tva" readOnly value={montant(calcul?.tva ?? null)} className={`mt-1 w-full bg-neutral-50 font-mono dark:bg-neutral-950 ${cls}`}/>
      </label>
      <label className="text-xs text-neutral-500">Montant TTC calculé
        <input name="montant_ttc" readOnly value={montant(calcul?.ttc ?? null)} className={`mt-1 w-full bg-neutral-50 font-mono dark:bg-neutral-950 ${cls}`}/>
      </label>
      <select name="commande_id" value={commandeId} onChange={(event) => setCommandeId(event.target.value)} disabled={!fournisseurId} className={cls}>
        <option value="">{fournisseurId ? "Sans commande liée" : "Choisissez d’abord un fournisseur"}</option>
        {commandesDisponibles.map((item) => <option key={item.id} value={item.id}>{item.numero}</option>)}
      </select>
      <select name="actif_id" className={cls}><option value="">Sans véhicule ni outil</option><optgroup label="Véhicules">{vehicules.map((item) => <option key={item.id} value={`vehicule:${item.id}`}>{item.immatriculation} · {item.marque} {item.modele}</option>)}</optgroup><optgroup label="Outillage">{outils.map((item) => <option key={item.id} value={`outil:${item.id}`}>{item.reference} · {item.designation}</option>)}</optgroup></select>
      <select name="employe_id" className={cls}><option value="">Ouvrier affecté automatiquement</option>{employes.map((item) => <option key={item.id} value={item.id}>{item.prenom} {item.nom}</option>)}</select>
      <input name="notes" placeholder="Notes" className={cls}/>
      <textarea name="travaux_effectues" rows={2} placeholder="Travaux effectués, pièces remplacées, diagnostic… (utile pour véhicule ou outil)" className={`${cls} sm:col-span-2 lg:col-span-4`}/>
      <p className="text-xs text-neutral-500 sm:col-span-2 lg:col-span-4">Taux de France métropolitaine. Contrôlez toujours le taux réellement imprimé sur la facture fournisseur.</p>
      <button className="rounded bg-neutral-900 px-4 py-2 text-sm text-white dark:bg-white dark:text-neutral-900 sm:col-span-2 lg:col-span-4">Enregistrer en comptabilité</button>
    </form>
  );
}
