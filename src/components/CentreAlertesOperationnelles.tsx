"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  deleguerAlerteOperationnelleAction,
  ignorerAlerteOperationnelleAction,
  retablirAlerteOperationnelleAction,
} from "@/app/actions/alertes";
import { Lien as Link } from "@/components/Lien";
import { DOMAINE_VERS_PERMISSION_DELEGATION, type DelegationAlerte, type EmployeDelegable } from "@/lib/alertes-delegation";

export type AlerteOperationnelle = {
  id: string;
  domaine: string;
  niveau: "critique" | "attention";
  titre: string;
  detail: string;
  href: string;
  date?: string;
  signature: string;
};

type Props = {
  alertes: AlerteOperationnelle[];
  alertesIgnorees: AlerteOperationnelle[];
  domainesAutorisesDelegation?: string[];
  employesDelegables?: EmployeDelegable[];
  delegations?: Record<string, DelegationAlerte>;
  employeCourantId?: string | null;
  utilisateurCourantId?: string;
};

type Filtre = "toutes" | "mes_alertes" | "deleguees_par_moi";

export function CentreAlertesOperationnelles({
  alertes,
  alertesIgnorees,
  domainesAutorisesDelegation = [],
  employesDelegables = [],
  delegations = {},
  employeCourantId = null,
  utilisateurCourantId,
}: Props) {
  const [afficherIgnorees, setAfficherIgnorees] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, startTransition] = useTransition();
  const [alerteEnDelegation, setAlerteEnDelegation] = useState<AlerteOperationnelle | null>(null);
  const [filtre, setFiltre] = useState<Filtre>("toutes");
  const nbCritiques = alertes.filter((alerte) => alerte.niveau === "critique").length;
  const domaines = [...new Set(alertes.map((alerte) => alerte.domaine))];
  const yADesDelegations = Object.keys(delegations).length > 0;

  function ignorer(alerte: AlerteOperationnelle) {
    setErreur(null);
    startTransition(async () => {
      const resultat = await ignorerAlerteOperationnelleAction(
        alerte.id,
        alerte.signature,
        alerte.titre,
      );
      if (!resultat.ok) setErreur(resultat.error);
    });
  }

  function retablir(alerte: AlerteOperationnelle) {
    setErreur(null);
    startTransition(async () => {
      const resultat = await retablirAlerteOperationnelleAction(alerte.id);
      if (!resultat.ok) setErreur(resultat.error);
    });
  }

  const alertesAffichees = useMemo(() => {
    if (filtre === "mes_alertes") {
      return alertes.filter((alerte) => employeCourantId && delegations[alerte.id]?.employeId === employeCourantId);
    }
    if (filtre === "deleguees_par_moi") {
      return alertes.filter((alerte) => utilisateurCourantId && delegations[alerte.id]?.delegueParUserId === utilisateurCourantId);
    }
    return alertes;
  }, [alertes, delegations, employeCourantId, filtre, utilisateurCourantId]);

  return (
    <section className={`rounded-md border p-4 ${alertes.length ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30" : "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Centre d’alertes opérationnelles</h2>
          <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
            Ouvrez l’élément pour le traiter, déléguez-le à un collègue, ou ignorez l’alerte si elle ne vous concerne pas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-red-100 px-2 py-1 text-red-700 dark:bg-red-950 dark:text-red-300">
            {nbCritiques} critique{nbCritiques > 1 ? "s" : ""}
          </span>
          <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            {alertes.length - nbCritiques} à anticiper
          </span>
          {alertesIgnorees.length > 0 && (
            <button
              type="button"
              className="rounded-full border border-neutral-300 bg-white px-2 py-1 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
              onClick={() => setAfficherIgnorees((valeur) => !valeur)}
            >
              {alertesIgnorees.length} ignorée{alertesIgnorees.length > 1 ? "s" : ""} · {afficherIgnorees ? "Masquer" : "Afficher"}
            </button>
          )}
        </div>
      </div>

      {yADesDelegations && (
        <div className="mt-3 flex flex-wrap gap-1 text-xs" role="group" aria-label="Filtrer les alertes">
          {([
            ["toutes", "Toutes"],
            ["mes_alertes", "Mes alertes"],
            ["deleguees_par_moi", "Déléguées par moi"],
          ] as [Filtre, string][]).map(([valeur, libelle]) => (
            <button
              key={valeur}
              type="button"
              aria-pressed={filtre === valeur}
              onClick={() => setFiltre(valeur)}
              className={`rounded-full border px-2 py-1 ${filtre === valeur ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"}`}
            >
              {libelle}
            </button>
          ))}
        </div>
      )}

      {erreur && <p className="mt-3 rounded-md bg-red-100 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{erreur}</p>}

      {alertes.length ? (
        alertesAffichees.length ? (
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {alertesAffichees.map((alerte) => {
              const delegation = delegations[alerte.id];
              const peutDeleguer = domainesAutorisesDelegation.includes(alerte.domaine);
              return (
                <article key={alerte.id} className="rounded-md border border-black/5 bg-white/70 p-3 text-sm dark:border-white/10 dark:bg-black/20">
                  <div className="flex items-start gap-3">
                    <span className={`mt-1 h-2.5 w-2.5 flex-none rounded-full ${alerte.niveau === "critique" ? "bg-red-600" : "bg-amber-500"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <strong className="min-w-0">{alerte.titre}</strong>
                        <span className="flex-none text-[10px] uppercase tracking-wide text-neutral-500">{alerte.domaine}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
                        {alerte.detail}{alerte.date ? ` · ${alerte.date}` : ""}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link href={alerte.href} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">
                          Ouvrir et traiter
                        </Link>
                        {peutDeleguer && (
                          <button
                            type="button"
                            disabled={enCours}
                            onClick={() => setAlerteEnDelegation(alerte)}
                            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
                          >
                            {delegation ? "Réassigner" : "Déléguer"}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={enCours}
                          onClick={() => ignorer(alerte)}
                          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
                        >
                          Ignorer
                        </button>
                      </div>
                      {delegation && (
                        <p className="mt-2 text-[11px] text-neutral-500">
                          Déléguée à : <strong className="text-neutral-700 dark:text-neutral-300">{delegation.employePrenom} {delegation.employeNom}</strong>
                          {delegation.deleguePar && ` · par ${delegation.deleguePar}`}
                          {" · "}
                          {new Date(delegation.delegueAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">Aucune alerte ne correspond à ce filtre.</p>
        )
      ) : (
        <p className="mt-3 text-sm text-green-800 dark:text-green-300">
          Aucune alerte active. Toutes les échéances suivies sont sous contrôle.
        </p>
      )}

      {afficherIgnorees && alertesIgnorees.length > 0 && (
        <div className="mt-4 border-t border-neutral-300 pt-3 dark:border-neutral-700">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Alertes ignorées pour mon compte</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Une alerte ignorée réapparaît automatiquement si son niveau, sa date ou son contenu change.
          </p>
          <div className="mt-2 space-y-2">
            {alertesIgnorees.map((alerte) => (
              <div key={alerte.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white/60 p-3 text-sm opacity-80 dark:border-neutral-800 dark:bg-black/20">
                <div>
                  <strong>{alerte.titre}</strong>
                  <p className="text-xs text-neutral-500">{alerte.domaine} · {alerte.detail}</p>
                </div>
                <div className="flex gap-2">
                  <Link href={alerte.href} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-white dark:border-neutral-700">Ouvrir</Link>
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() => retablir(alerte)}
                    className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
                  >
                    Rétablir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {domaines.length > 0 && <p className="mt-3 text-xs text-neutral-500">Domaines concernés : {domaines.join(" · ")}</p>}
      <p className="mt-2 text-[11px] text-neutral-500">
        Ignorer ne supprime ni facture, ni échéance, ni donnée métier : cela masque seulement cette alerte pour votre utilisateur.
      </p>

      {alerteEnDelegation && (
        <ModalDelegation
          alerte={alerteEnDelegation}
          employes={employesDelegables.filter((employe) => employe.permissions.includes(DOMAINE_VERS_PERMISSION_DELEGATION[alerteEnDelegation.domaine] ?? ""))}
          delegationActuelle={delegations[alerteEnDelegation.id]}
          onFermer={() => setAlerteEnDelegation(null)}
        />
      )}
    </section>
  );
}

function ModalDelegation({
  alerte,
  employes,
  delegationActuelle,
  onFermer,
}: {
  alerte: AlerteOperationnelle;
  employes: EmployeDelegable[];
  delegationActuelle?: DelegationAlerte;
  onFermer: () => void;
}) {
  const [employeId, setEmployeId] = useState(delegationActuelle?.employeId ?? "");
  const [commentaire, setCommentaire] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const conteneurRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    selectRef.current?.focus();
    function onKeyDown(evenement: KeyboardEvent) {
      if (evenement.key === "Escape") {
        onFermer();
        return;
      }
      if (evenement.key !== "Tab" || !conteneurRef.current) return;
      const focusables = conteneurRef.current.querySelectorAll<HTMLElement>(
        "button, [href], select, textarea, input, [tabindex]:not([tabindex='-1'])",
      );
      if (focusables.length === 0) return;
      const premier = focusables[0];
      const dernier = focusables[focusables.length - 1];
      if (evenement.shiftKey && document.activeElement === premier) {
        evenement.preventDefault();
        dernier.focus();
      } else if (!evenement.shiftKey && document.activeElement === dernier) {
        evenement.preventDefault();
        premier.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onFermer]);

  function envoyer() {
    if (!employeId) {
      setErreur("Sélectionnez un employé.");
      return;
    }
    setErreur(null);
    startTransition(async () => {
      const resultat = await deleguerAlerteOperationnelleAction(
        { id: alerte.id, domaine: alerte.domaine, titre: alerte.titre, href: alerte.href, niveau: alerte.niveau },
        employeId,
        commentaire,
      );
      if (!resultat.ok) {
        setErreur(resultat.error);
        return;
      }
      onFermer();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delegation-titre"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(evenement) => {
        if (evenement.target === evenement.currentTarget) onFermer();
      }}
    >
      <div ref={conteneurRef} className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-neutral-950">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="delegation-titre" className="text-lg font-semibold">Déléguer l’alerte</h2>
            <p className="mt-1 truncate text-sm text-neutral-500" title={alerte.titre}>{alerte.titre}</p>
          </div>
          <button type="button" onClick={onFermer} className="rounded px-2 text-2xl text-neutral-400" aria-label="Fermer">×</button>
        </div>

        <div className="mt-4 space-y-3">
          {erreur && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">{erreur}</p>}

          {employes.length === 0 ? (
            <p className="rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
              Aucun employé disponible pour cette délégation. Vérifiez que quelqu’un dans l’équipe dispose des droits nécessaires sur ce domaine.
            </p>
          ) : (
            <>
              <label className="block text-xs text-neutral-500" htmlFor="delegation-employe">
                Employé
                <select
                  id="delegation-employe"
                  ref={selectRef}
                  value={employeId}
                  onChange={(evenement) => setEmployeId(evenement.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm dark:bg-neutral-900"
                >
                  <option value="">Sélectionner…</option>
                  {employes.map((employe) => (
                    <option key={employe.employeId} value={employe.employeId}>{employe.prenom} {employe.nom}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-neutral-500" htmlFor="delegation-commentaire">
                Commentaire (optionnel)
                <textarea
                  id="delegation-commentaire"
                  rows={3}
                  maxLength={500}
                  value={commentaire}
                  onChange={(evenement) => setCommentaire(evenement.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm dark:bg-neutral-900"
                />
              </label>
            </>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t pt-4 dark:border-neutral-800">
          <button type="button" onClick={onFermer} className="rounded-md border px-3 py-2 text-sm">Annuler</button>
          <button
            type="button"
            disabled={pending || employes.length === 0}
            onClick={envoyer}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {pending ? "Délégation…" : "Déléguer"}
          </button>
        </div>
      </div>
    </div>
  );
}
