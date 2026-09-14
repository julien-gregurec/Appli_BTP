"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { creerClientRapideAction, type ClientRapide } from "@/app/actions/clients";
import { creerChantierRapideAction } from "@/app/actions/chantiers";
import { CLIENT_TYPES } from "@/lib/chantier-statuts";

// Création d'un client ou d'un chantier SANS quitter le devis (attente « Batappli » de Julien) : mini
// formulaire dans un dialogue, création par l'action serveur existante, puis rattachement immédiat au
// brouillon. Le brouillon reste en mémoire pendant tout l'échange : rien n'est perdu, aucune navigation.

export type ClientCree = { id: string; label: string; adresse: string | null; codePostal: string | null; ville: string | null; siret: string | null };
export type ChantierCree = { id: string; label: string; clientId: string };

const champ = "min-h-11 rounded-md border border-neutral-300 bg-white px-3 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const bouton = "inline-flex min-h-11 items-center justify-center rounded-md border border-neutral-300 px-4 text-sm font-medium dark:border-neutral-700";
const principal = "inline-flex min-h-11 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white dark:bg-white dark:text-neutral-900";

function useDialogueOuvert() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); return () => { if (d?.open) d.close(); }; }, []);
  return ref;
}

const TYPES_PRO = new Set(["professionnel", "collectivite", "syndic", "promoteur"]);

