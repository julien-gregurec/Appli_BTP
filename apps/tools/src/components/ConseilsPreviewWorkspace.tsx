"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getTool } from "@/lib/catalog";
import {
  CONSEIL_CATEGORIES_ORDERED,
  getConseilCategory,
} from "@/lib/conseils/categories";
import {
  browseConseils,
  CONSEIL_FICHES_PUBLISHED,
  CONSEILS_CONTENT_VERSION,
  getConseilBySlug,
} from "@/lib/conseils/registry";
import { createConseilsStore, type ConseilsStore } from "@/lib/conseils/storage";
import { formatEstimatedDuration } from "@/lib/conseils/text";
import {
  CONSEIL_DIFFICULTIES,
  CONSEIL_TRADE_IDS,
  type ConseilCategoryId,
  type ConseilDifficulty,
  type ConseilFiche,
  type ConseilTradeId,
} from "@/lib/conseils/types";

const DIFFICULTY_LABEL: Record<ConseilDifficulty, string> = {
  facile: "Facile",
  intermediaire: "Intermédiaire",
  avance: "Avancé",
};

const TRADE_LABEL: Record<ConseilTradeId, string> = {
  tous: "Tous les métiers",
  platrier: "Plâtrier",
  plaquiste: "Plaquiste",
  menuisier: "Menuisier",
  agenceur: "Agenceur",
  peintre: "Peintre",
  carreleur: "Carreleur",
  metallier: "Métallier",
  vitrier: "Vitrier",
  "chef-de-chantier": "Chef de chantier",
};

const CATEGORIES_WITH_CONTENT = CONSEIL_CATEGORIES_ORDERED.filter((category) =>
  CONSEIL_FICHES_PUBLISHED.some((fiche) => fiche.category === category.id),
);

/** Index id → fiche : la bibliothèque dépasse la trentaine de fiches, on évite les scans. */
const PUBLISHED_BY_ID = new Map(CONSEIL_FICHES_PUBLISHED.map((fiche) => [fiche.id, fiche]));

function resolveIds(ids: readonly string[]): ConseilFiche[] {
  return ids
    .map((id) => PUBLISHED_BY_ID.get(id))
    .filter((fiche): fiche is ConseilFiche => fiche !== undefined);
}

