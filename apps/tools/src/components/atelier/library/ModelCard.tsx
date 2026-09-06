/**
 * §7 — carte d'un modèle : aperçu vectoriel, nom, famille, paramètres principaux.
 *
 * Tout ce qui est affiché vient du moteur (libellé, paramètres, difficulté, étapes, cotes) ou
 * de la présentation produit déjà publiée par `atelier-models.ts`. Rien n'est décrit ici.
 */

import Link from "next/link";
import { DIFFICULTY_LABELS, headlineParameters, type LibraryEntry } from "./library-model";
import { ModelThumbnail } from "./ModelThumbnail";
import styles from "./library.module.css";

export type ModelCardProps = {
  entry: LibraryEntry;
  /**
   * Lien « utiliser ce modèle ». Absent quand aucun tracé ne peut être créé (stockage local
   * indisponible) : mieux vaut une carte consultable qu'un bouton qui échouerait.
   */
  href?: string;
};

export function ModelCard({ entry, href }: ModelCardProps) {
  const parameters = headlineParameters(entry);
  return (
    <article className={styles.card}>
      <div className={styles.cardPreview}>
        <ModelThumbnail model={entry.model} label={entry.label} />
      </div>

      <div className={styles.cardBody}>
        <p className={styles.cardFamily}>
          {entry.group === "decoratifs" ? "Décoratif" : "Fondamental"} · {DIFFICULTY_LABELS[entry.difficulty]}
        </p>
        <h2 className={styles.cardTitle}>{entry.label}</h2>
        {entry.description && <p className={styles.cardDescription}>{entry.description}</p>}

        {parameters.length > 0 && (
          <ul className={styles.cardParams}>
            {parameters.map((parameter) => (
              <li key={parameter.id}>
                {parameter.label}
                {parameter.unit ? ` (${parameter.unit === "ratio" ? "0-1" : parameter.unit})` : ""}
              </li>
            ))}
          </ul>
        )}

        <p className={styles.cardMeta}>
          {entry.stepCount} étapes · {entry.dimensionCount} cotes
        </p>

        {href && (
          <Link href={href} className={styles.cardAction}>
            Créer un tracé
          </Link>
        )}
      </div>
    </article>
  );
}
