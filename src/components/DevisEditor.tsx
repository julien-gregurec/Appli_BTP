"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LIGNE_TYPES, UNITES, TAUX_TVA, euros, calcTotaux, type LigneDevis } from "@/lib/devis";
import { prestationVersLigne, type PrestationCatalogue } from "@/lib/prestations";
import { creerDevisAction, modifierDevisAction } from "@/app/actions/devis";
import { creerPrestationDepuisLigneAction } from "@/app/actions/prestations";
import { creerClientRapideAction } from "@/app/actions/clients";

type Option = { id: string; label: string };
type DevisInitial = {
  id: string;
  client_id: string;
  chantier_id: string | null;
  date_validite: string | null;
  remise_globale: number;
  notes_client: string | null;
  lignes: LigneDevis[];
};

const input = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const label = "text-sm font-medium";

function ligneVide(): LigneDevis {
  return {
    designation: "",
    description: null,
    type: "fourniture",
    quantite: 1,
    unite: "u",
    prix_unitaire_ht: 0,
    remise_ligne: 0,
    taux_tva: 20,
  };
}

export function DevisEditor({
  clients,
  chantiers,
  prestations: prestationsInitiales,
  clientPreselect,
  chantierPreselect,
  devisInitial,
}: {
  clients: Option[];
  chantiers: { id: string; label: string; client_id: string }[];
  prestations: PrestationCatalogue[];
  clientPreselect?: string;
  chantierPreselect?: string;
  devisInitial?: DevisInitial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const [clientsListe, setClientsListe] = useState(clients);
  const [clientId, setClientId] = useState(devisInitial?.client_id ?? clientPreselect ?? "");
  const [nouveauClientOuvert, setNouveauClientOuvert] = useState(clients.length === 0);
  const [nc, setNc] = useState({ type: "particulier", nom: "", prenom: "", societe: "", telephone: "", email: "", code_postal: "", ville: "" });
  const [ncErreur, setNcErreur] = useState<string | null>(null);
  const [chantierId, setChantierId] = useState(devisInitial?.chantier_id ?? chantierPreselect ?? "");
  const [dateValidite, setDateValidite] = useState(devisInitial?.date_validite ?? "");
  const [remiseGlobale, setRemiseGlobale] = useState(Number(devisInitial?.remise_globale ?? 0));
  const [notesClient, setNotesClient] = useState(devisInitial?.notes_client ?? "");
  const [lignes, setLignes] = useState<LigneDevis[]>(devisInitial?.lignes.length ? devisInitial.lignes : [ligneVide()]);
  const [prestations, setPrestations] = useState(prestationsInitiales);
  const [messageCatalogue, setMessageCatalogue] = useState<string | null>(null);

  const chantiersFiltres = chantiers.filter((c) => c.client_id === clientId);
  const totaux = calcTotaux(lignes, remiseGlobale);

  function majLigne(i: number, champ: keyof LigneDevis, valeur: string | number) {
    setLignes((prev) => prev.map((l, idx) => (idx === i ? { ...l, [champ]: valeur } : l)));
  }

  function choisirPrestation(id: string) {
    if (!id) return;
    const prestation = prestations.find((p) => p.id === id);
    if (!prestation) return;
    setLignes((prev) => [
      ...prev.filter((l) => l.designation.trim() !== ""),
      prestationVersLigne(prestation),
    ]);
    setMessageCatalogue(null);
  }

  function enregistrerPrestation(i: number) {
    setMessageCatalogue(null);
    startTransition(async () => {
      const res = await creerPrestationDepuisLigneAction(lignes[i]);
      if (res.error) setMessageCatalogue(res.error);
      if (res.prestation) {
        setPrestations((prev) => [...prev, res.prestation!].sort((a, b) => a.designation.localeCompare(b.designation, "fr")));
        setMessageCatalogue(`« ${res.prestation.designation} » est maintenant réutilisable.`);
      }
    });
  }

  function creerClient() {
    setNcErreur(null);
    startTransition(async () => {
      const res = await creerClientRapideAction({
        type: nc.type,
        nom: nc.nom,
        prenom: nc.prenom,
        societe: nc.societe,
        telephone: nc.telephone,
        email: nc.email,
        code_postal: nc.code_postal,
        ville: nc.ville,
      });
      if ("error" in res) {
        setNcErreur(res.error);
        return;
      }
      setClientsListe((prev) => [{ id: res.id, label: res.label }, ...prev]);
      setClientId(res.id);
      setChantierId("");
      setNouveauClientOuvert(false);
      setNc({ type: "particulier", nom: "", prenom: "", societe: "", telephone: "", email: "", code_postal: "", ville: "" });
    });
  }

  function soumettre() {
    setErreur(null);
    if (!clientId) {
      setErreur("Choisis un client.");
      return;
    }
    startTransition(async () => {
      const payload = {
        client_id: clientId,
        chantier_id: chantierId || null,
        date_emission: null,
        date_validite: dateValidite || null,
        conditions: null,
        notes_client: notesClient || null,
        notes_internes: null,
        remise_globale: remiseGlobale,
        lignes,
      };
      const res = devisInitial
        ? await modifierDevisAction(devisInitial.id, payload)
        : await creerDevisAction(payload);
      if (res.error) {
        setErreur(res.error);
      } else if (res.id) {
        router.push(`/devis/${res.id}`);
      }
    });
  }

  return (
    <div className="space-y-6">
      {erreur && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className={label}>Client</label>
            <button type="button" onClick={() => setNouveauClientOuvert((v) => !v)} className="text-sm text-neutral-600 hover:underline dark:text-neutral-400">
              {nouveauClientOuvert ? "Choisir dans la liste" : "+ Nouveau client"}
            </button>
          </div>
          {!nouveauClientOuvert && (
            <select
              value={clientId}
              onChange={(e) => { setClientId(e.target.value); setChantierId(""); }}
              className={input + " w-full"}
            >
              <option value="">— Choisir un client —</option>
              {clientsListe.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          )}
        </div>
        <div className="space-y-1">
          <label className={label}>Chantier (optionnel)</label>
          <select value={chantierId} onChange={(e) => setChantierId(e.target.value)} disabled={!clientId} className={input + " w-full"}>
            <option value="">—</option>
            {chantiersFiltres.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
      </div>

      {nouveauClientOuvert && (
        <div className="space-y-3 rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900/50">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Nouveau client</span>
            <select value={nc.type} onChange={(e) => setNc({ ...nc, type: e.target.value })} className={input}>
              <option value="particulier">Particulier</option>
              <option value="professionnel">Professionnel</option>
              <option value="collectivite">Collectivité</option>
            </select>
          </div>
          {ncErreur && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{ncErreur}</p>}
          <div className="grid grid-cols-2 gap-3">
            {nc.type !== "particulier" && (
              <input placeholder="Société" value={nc.societe} onChange={(e) => setNc({ ...nc, societe: e.target.value })} className={input + " col-span-2"} />
            )}
            <input placeholder="Nom" value={nc.nom} onChange={(e) => setNc({ ...nc, nom: e.target.value })} className={input} />
            <input placeholder="Prénom" value={nc.prenom} onChange={(e) => setNc({ ...nc, prenom: e.target.value })} className={input} />
            <input placeholder="Téléphone" value={nc.telephone} onChange={(e) => setNc({ ...nc, telephone: e.target.value })} className={input} />
            <input placeholder="Email" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} className={input} />
            <input placeholder="Code postal" value={nc.code_postal} onChange={(e) => setNc({ ...nc, code_postal: e.target.value })} className={input} />
            <input placeholder="Ville" value={nc.ville} onChange={(e) => setNc({ ...nc, ville: e.target.value })} className={input} />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={creerClient} disabled={pending} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900">
              {pending ? "Création…" : "Créer et sélectionner"}
            </button>
            {clientsListe.length > 0 && (
              <button type="button" onClick={() => { setNouveauClientOuvert(false); setNcErreur(null); }} className="text-sm text-neutral-500 hover:underline">Annuler</button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className={label}>Date de validité</label>
          <input type="date" value={dateValidite} onChange={(e) => setDateValidite(e.target.value)} className={input + " w-full"} />
        </div>
        <div className="space-y-1">
          <label className={label}>Remise globale (%)</label>
          <input type="number" min={0} max={100} step={0.5} value={remiseGlobale} onChange={(e) => setRemiseGlobale(Number(e.target.value))} className={input + " w-full"} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className={label}>Lignes de prestations</label>
          <button type="button" onClick={() => setLignes((p) => [...p, ligneVide()])} className="text-sm text-neutral-600 hover:underline dark:text-neutral-400">
            + Ajouter une ligne
          </button>
        </div>

        <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900/50">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="prestation-catalogue" className="text-sm font-medium">Insérer une prestation</label>
            <select id="prestation-catalogue" value="" onChange={(e) => choisirPrestation(e.target.value)} className={input + " min-w-64 flex-1"}>
              <option value="">— Choisir une prestation —</option>
              {prestations.map((p) => (
                <option key={p.id} value={p.id}>{p.designation} · {euros(p.prix_unitaire_ht)} HT/{p.unite}</option>
              ))}
            </select>
          </div>
          {prestations.length === 0 && <p className="mt-2 text-xs text-neutral-500">Le catalogue est vide. Remplissez une ligne puis cliquez sur « Enregistrer ».</p>}
          {messageCatalogue && <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">{messageCatalogue}</p>}
        </div>

        <div className="space-y-3">
          {lignes.map((l, i) => {
            const ligneHt = l.quantite * l.prix_unitaire_ht * (1 - l.remise_ligne / 100);
            return (
              <div key={i} className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
                <div className="flex gap-2">
                  <input
                    placeholder="Désignation"
                    value={l.designation}
                    onChange={(e) => majLigne(i, "designation", e.target.value)}
                    className={input + " flex-1"}
                  />
                  <select value={l.type} onChange={(e) => majLigne(i, "type", e.target.value)} className={input}>
                    {LIGNE_TYPES.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}
                  </select>
                  <button type="button" onClick={() => enregistrerPrestation(i)} disabled={pending || !l.designation.trim()} className="px-2 text-xs text-neutral-500 hover:underline disabled:opacity-40" title="Ajouter cette ligne au catalogue">Enregistrer</button>
                  {lignes.length > 1 && (
                    <button type="button" onClick={() => setLignes((p) => p.filter((_, idx) => idx !== i))} className="px-2 text-neutral-400 hover:text-red-600" title="Supprimer">×</button>
                  )}
                </div>
                <textarea
                  rows={2}
                  placeholder="Description détaillée de la prestation (visible sur le devis)"
                  value={l.description ?? ""}
                  onChange={(e) => majLigne(i, "description", e.target.value)}
                  className={input + " mt-2 w-full resize-y"}
                />
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <input type="number" step="0.01" value={l.quantite} onChange={(e) => majLigne(i, "quantite", Number(e.target.value))} className={input + " w-20"} title="Quantité" />
                  <select value={l.unite} onChange={(e) => majLigne(i, "unite", e.target.value)} className={input} title="Unité">
                    {UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <span className="text-neutral-400">×</span>
                  <input type="number" step="0.01" value={l.prix_unitaire_ht} onChange={(e) => majLigne(i, "prix_unitaire_ht", Number(e.target.value))} className={input + " w-28"} title="Prix unitaire HT" />
                  <span className="text-neutral-400">€ HT</span>
                  <span className="text-neutral-400">· remise</span>
                  <input type="number" min={0} max={100} value={l.remise_ligne} onChange={(e) => majLigne(i, "remise_ligne", Number(e.target.value))} className={input + " w-16"} title="Remise ligne %" />
                  <span className="text-neutral-400">%</span>
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
        <label className={label}>Conditions / notes visibles client</label>
        <textarea rows={2} value={notesClient} onChange={(e) => setNotesClient(e.target.value)} className={input + " w-full"} />
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

      <button
        type="button"
        onClick={soumettre}
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {pending ? "Enregistrement…" : devisInitial ? "Enregistrer les modifications" : "Créer le devis (brouillon)"}
      </button>
    </div>
  );
}
