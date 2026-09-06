"use client";

/**
 * §5/§7 — MODÈLES ELSATIA : la bibliothèque visuelle de l'Atelier.
 *
 * Les cartes sont générées par le moteur géométrique, à partir du registre réel : aucun visuel
 * de référence extérieur, aucune capture, aucun contenu tiers. Ce que la carte montre est
 * exactement ce que l'outil tracera.
 *
 * La recherche et les filtres portent sur des données publiées (libellé, description, tags,
 * affinité d'ouvrage) : une famille ou un type d'ouvrage sans aucun modèle n'apparaît pas.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import type { TracingProjectType } from "@/lib/tracing/project";
import {
  ModelCard,
  buildTraceLibrary,
  filterLibrary,
  libraryFamilies,
  libraryOuvrages,
  type LibraryFamilyId,
} from "@/components/atelier/library";
import styles from "@/components/atelier/library/library.module.css";
import { Brand } from "./HomeDashboard";

export function AtelierModelesWorkspace() {
  // La bibliothèque construit chaque modèle une fois, à ses valeurs par défaut : c'est ce qui
  // alimente les aperçus. Mémoïsée pour que taper dans la recherche ne relance pas le moteur.
  const entries = useMemo(() => buildTraceLibrary(), []);
  const families = useMemo(() => libraryFamilies(entries), [entries]);
  const ouvrages = useMemo(() => libraryOuvrages(entries), [entries]);

  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<LibraryFamilyId>("tous");
  const [ouvrage, setOuvrage] = useState<TracingProjectType | null>(null);

  const results = useMemo(
    () => filterLibrary(entries, { query, family, ouvrage }),
    [entries, query, family, ouvrage],
  );

  return (
    <main className="atelier-page">
      <header className="calculator-header shell">
        <Brand />
        <Link href="/atelier" className="all-tools">
          Atelier <span>×</span>
        </Link>
      </header>

      <section className="atelier-hero">
        <div className="shell">
          <p className="eyebrow">MODÈLES ELSATIA</p>
          <h1>Bibliothèque de tracés</h1>
          <p>
            {entries.length} modèles paramétriques. Chaque aperçu est tracé par le moteur, aux valeurs par défaut du
            modèle.
          </p>
        </div>
      </section>

      <section className="shell atelier-section">
        <div className={styles.library}>
          <div className={styles.search}>
            <label htmlFor="library-search">Rechercher un modèle</label>
            <input
              id="library-search"
              type="search"
              value={query}
              placeholder="rosace, arche, spirale…"
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className={styles.filters} role="group" aria-label="Famille">
            <p className={styles.filterGroupLabel}>Famille</p>
            {families.map((item) => (
              <button
                key={item.id}
                type="button"
                className={styles.filter}
                aria-pressed={family === item.id}
                onClick={() => setFamily(item.id)}
              >
                {item.label}
                <span className={styles.count}>{item.count}</span>
              </button>
            ))}
          </div>

          <div className={styles.filters} role="group" aria-label="Type d’ouvrage">
            <p className={styles.filterGroupLabel}>Ouvrage</p>
            <button
              type="button"
              className={styles.filter}
              aria-pressed={ouvrage === null}
              onClick={() => setOuvrage(null)}
            >
              Tous
              <span className={styles.count}>{entries.length}</span>
            </button>
            {ouvrages.map((item) => (
              <button
                key={item.id}
                type="button"
                className={styles.filter}
                aria-pressed={ouvrage === item.id}
                onClick={() => setOuvrage(item.id)}
              >
                {item.label}
                <span className={styles.count}>{item.count}</span>
              </button>
            ))}
          </div>

          <p className={styles.resultCount} aria-live="polite">
            {results.length === 0
              ? "Aucun modèle ne correspond."
              : `${results.length} modèle${results.length > 1 ? "s" : ""} affiché${results.length > 1 ? "s" : ""}.`}
          </p>

          {results.length === 0 ? (
            <div className="atelier-empty">
              <span aria-hidden="true">◇</span>
              <h2>Aucun résultat</h2>
              <p>Essayez un autre mot, ou retirez un filtre.</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {results.map((entry) => (
                <ModelCard
                  key={entry.slug}
                  entry={entry}
                  href={`/atelier/nouveau?modele=${encodeURIComponent(entry.slug)}`}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
