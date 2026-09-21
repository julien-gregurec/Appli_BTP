"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { VisionneusePlan, type ReperePlan } from "@/components/VisionneusePlan";
import { VisionneusePlanPdf } from "@/components/VisionneusePlanPdf";

export type PlanChoisissable = {
  id: string;
  nom: string;
  niveau: string | null;
  zone: string | null;
  url: string | null;
  image: boolean;
  pdf: boolean;
  nbPages: number | null;
};

export type ReperePlace = ReperePlan & { planId: string; page: number };

/**
 * Repérage d'un chantier : choix du plan, de la page, visualisation, et création d'une
 * réserve à l'endroit touché.
 *
 * Les deux visionneuses — image et PDF — partagent le même contrat de coordonnées : une
 * fraction de document dans [0,1], plus une page. Pour une image, la page vaut toujours 1.
 * Le formulaire de constat reçoit donc les mêmes paramètres dans les deux cas, et reste
 * rendu côté serveur.
 */
export function PlanChantier({
  chantierId,
  plans,
  reperes,
  peutEmettre,
  enregistrerPagination,
}: {
  chantierId: string;
  plans: PlanChoisissable[];
  reperes: ReperePlace[];
  peutEmettre: boolean;
  enregistrerPagination?: (planId: string, nbPages: number) => Promise<void>;
}) {
  const router = useRouter();
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [page, setPage] = useState(1);
  const [pointage, setPointage] = useState(false);

  const plan = plans.find((p) => p.id === planId) ?? null;
  const reperesDuPlan = useMemo(
    () => reperes.filter((r) => r.planId === planId && r.page === page),
    [reperes, planId, page],
  );
  const reperesImage = useMemo(
    () => reperes.filter((r) => r.planId === planId),
    [reperes, planId],
  );

  function versConstat(position: { x: number; y: number; page: number }) {
    router.push(
      `/chantiers/${chantierId}/nouvelle-reserve?plan=${planId}`
      + `&page=${position.page}&x=${position.x}&y=${position.y}`,
    );
  }

  if (plans.length === 0) {
    return (
      <p className="vide">
        Aucun plan sur ce chantier. Ajoutez-en un pour situer les réserves.
      </p>
    );
  }

  const repereAffichable = plan?.image || plan?.pdf;

  return (
    <>
      <div className="barre-plan">
        <label className="sans-marge">
          Plan
          <select
            value={planId}
            onChange={(e) => { setPlanId(e.target.value); setPage(1); setPointage(false); }}
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}{p.niveau ? ` — ${p.niveau}` : ""}{p.zone ? ` / ${p.zone}` : ""}
                {p.pdf ? " (PDF)" : ""}
              </option>
            ))}
          </select>
        </label>
        {peutEmettre && repereAffichable && plan?.url && (
          <button
            type="button"
            className={pointage ? "bouton danger" : "bouton"}
            onClick={() => setPointage((v) => !v)}
          >
            {pointage ? "Annuler le pointage" : "Placer une réserve"}
          </button>
        )}
      </div>

      {plan && !plan.url && (
        <p className="message">
          Aucun document n’est rattaché à ce plan. Les repères déjà pointés restent
          enregistrés ; seul leur fond manque.
        </p>
      )}

      {plan?.pdf && plan.url && (
        <VisionneusePlanPdf
          source={plan.url}
          planId={plan.id}
          page={page}
          onPage={setPage}
          reperes={reperesDuPlan}
          pointage={pointage}
          onPointage={versConstat}
          onPagination={(id, nbPages) => {
            // Le nombre de pages n'est connu qu'après ouverture du document : on le
            // renvoie à la base une seule fois, quand il diffère de ce qu'elle sait.
            if (enregistrerPagination && nbPages !== plan.nbPages) {
              void enregistrerPagination(id, nbPages);
            }
          }}
        />
      )}

      {!plan?.pdf && (
        <VisionneusePlan
          source={plan?.image ? plan.url : null}
          reperes={reperesImage}
          pointage={pointage}
          onPointage={(position) => versConstat({ ...position, page: 1 })}
        />
      )}
    </>
  );
}
