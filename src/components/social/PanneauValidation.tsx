"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  annulerAction,
  deprogrammerAction,
  programmerAction,
  publierMaintenantAction,
  refuserAction,
  relancerCibleAction,
  remettreEnBrouillonAction,
  supprimerAction,
  validerAction,
} from "@/app/actions/social";
import { BoutonAction } from "@/components/social/BoutonAction";
import { LIBELLE_RESEAU, type Reseau, type StatutPublication } from "@/lib/social/types";

type CibleVue = { id: string; reseau: Reseau; statut: string; erreur: string | null; erreur_code: string | null; external_url: string | null; prochaine_tentative_at: string | null; publie_at: string | null };

const LIBELLE_CIBLE: Record<string, string> = { en_attente: "En attente", en_cours: "En cours", publie: "Publié", simule: "Simulé (dry-run)", echec: "Échec", annule: "Annulé" };

export function PanneauValidation({
  id,
  statut,
  programmeAt,
  reseaux,
  peutRediger,
  peutValider,
  peutPublier,
  simulation,
  cibles,
  approbation,
}: {
  id: string;
  statut: StatutPublication;
  programmeAt: string | null;
  reseaux: Reseau[];
  peutRediger: boolean;
  peutValider: boolean;
  peutPublier: boolean;
  simulation: boolean;
  cibles: CibleVue[];
  approbation: { par: string | null; le: string | null; commentaire: string | null };
}) {
  const router = useRouter();
  const [commentaire, setCommentaire] = useState("");
  const [confirme, setConfirme] = useState(false);
  const [date, setDate] = useState(() => {
    if (!programmeAt) return "";
    const d = new Date(programmeAt);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  const liste = reseaux.map((r) => LIBELLE_RESEAU[r]).join(", ");
  const champ = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

  return (
    <section className="space-y-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-base font-semibold">Validation et publication</h2>
      <ol className="flex flex-wrap gap-2 text-xs" aria-label="Étapes">
        {["Brouillon", "Prévisualisation", "Validation humaine", "Publication"].map((e, i) => {
          const etape = statut === "idee" || statut === "brouillon" ? 1 : statut === "a_valider" ? 2 : ["valide", "programme"].includes(statut) ? 3 : 4;
          return (
            <li key={e} className={`rounded-full px-2 py-0.5 ${i < etape ? "bg-elsatia-electrique text-white hover:bg-elsatia-profond dark:bg-elsatia-cyan dark:text-elsatia-nuit" : "bg-neutral-100 dark:bg-neutral-800"}`}>
              {i + 1}. {e}
            </li>
          );
        })}
      </ol>

      {approbation.par && (
        <p className="text-sm">
          Validé par <strong>{approbation.par}</strong> le {new Date(approbation.le!).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}
          {approbation.commentaire ? ` — « ${approbation.commentaire} »` : ""}
        </p>
      )}
      {!approbation.par && approbation.commentaire && <p className="rounded bg-amber-50 px-2 py-1 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">Dernier retour du validateur : « {approbation.commentaire} »</p>}

      {statut === "a_valider" && peutValider && (
        <div className="space-y-2">
          <label className="block text-sm">
            <span className="font-medium">Commentaire (obligatoire en cas de refus)</span>
            <textarea className={champ} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} maxLength={1000} />
          </label>
          <p className="text-xs text-neutral-500">Vérifier chaque aperçu (Facebook, Instagram, LinkedIn) avant de valider : la validation porte sur le contenu exact affiché.</p>
          <div className="flex flex-wrap gap-2">
            <BoutonAction variante="principal" libelle="Valider le contenu" action={() => validerAction(id, commentaire)} />
            <BoutonAction variante="danger" libelle="Refuser" action={() => refuserAction(id, commentaire)} />
          </div>
        </div>
      )}
      {statut === "a_valider" && !peutValider && <p className="text-sm text-neutral-600">En attente d’un Administrateur ou d’un Validateur.</p>}

      {["valide", "programme"].includes(statut) && peutPublier && (
        <div className="space-y-3">
          <label className="flex items-start gap-2 rounded-md bg-neutral-50 p-2 text-sm dark:bg-neutral-900">
            <input type="checkbox" className="mt-1" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} />
            <span>
              Je confirme la publication <strong>publique</strong> de ce contenu validé sur : <strong>{liste}</strong>.
              {simulation && " (Mode simulation : rien ne sera réellement envoyé.)"}
            </span>
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <BoutonAction variante="principal" libelle={simulation ? "Publier maintenant (simulation)" : "Publier maintenant"} action={async () => (confirme ? publierMaintenantAction(id, true) : { ok: false as const, erreur: "Cocher la confirmation." })} />
            {statut === "valide" && (
              <>
                <label className="text-sm">
                  <span className="block">Programmer le</span>
                  <input type="datetime-local" className={champ} value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <BoutonAction libelle="Programmer" action={async () => (!confirme ? { ok: false as const, erreur: "Cocher la confirmation." } : !date ? { ok: false as const, erreur: "Choisir une date." } : programmerAction(id, new Date(date).toISOString()))} />
              </>
            )}
            {statut === "programme" && <BoutonAction libelle="Annuler la programmation" action={() => deprogrammerAction(id)} />}
          </div>
          {statut === "programme" && programmeAt && <p className="text-sm">Programmée le {new Date(programmeAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} (heure de Paris).</p>}
          <BoutonAction variante="danger" libelle="Retirer la validation" action={() => refuserAction(id, commentaire || "Validation retirée")} />
        </div>
      )}
      {["valide", "programme"].includes(statut) && !peutPublier && <p className="text-sm text-neutral-600">Validé : publication réservée aux Administrateurs et Validateurs.</p>}

      {cibles.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Envois par réseau</h3>
          {cibles.map((c) => (
            <div key={c.id} className="rounded border border-neutral-200 p-2 text-sm dark:border-neutral-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><strong>{LIBELLE_RESEAU[c.reseau]}</strong> — {LIBELLE_CIBLE[c.statut] ?? c.statut}</span>
                {c.external_url && <a href={c.external_url} target="_blank" rel="noopener noreferrer" className="text-xs underline">Voir sur {LIBELLE_RESEAU[c.reseau]}</a>}
              </div>
              {c.erreur && <p className="mt-1 text-xs text-red-700 dark:text-red-400">{c.erreur}</p>}
              {c.erreur_code === "incertain" && <p className="mt-1 text-xs text-amber-800">Résultat incertain : vérifier sur la page {LIBELLE_RESEAU[c.reseau]} que la publication n’existe pas avant de relancer, pour éviter un doublon.</p>}
              {c.prochaine_tentative_at && <p className="mt-1 text-xs text-neutral-500">Nouvelle tentative automatique : {new Date(c.prochaine_tentative_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</p>}
              {c.statut === "echec" && !c.prochaine_tentative_at && peutPublier && (
                <div className="mt-1">
                  <BoutonAction libelle="Relancer ce réseau" confirmation={c.erreur_code === "incertain" ? "Avez-vous vérifié que la publication n’existe pas déjà sur le réseau ?" : "Relancer la publication sur ce réseau ?"} action={() => relancerCibleAction(c.id)} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
        {peutRediger && ["idee", "brouillon", "a_valider"].includes(statut) && <BoutonAction libelle="Annuler la publication" confirmation="Annuler cette publication ?" action={() => annulerAction(id)} />}
        {peutValider && ["valide", "programme"].includes(statut) && <BoutonAction libelle="Annuler la publication" confirmation="Annuler cette publication validée ?" action={() => annulerAction(id)} />}
        {peutRediger && ["idee", "annule", "echec"].includes(statut) && <BoutonAction libelle="Remettre en brouillon" action={() => remettreEnBrouillonAction(id)} />}
        {peutRediger && ["idee", "brouillon", "annule"].includes(statut) && (
          <BoutonAction variante="danger" libelle="Supprimer" confirmation="Supprimer définitivement ce brouillon ?" action={() => supprimerAction(id)} apres={(r) => r.ok && router.push("/plateforme/social")} />
        )}
      </div>
    </section>
  );
}
