"use client";

import { useState, useTransition } from "react";
import { ignorerAlerteOperationnelleAction, retablirAlerteOperationnelleAction } from "@/app/actions/alertes";
import { Lien as Link } from "@/components/Lien";

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
};

export function CentreAlertesOperationnelles({ alertes, alertesIgnorees }: Props) {
  const [afficherIgnorees, setAfficherIgnorees] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, startTransition] = useTransition();
  const nbCritiques = alertes.filter((alerte) => alerte.niveau === "critique").length;
  const domaines = [...new Set(alertes.map((alerte) => alerte.domaine))];

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

  return (
    <section className={`rounded-md border p-4 ${alertes.length ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30" : "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Centre d’alertes opérationnelles</h2>
          <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
            Ouvrez l’élément pour le traiter, ou ignorez l’alerte si elle ne vous concerne pas.
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

      {erreur && <p className="mt-3 rounded-md bg-red-100 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{erreur}</p>}

      {alertes.length ? (
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {alertes.map((alerte) => (
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
                    <button
                      type="button"
                      disabled={enCours}
                      onClick={() => ignorer(alerte)}
                      className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
                    >
                      Ignorer
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
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
    </section>
  );
}
