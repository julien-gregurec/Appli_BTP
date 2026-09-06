"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { VisionneusePlan, type ReperePlan } from "@/components/VisionneusePlan";

export type PlanChoisissable = {
  id: string;
  nom: string;
  niveau: string | null;
  zone: string | null;
  url: string | null;
  image: boolean;
};

/**
 * Repérage d'un chantier : choix du plan, visualisation, et création d'une réserve à
 * l'endroit touché. Le parcours vise le geste réel du terrain — on voit le désordre, on
 * touche le plan, on décrit. La position part dans l'URL du formulaire de constat, qui
 * reste rendu côté serveur.
 */
export function PlanChantier({
  chantierId,
  plans,
  reperes,
  peutEmettre,
}: {
  chantierId: string;
  plans: PlanChoisissable[];
  reperes: (ReperePlan & { planId: string })[];
  peutEmettre: boolean;
}) {
  const router = useRouter();
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [pointage, setPointage] = useState(false);

  const plan = plans.find((p) => p.id === planId) ?? null;
  const reperesDuPlan = useMemo(
    () => reperes.filter((r) => r.planId === planId),
    [reperes, planId],
  );

  if (plans.length === 0) {
    return (
      <p className="vide">
        Aucun plan sur ce chantier. Ajoutez-en un pour situer les réserves.
      </p>
    );
  }

  return (
    <>
      <div className="barre-plan">
        <label className="sans-marge">
          Plan
          <select value={planId} onChange={(e) => { setPlanId(e.target.value); setPointage(false); }}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}{p.niveau ? ` — ${p.niveau}` : ""}{p.zone ? ` / ${p.zone}` : ""}
              </option>
            ))}
          </select>
        </label>
        {peutEmettre && plan?.image && (
          <button
            type="button"
            className={pointage ? "bouton danger" : "bouton"}
            onClick={() => setPointage((v) => !v)}
          >
            {pointage ? "Annuler le pointage" : "Placer une réserve"}
          </button>
        )}
      </div>

      {plan && !plan.image && (
        <p className="message">
          Ce plan est un PDF : il reste consultable, mais le repérage tactile demande une
          image. Déposez un JPEG ou un PNG pour pointer les réserves dessus.
        </p>
      )}

      <VisionneusePlan
        source={plan?.image ? plan.url : null}
        reperes={reperesDuPlan}
        pointage={pointage}
        onPointage={(position) => {
          router.push(
            `/chantiers/${chantierId}/nouvelle-reserve?plan=${planId}` +
            `&x=${position.x}&y=${position.y}`,
          );
        }}
      />
    </>
  );
}
