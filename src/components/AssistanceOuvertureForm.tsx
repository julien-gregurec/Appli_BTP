"use client";

import { useMemo, useState } from "react";

/**
 * Formulaire d'ouverture d'une session d'assistance.
 *
 * Client component parce que trois règles doivent être visibles AVANT l'envoi :
 * la liste des applications dépend de l'entreprise choisie, le détail du motif est
 * exigé par certaines catégories, et la durée est bornée par le périmètre. Le serveur
 * revérifie tout : ce composant rend les règles lisibles, il ne les applique pas.
 */

type Entreprise = { id: string; nom: string };
type Application = { code: string; nom: string };
type Motif = { cle: string; libelle: string; detailRequis: boolean; libellePublic: string };
type Perimetre = {
  cle: string;
  libelle: string;
  description: string;
  dureeMaximaleMinutes: number;
  confirmationRenforcee: boolean;
};

const champ =
  "rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export function AssistanceOuvertureForm({
  action,
  entreprises,
  applications,
  abonnements,
  motifs,
  perimetres,
  durees,
}: {
  action: (formData: FormData) => void | Promise<void>;
  entreprises: Entreprise[];
  applications: Application[];
  abonnements: Record<string, string[]>;
  motifs: Motif[];
  perimetres: Perimetre[];
  durees: number[];
}) {
  const [entrepriseId, setEntrepriseId] = useState("");
  const [choisies, setChoisies] = useState<string[]>([]);
  const [motifCle, setMotifCle] = useState(motifs[0]?.cle ?? "");
  const [perimetreCle, setPerimetreCle] = useState(perimetres[0]?.cle ?? "");
  const [duree, setDuree] = useState(durees[0] ?? 15);
  const [incidentGlobal, setIncidentGlobal] = useState(false);

  const abonnees = useMemo(() => abonnements[entrepriseId] ?? [], [abonnements, entrepriseId]);
  const disponibles = applications.filter((a) => abonnees.includes(a.code));
  const motif = motifs.find((m) => m.cle === motifCle);
  const perimetre = perimetres.find((p) => p.cle === perimetreCle);
  const toutesChoisies = disponibles.length > 1 && choisies.length === disponibles.length;
  const confirmationExigee = Boolean(perimetre?.confirmationRenforcee) || incidentGlobal || toutesChoisies;

  function basculer(code: string) {
    setChoisies((actuelles) =>
      actuelles.includes(code) ? actuelles.filter((c) => c !== code) : [...actuelles, code],
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="abonnees" value={abonnees.join(",")} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Entreprise</span>
          <select
            name="entrepriseId"
            value={entrepriseId}
            onChange={(e) => {
              setEntrepriseId(e.target.value);
              setChoisies([]);
            }}
            className={`${champ} w-full`}
            required
          >
            <option value="">Sélectionner…</option>
            {entreprises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium">Ticket de support (facultatif)</span>
          <input name="ticket" className={`${champ} w-full`} placeholder="SUP-1234" />
        </label>
      </div>

      <fieldset className="space-y-1 text-sm">
        <legend className="font-medium">Applications concernées</legend>
        {entrepriseId === "" ? (
          <p className="text-neutral-500">Sélectionnez d’abord une entreprise.</p>
        ) : disponibles.length === 0 ? (
          <p className="text-neutral-500">
            Cette entreprise n’utilise aucune application susceptible d’assistance.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {disponibles.map((a) => (
              <label key={a.code} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="applications"
                  value={a.code}
                  checked={choisies.includes(a.code)}
                  onChange={() => basculer(a.code)}
                />
                {a.nom}
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-neutral-500">
          Une session ouverte sur une application n’en ouvre aucune autre.
        </p>
      </fieldset>

      {disponibles.length > 1 && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="incidentGlobal"
            checked={incidentGlobal}
            onChange={(e) => setIncidentGlobal(e.target.checked)}
            className="mt-1"
          />
          <span>
            Incident global — nécessaire pour sélectionner toutes les applications de
            l’entreprise en une seule session.
          </span>
        </label>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Motif</span>
          <select
            name="motifCategorie"
            value={motifCle}
            onChange={(e) => setMotifCle(e.target.value)}
            className={`${champ} w-full`}
            required
          >
            {motifs.map((m) => (
              <option key={m.cle} value={m.cle}>
                {m.libelle}
              </option>
            ))}
          </select>
          {motif && (
            <span className="block text-xs text-neutral-500">
              Le client verra : « {motif.libellePublic} ».
            </span>
          )}
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium">
            Détail interne {motif?.detailRequis ? "(obligatoire)" : "(facultatif)"}
          </span>
          <input
            name="motifDetail"
            className={`${champ} w-full`}
            required={motif?.detailRequis}
            minLength={motif?.detailRequis ? 10 : undefined}
            placeholder="Ce texte reste interne à ELSATIA"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Périmètre</span>
          <select
            name="perimetre"
            value={perimetreCle}
            onChange={(e) => {
              setPerimetreCle(e.target.value);
              const max = perimetres.find((p) => p.cle === e.target.value)?.dureeMaximaleMinutes ?? 60;
              setDuree((d) => Math.min(d, max));
            }}
            className={`${champ} w-full`}
          >
            {perimetres.map((p) => (
              <option key={p.cle} value={p.cle}>
                {p.libelle}
              </option>
            ))}
          </select>
          {perimetre && <span className="block text-xs text-neutral-500">{perimetre.description}</span>}
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium">Durée</span>
          <div className="flex items-center gap-2">
            <select
              value={durees.includes(duree) ? String(duree) : "libre"}
              onChange={(e) => {
                if (e.target.value !== "libre") setDuree(Number(e.target.value));
              }}
              className={champ}
            >
              {durees.map((d) => (
                <option key={d} value={d}>
                  {d} min
                </option>
              ))}
              <option value="libre">Durée personnalisée</option>
            </select>
            <input
              type="number"
              name="dureeMinutes"
              value={duree}
              onChange={(e) => setDuree(Number(e.target.value))}
              min={5}
              max={perimetre?.dureeMaximaleMinutes ?? 60}
              className={`${champ} w-24`}
              required
            />
          </div>
          {perimetre && (
            <span className="block text-xs text-neutral-500">
              Maximum {perimetre.dureeMaximaleMinutes} min pour ce périmètre.
            </span>
          )}
        </label>
      </div>

      {confirmationExigee && (
        <label className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <input type="checkbox" name="confirmationRenforcee" className="mt-1" required />
          <span>
            Confirmation renforcée : je confirme que cette intervention exceptionnelle est
            justifiée, que le client en sera informé et que toutes mes actions seront
            journalisées à mon nom.
          </span>
        </label>
      )}

      <p className="text-xs text-neutral-500">
        Aucun mot de passe client n’est demandé ni utilisé. Vous restez identifié comme
        intervenant ELSATIA pendant toute la session, et l’entreprise est prévenue dès son
        ouverture.
      </p>

      <button
        type="submit"
        disabled={entrepriseId === "" || choisies.length === 0}
        className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Ouvrir la session d’assistance
      </button>
    </form>
  );
}