export function ConseilsPreviewWorkspace() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ConseilCategoryId | null>(null);
  const [trade, setTrade] = useState<ConseilTradeId | null>(null);
  const [difficulty, setDifficulty] = useState<ConseilDifficulty | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const storeRef = useRef<ConseilsStore | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    const store = createConseilsStore(localStorage);
    storeRef.current = store;
    void Promise.all([store.readFavorites(), store.readRecent()]).then(([fav, rec]) => {
      setFavorites(fav);
      setRecent(rec);
    });
  }, []);

  const selected = selectedSlug ? getConseilBySlug(selectedSlug) : undefined;

  useEffect(() => {
    if (!selected) return;
    void storeRef.current?.pushRecent(selected.id).then((next) => next && setRecent(next));
  }, [selected]);

  const results = useMemo(
    () => browseConseils(query, { category, trade, difficulty }),
    [query, category, trade, difficulty],
  );

  const isBrowsing = query.trim().length > 0 || category !== null || trade !== null || difficulty !== null;
  const favoriteFiches = resolveIds(favorites);
  const recentFiches = resolveIds(recent);

  const toggleFavorite = (id: string) => {
    void storeRef.current?.toggleFavorite(id).then((next) => next && setFavorites(next));
  };

  if (selected) {
    return (
      <ConseilDetail
        fiche={selected}
        isFavorite={favorites.includes(selected.id)}
        onToggleFavorite={() => toggleFavorite(selected.id)}
        onBack={() => setSelectedSlug(null)}
      />
    );
  }

  return (
    <main className="conseils-preview">
      <header className="cp-head">
        <p className="cp-eyebrow">ELSATIA · APERÇU INTERNE</p>
        <h1>Conseils &amp; Techniques</h1>
        <p className="cp-sub">
          Bibliothèque de méthodes de chantier — contenu v{CONSEILS_CONTENT_VERSION}, hors ligne.
        </p>
      </header>

      <div className="cp-search">
        <span aria-hidden>⌕</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher une méthode, un tag, un métier…"
          enterKeyHint="search"
          aria-label="Rechercher dans les conseils"
        />
        {query && (
          <button className="cp-clear" onClick={() => setQuery("")} aria-label="Effacer la recherche">
            ×
          </button>
        )}
      </div>

      <div className="cp-chips" role="group" aria-label="Catégories">
        <button className={category === null ? "active" : ""} onClick={() => setCategory(null)}>
          Toutes
        </button>
        {CATEGORIES_WITH_CONTENT.map((item) => (
          <button
            key={item.id}
            className={category === item.id ? "active" : ""}
            onClick={() => setCategory(category === item.id ? null : item.id)}
          >
            <span aria-hidden>{item.icon}</span> {item.name}
          </button>
        ))}
      </div>

      <div className="cp-filters">
        <label>
          <span>Métier</span>
          <select
            value={trade ?? ""}
            onChange={(event) => setTrade((event.target.value || null) as ConseilTradeId | null)}
          >
            <option value="">Tous</option>
            {CONSEIL_TRADE_IDS.filter((id) => id !== "tous").map((id) => (
              <option key={id} value={id}>
                {TRADE_LABEL[id]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Difficulté</span>
          <select
            value={difficulty ?? ""}
            onChange={(event) =>
              setDifficulty((event.target.value || null) as ConseilDifficulty | null)
            }
          >
            <option value="">Toutes</option>
            {CONSEIL_DIFFICULTIES.map((id) => (
              <option key={id} value={id}>
                {DIFFICULTY_LABEL[id]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!isBrowsing && favoriteFiches.length > 0 && (
        <FicheSection
          title="Favoris"
          fiches={favoriteFiches}
          favorites={favorites}
          onOpen={setSelectedSlug}
          onToggleFavorite={toggleFavorite}
        />
      )}
      {!isBrowsing && recentFiches.length > 0 && (
        <FicheSection
          title="Consultés récemment"
          fiches={recentFiches}
          favorites={favorites}
          onOpen={setSelectedSlug}
          onToggleFavorite={toggleFavorite}
        />
      )}

      <FicheSection
        title={
          isBrowsing
            ? `${results.length} fiche${results.length > 1 ? "s" : ""}`
            : `Toutes les fiches (${results.length})`
        }
        fiches={results}
        favorites={favorites}
        onOpen={setSelectedSlug}
        onToggleFavorite={toggleFavorite}
        emptyLabel="Aucune fiche ne correspond. Élargissez la recherche ou retirez un filtre."
      />

      <footer className="cp-foot">
        <Link href="/">← Retour aux outils</Link>
      </footer>
    </main>
  );
}

function FicheSection({
  title,
  fiches,
  favorites,
  onOpen,
  onToggleFavorite,
  emptyLabel,
}: {
  title: string;
  fiches: readonly ConseilFiche[];
  favorites: readonly string[];
  onOpen: (slug: string) => void;
  onToggleFavorite: (id: string) => void;
  emptyLabel?: string;
}) {
  return (
    <section className="cp-section">
      <h2>{title}</h2>
      {fiches.length === 0 && emptyLabel ? (
        <p className="cp-empty">{emptyLabel}</p>
      ) : (
        <ul className="cp-list">
          {fiches.map((fiche) => {
            const cat = getConseilCategory(fiche.category);
            return (
              <li key={fiche.id} className="cp-card">
                <button className="cp-card-main" onClick={() => onOpen(fiche.slug)}>
                  <span className="cp-card-meta">
                    <b>{cat.icon}</b> {cat.name} · {DIFFICULTY_LABEL[fiche.difficulty]} ·{" "}
                    {formatEstimatedDuration(fiche.estimatedMinutes)}
                  </span>
                  <strong>{fiche.title}</strong>
                  <p>{fiche.shortDescription}</p>
                </button>
                <button
                  className={`cp-fav ${favorites.includes(fiche.id) ? "on" : ""}`}
                  onClick={() => onToggleFavorite(fiche.id)}
                  aria-pressed={favorites.includes(fiche.id)}
                  aria-label={
                    favorites.includes(fiche.id)
                      ? `Retirer ${fiche.title} des favoris`
                      : `Ajouter ${fiche.title} aux favoris`
                  }
                >
                  ★
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ConseilDetail({
  fiche,
  isFavorite,
  onToggleFavorite,
  onBack,
}: {
  fiche: ConseilFiche;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onBack: () => void;
}) {
  const cat = getConseilCategory(fiche.category);
  const relatedTools = fiche.relatedToolIds
    .map((id) => getTool(id))
    .filter((tool): tool is NonNullable<ReturnType<typeof getTool>> => tool !== undefined);

  return (
    <main className="conseils-preview cp-detail">
      <div className="cp-detail-bar">
        <button className="cp-back" onClick={onBack}>
          ← Fiches
        </button>
        <button
          className={`cp-fav big ${isFavorite ? "on" : ""}`}
          onClick={onToggleFavorite}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        >
          ★
        </button>
      </div>

      <header className="cp-detail-head">
        <p className="cp-eyebrow">
          {cat.icon} {cat.name}
          {fiche.subcategory ? ` · ${fiche.subcategory}` : ""}
        </p>
        <h1>{fiche.title}</h1>
        <p className="cp-sub">{fiche.shortDescription}</p>
        <div className="cp-badges">
          <span className={`cp-badge diff-${fiche.difficulty}`}>{DIFFICULTY_LABEL[fiche.difficulty]}</span>
          <span className="cp-badge">⏱ {formatEstimatedDuration(fiche.estimatedMinutes)}</span>
          {fiche.trades.filter((t) => t !== "tous").length === 0 ? (
            <span className="cp-badge">{TRADE_LABEL.tous}</span>
          ) : (
            fiche.trades
              .filter((t) => t !== "tous")
              .map((t) => (
                <span key={t} className="cp-badge">
                  {TRADE_LABEL[t]}
                </span>
              ))
          )}
        </div>
      </header>

      {fiche.warnings.length > 0 && (
        <div className="cp-warn">
          {fiche.warnings.map((warning) => (
            <p key={warning}>⚠ {warning}</p>
          ))}
        </div>
      )}

      <AccordionList title="Outils" items={fiche.tools} open />
      <AccordionList title="Fournitures" items={fiche.materials} />
      <AccordionList title="Préparation" items={fiche.preparation} />

      <details className="cp-acc" open>
        <summary>Étapes</summary>
        <ol className="cp-steps">
          {fiche.steps.map((step, index) => (
            <li key={step.title}>
              <span className="cp-step-n">{index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.text}</p>
                {step.hint && <p className="cp-step-hint">💡 {step.hint}</p>}
              </div>
            </li>
          ))}
        </ol>
      </details>

      <AccordionList title="Conseils" items={fiche.tips} />
      <AccordionList title="Erreurs fréquentes" items={fiche.commonErrors} tone="error" />
      <AccordionList title="Contrôle final" items={fiche.finalCheck} tone="check" open />

      {(relatedTools.length > 0 || fiche.relatedTraceIds.length > 0) && (
        <section className="cp-related">
          <h2>Pour aller plus loin</h2>
          {relatedTools.length > 0 && (
            <div className="cp-related-tools">
              {relatedTools.map((tool) => (
                <Link key={tool.id} href={`/outils/${tool.slug}`}>
                  {tool.name} <span aria-hidden>→</span>
                </Link>
              ))}
            </div>
          )}
          <div className="cp-traces-future" aria-disabled>
            <p>Tracés interactifs</p>
            <div>
              <button type="button" disabled>
                Voir le schéma
              </button>
              <button type="button" disabled>
                Pas à pas
              </button>
              <button type="button" disabled>
                Mode chantier
              </button>
            </div>
            <small>
              {fiche.relatedTraceIds.length > 0
                ? `${fiche.relatedTraceIds.length} tracé(s) lié(s) — intégration à venir.`
                : "Disponible quand le moteur Tracés sera relié à cette fiche."}
            </small>
          </div>
        </section>
      )}

      <footer className="cp-foot">
        <button className="cp-back" onClick={onBack}>
          ← Toutes les fiches
        </button>
      </footer>
    </main>
  );
}

function AccordionList({
  title,
  items,
  tone,
  open = false,
}: {
  title: string;
  items: readonly string[];
  tone?: "error" | "check";
  open?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <details className={`cp-acc ${tone ? `tone-${tone}` : ""}`} open={open}>
      <summary>{title}</summary>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </details>
  );
}
