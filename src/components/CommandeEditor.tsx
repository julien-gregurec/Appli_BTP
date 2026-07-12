"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { euros, UNITES, TAUX_TVA } from "@/lib/devis";
import { totauxCommande, type LigneCommande } from "@/lib/commandes";
import { creerCommandeAction, creerFournisseurRapideAction } from "@/app/actions/commandes";

type Option = { id: string; label: string };

const input = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const label = "text-sm font-medium";

function ligneVide(): LigneCommande {
  return { designation: "", description: null, quantite: 1, unite: "u", prix_unitaire_ht: 0, taux_tva: 20 };
}

export function CommandeEditor({
  fournisseurs,
  chantiers,
}: {
  fournisseurs: Option[];
  chantiers: Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const [fournisseursListe, setFournisseursListe] = useState(fournisseurs);
  const [fournisseurId, setFournisseurId] = useState("");
  const [chantierId, setChantierId] = useState("");
  const [dateCommande, setDateCommande] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date()));
  const [dateLivraison, setDateLivraison] = useState("");
  const [notes, setNotes] = useState("");
  const [lignes, setLignes] = useState<LigneCommande[]>([ligneVide()]);

  const [nouveauOuvert, setNouveauOuvert] = useState(fournisseurs.length === 0);
  const [nf, setNf] = useState({ nom: "", contact_nom: "", telephone: "", email: "", ville: "" });
  const [nfErreur, setNfErreur] = useState<string | null>(null);

  const totaux = totauxCommande(lignes.filter((ligne) => ligne.designation.trim() !== ""));

  function majLigne(i: number, champ: keyof LigneCommande, valeur: string | number) {
    setLignes((prev) => prev.map((l, idx) => (idx === i ? { ...l, [champ]: valeur } : l)));
  }

  function creerFournisseur() {
    setNfErreur(null);
    startTransition(async () => {
      const res = await creerFournisseurRapideAction(nf);
      if ("error" in res) {
        setNfErreur(res.error);
        return;
      }
      setFournisseursListe((prev) => [{ id: res.id, label: res.label }, ...prev]);
      setFournisseurId(res.id);
      setNouveauOuvert(false);
      setNf({ nom: "", contact_nom: "", telephone: "", email: "", ville: "" });
    });
  }

  function soumettre() {
    setErreur(null);
    if (!fournisseurId) {
      setErreur("Choisis un fournisseur.");
      return;
    }
    startTransition(async () => {
      const res = await creerCommandeAction({
        fournisseur_id: fournisseurId,
        chantier_id: chantierId || null,
        date_commande: dateCommande || null,
        date_livraison_prevue: dateLivraison || null,
        notes: notes || null,
        lignes,
      });
      if ("error" in res) setErreur(res.error);
      else router.push(`/commandes/${res.id}`);
    });
  }

  return (
    <div className="space-y-6">
      {erreur && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className={label}>Fournisseur</label>
            <button type="button" onClick={() => setNouveauOuvert((v) => !v)} className="text-sm text-neutral-600 hover:underline dark:text-neutral-400">
              {nouveauOuvert ? "Choisir dans la liste" : "+ Nouveau fournisseur"}
            </button>
          </div>
          {!nouveauOuvert && (
            <select value={fournisseurId} onChange={(e) => setFournisseurId(e.target.value)} className={input + " w-full"}>
              <option value="">— Choisir un fournisseur —</option>
              {fournisseursListe.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          )}
        </div>
        <div className="space-y-1">
          <label className={label}>Chantier (optionnel)</label>
          <select value={chantierId} onChange={(e) => setChantierId(e.target.value)} className={input + " w-full"}>
            <option value="">—</option>
            {chantiers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
      </div>

      {nouveauOuvert && (
        <div className="space-y-3 rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900/50">
          <span className="text-sm font-medium">Nouveau fournisseur</span>
          {nfErreur && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{nfErreur}</p>}
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Nom / raison sociale" value={nf.nom} onChange={(e) => setNf({ ...nf, nom: e.target.value })} className={input + " col-span-2"} />
            <input placeholder="Contact" value={nf.contact_nom} onChange={(e) => setNf({ ...nf, contact_nom: e.target.value })} className={input} />
            <input placeholder="Téléphone" value={nf.telephone} onChange={(e) => setNf({ ...nf, telephone: e.target.value })} className={input} />
            <input placeholder="Email" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} className={input} />
            <input placeholder="Ville" value={nf.ville} onChange={(e) => setNf({ ...nf, ville: e.target.value })} className={input} />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={creerFournisseur} disabled={pending} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900">
              {pending ? "Création…" : "Créer et sélectionner"}
            </button>
            {fournisseursListe.length > 0 && (
              <button type="button" onClick={() => { setNouveauOuvert(false); setNfErreur(null); }} className="text-sm text-neutral-500 hover:underline">Annuler</button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className={label}>Date de commande</label>
          <input type="date" value={dateCommande} onChange={(e) => setDateCommande(e.target.value)} className={input + " w-full"} />
        </div>
        <div className="space-y-1">
          <label className={label}>Livraison prévue (optionnel)</label>
          <input type="date" value={dateLivraison} onChange={(e) => setDateLivraison(e.target.value)} className={input + " w-full"} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className={label}>Lignes de la commande</label>
          <button type="button" onClick={() => setLignes((p) => [...p, ligneVide()])} className="text-sm text-neutral-600 hover:underline dark:text-neutral-400">
            + Ajouter une ligne
          </button>
        </div>
        <div className="space-y-3">
          {lignes.map((l, i) => {
            const ligneHt = l.quantite * l.prix_unitaire_ht;
            return (
              <div key={i} className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
                <div className="flex gap-2">
                  <input placeholder="Désignation" value={l.designation} onChange={(e) => majLigne(i, "designation", e.target.value)} className={input + " flex-1"} />
                  {lignes.length > 1 && (
                    <button type="button" onClick={() => setLignes((p) => p.filter((_, idx) => idx !== i))} className="px-2 text-neutral-400 hover:text-red-600" title="Supprimer">×</button>
                  )}
                </div>
                <textarea rows={2} placeholder="Description / référence fournisseur" value={l.description ?? ""} onChange={(e) => majLigne(i, "description", e.target.value)} className={input + " mt-2 w-full"} />
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <input type="number" step="0.01" value={l.quantite} onChange={(e) => majLigne(i, "quantite", Number(e.target.value))} className={input + " w-20"} title="Quantité" />
                  <select value={l.unite} onChange={(e) => majLigne(i, "unite", e.target.value)} className={input} title="Unité">
                    {UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <span className="text-neutral-400">×</span>
                  <input type="number" step="0.01" value={l.prix_unitaire_ht} onChange={(e) => majLigne(i, "prix_unitaire_ht", Number(e.target.value))} className={input + " w-28"} title="Prix unitaire HT" />
                  <span className="text-neutral-400">€ HT</span>
                  <span className="text-neutral-400">· TVA</span>
                  <select value={l.taux_tva} onChange={(e) => majLigne(i, "taux_tva", Number(e.target.value))} className={input} title="Taux TVA">
                    {TAUX_TVA.map((t) => <option key={t} value={t}>{t} %</option>)}
                  </select>
                  <span className="ml-auto font-mono text-neutral-600 dark:text-neutral-300">{euros(ligneHt)} HT</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <label className={label}>Notes internes (optionnel)</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={input + " w-full"} />
      </div>

      <div className="flex items-center justify-between rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="font-mono text-sm text-neutral-600 dark:text-neutral-300">
          <div>Total HT : {euros(totaux.ht)}</div>
          <div>TVA : {euros(totaux.tva)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-neutral-500">Total TTC</div>
          <div className="font-mono text-xl font-semibold">{euros(totaux.ttc)}</div>
        </div>
      </div>

      <button type="button" onClick={soumettre} disabled={pending} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900">
        {pending ? "Enregistrement…" : "Créer la commande (brouillon)"}
      </button>
    </div>
  );
}