export function ClientRapideDialog({ recherche, onCree, onFermer }: { recherche?: string; onCree: (client: ClientCree) => void; onFermer: () => void }) {
  const ref = useDialogueOuvert();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [type, setType] = useState<string>("particulier");
  const pro = TYPES_PRO.has(type);
  const [v, setV] = useState<ClientRapide>({ type: "particulier", nom: pro ? "" : recherche ?? "", societe: pro ? recherche ?? "" : "" });
  const maj = (patch: Partial<ClientRapide>) => setV((c) => ({ ...c, ...patch }));

  const soumettre = () => {
    setErreur(null);
    const nom = (pro ? v.societe : v.nom)?.trim();
    if (!nom) { setErreur(pro ? "Indiquez la raison sociale." : "Indiquez le nom du client."); return; }
    demarrer(async () => {
      const r = await creerClientRapideAction({ ...v, type });
      if ("error" in r) { setErreur(r.error); return; }
      onCree({ id: r.id, label: r.label, adresse: r.adresse ?? null, codePostal: r.codePostal ?? null, ville: r.ville ?? null, siret: r.siret ?? null });
    });
  };

  return (
    <dialog ref={ref} aria-labelledby="client-rapide-titre" onClose={onFermer} className="m-0 h-full max-h-none w-full max-w-none bg-white p-0 backdrop:bg-black/40 dark:bg-neutral-950 sm:m-auto sm:h-auto sm:w-[min(640px,96vw)] sm:rounded-lg" data-testid="dialogue-client-rapide">
      <form className="flex h-full flex-col" onSubmit={(e) => { e.preventDefault(); soumettre(); }}>
        <header className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h2 id="client-rapide-titre" className="text-base font-semibold">Créer ce client</h2>
          <button type="button" onClick={onFermer} className="ml-auto min-h-11 min-w-11 rounded-md text-xl" aria-label="Fermer">×</button>
        </header>
        <div className="grid flex-1 gap-3 overflow-auto p-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">Type
            <select value={type} onChange={(e) => setType(e.target.value)} className={champ}>
              {CLIENT_TYPES.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}
            </select>
          </label>
          {pro ? (
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">Raison sociale *
              <input value={v.societe ?? ""} onChange={(e) => maj({ societe: e.target.value })} autoFocus className={champ} required />
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-sm">Nom *
                <input value={v.nom ?? ""} onChange={(e) => maj({ nom: e.target.value })} autoFocus className={champ} required />
              </label>
              <label className="flex flex-col gap-1 text-sm">Prénom
                <input value={v.prenom ?? ""} onChange={(e) => maj({ prenom: e.target.value })} className={champ} />
              </label>
            </>
          )}
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">Adresse
            <input value={v.adresse_facturation ?? ""} onChange={(e) => maj({ adresse_facturation: e.target.value })} className={champ} autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1 text-sm">Code postal
            <input value={v.code_postal ?? ""} onChange={(e) => maj({ code_postal: e.target.value })} className={champ} inputMode="numeric" />
          </label>
          <label className="flex flex-col gap-1 text-sm">Ville
            <input value={v.ville ?? ""} onChange={(e) => maj({ ville: e.target.value })} className={champ} />
          </label>
          <label className="flex flex-col gap-1 text-sm">Téléphone
            <input value={v.telephone ?? ""} onChange={(e) => maj({ telephone: e.target.value })} className={champ} inputMode="tel" />
          </label>
          <label className="flex flex-col gap-1 text-sm">E-mail
            <input type="email" value={v.email ?? ""} onChange={(e) => maj({ email: e.target.value })} className={champ} />
          </label>
          {pro && (
            <label className="flex flex-col gap-1 text-sm">SIRET
              <input value={v.siret ?? ""} onChange={(e) => maj({ siret: e.target.value })} className={champ} inputMode="numeric" />
            </label>
          )}
          {pro && (
            <label className="flex flex-col gap-1 text-sm">Contact (nom)
              <input value={v.contact_nom ?? ""} onChange={(e) => maj({ contact_nom: e.target.value })} className={champ} placeholder="Personne à contacter" />
            </label>
          )}
          {erreur && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200 sm:col-span-2">{erreur}</p>}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <button type="button" onClick={onFermer} className={bouton}>Annuler</button>
          <button type="submit" disabled={enCours} className={principal}>{enCours ? "Création…" : "Créer et affecter au devis"}</button>
        </footer>
      </form>
    </dialog>
  );
}

export function ChantierRapideDialog({ client, onCree, onFermer }: { client: ClientCree | { id: string; label: string; adresse?: string | null; codePostal?: string | null; ville?: string | null }; onCree: (chantier: ChantierCree) => void; onFermer: () => void }) {
  const ref = useDialogueOuvert();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [adresse, setAdresse] = useState(client.adresse ?? "");
  const [codePostal, setCodePostal] = useState(client.codePostal ?? "");
  const [ville, setVille] = useState(client.ville ?? "");

  const soumettre = () => {
    setErreur(null);
    if (!nom.trim()) { setErreur("Donnez un nom au chantier."); return; }
    demarrer(async () => {
      const r = await creerChantierRapideAction({ client_id: client.id, nom, adresse, code_postal: codePostal, ville });
      if ("error" in r) { setErreur(r.error); return; }
      onCree({ id: r.id, label: r.label, clientId: client.id });
    });
  };

  return (
    <dialog ref={ref} aria-labelledby="chantier-rapide-titre" onClose={onFermer} className="m-0 h-full max-h-none w-full max-w-none bg-white p-0 backdrop:bg-black/40 dark:bg-neutral-950 sm:m-auto sm:h-auto sm:w-[min(560px,96vw)] sm:rounded-lg" data-testid="dialogue-chantier-rapide">
      <form className="flex h-full flex-col" onSubmit={(e) => { e.preventDefault(); soumettre(); }}>
        <header className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h2 id="chantier-rapide-titre" className="text-base font-semibold">Nouveau chantier</h2>
          <button type="button" onClick={onFermer} className="ml-auto min-h-11 min-w-11 rounded-md text-xl" aria-label="Fermer">×</button>
        </header>
        <div className="grid flex-1 gap-3 overflow-auto p-4 sm:grid-cols-2">
          <p className="text-sm text-neutral-600 dark:text-neutral-300 sm:col-span-2">Client : <strong>{client.label}</strong> (prérempli, adresse reprise du client).</p>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">Nom du chantier *
            <input value={nom} onChange={(e) => setNom(e.target.value)} autoFocus className={champ} required placeholder="ex. Rénovation cuisine" />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">Adresse
            <input value={adresse} onChange={(e) => setAdresse(e.target.value)} className={champ} />
          </label>
          <label className="flex flex-col gap-1 text-sm">Code postal
            <input value={codePostal} onChange={(e) => setCodePostal(e.target.value)} className={champ} inputMode="numeric" />
          </label>
          <label className="flex flex-col gap-1 text-sm">Ville
            <input value={ville} onChange={(e) => setVille(e.target.value)} className={champ} />
          </label>
          {erreur && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200 sm:col-span-2">{erreur}</p>}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <button type="button" onClick={onFermer} className={bouton}>Annuler</button>
          <button type="submit" disabled={enCours} className={principal}>{enCours ? "Création…" : "Créer et rattacher au devis"}</button>
        </footer>
      </form>
    </dialog>
  );
}
