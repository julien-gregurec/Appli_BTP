"use client";

/**
 * Aperçu interne du viewport Atelier (§12).
 *
 * Route non cataloguée, `noindex` : elle sert à éprouver le pan, le zoom, le pinch, la grille,
 * la barre d'outils et le panneau propriétés sur des fixtures statiques, y compris une scène de
 * charge de plusieurs dizaines d'entités (§14). Elle ne dépend d'aucun modèle C4 actif, d'aucun
 * `TracingProject` et d'aucun appel au moteur géométrique.
 *
 * La liste d'entités tient lieu de source de sélection complémentaire au hit-testing : elle
 * prouve que `selectedEntityIds` / `onSelectEntities` alimentent bien le panneau.
 *
 * ATELIER-INTERSECTIONS-MULTISELECT-V1 §4/§5 — c'est ici que le cycle et la sélection multiple
 * s'éprouvent à la main. La scène de charge est la bonne pour cela : sa trame régulière
 * multiplie les croisements, c'est-à-dire exactement les endroits où deux entités se disputent
 * le même clic et où le cycle doit permettre d'atteindre celle du dessous.
 */

import { useMemo, useState } from "react";
import {
  AtelierViewportWorkspace,
  EMPTY_SELECTION,
  listSceneEntities,
  PREVIEW_SCENES,
  toggleSelection,
} from "@/components/atelier/viewport";

/**
 * `AtelierViewportWorkspace` appelle toujours les deux rappels de sélection ; la liste étant ici
 * la source de vérité, celui de la sélection simple n'a rien à enregistrer de plus.
 */
function noop() {}

export function AtelierViewportPreviewWorkspace() {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [selection, setSelection] = useState<readonly string[]>(EMPTY_SELECTION);

  const scene = PREVIEW_SCENES[sceneIndex];
  const entities = useMemo(() => listSceneEntities(scene), [scene]);

  return (
    <main className="shell" style={{ paddingBlock: 32, display: "grid", gap: 18, maxWidth: 1080, minWidth: 0 }}>
      <header>
        <p className="eyebrow">Aperçu interne</p>
        <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 500, margin: 0 }}>Atelier — viewport interactif</h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.6, margin: "6px 0 0" }}>
          Molette ou pincement pour zoomer, glisser pour déplacer, <strong>Recentrer</strong> pour revenir au cadrage
          d’origine. Au clavier : flèches, <kbd>+</kbd>, <kbd>−</kbd>, <kbd>0</kbd>.
        </p>
        <p style={{ color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.6, margin: "6px 0 0" }}>
          En mode <strong>Sélection</strong> : re-cliquer au même endroit descend dans les entités superposées
          (essayer sur un croisement de la scène de charge), <kbd>Maj</kbd>+clic ajoute ou retire de la sélection.
          L’accrochage propose désormais les intersections réellement calculées. Aucune modification de forme
          n’est faite par la sélection.
        </p>
      </header>

      <div role="group" aria-label="Scène de démonstration" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {PREVIEW_SCENES.map((item, index) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={index === sceneIndex}
            onClick={() => {
              setSceneIndex(index);
              setSelection(EMPTY_SELECTION);
            }}
            style={{
              minHeight: 40,
              padding: "8px 14px",
              borderRadius: 999,
              border: `1px solid ${index === sceneIndex ? "var(--amber)" : "var(--line)"}`,
              background: index === sceneIndex ? "var(--amber-soft)" : "var(--white)",
              color: "var(--ink)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {item.name}
          </button>
        ))}
      </div>

      <AtelierViewportWorkspace
        scene={scene}
        selectedEntityId={selection.at(-1) ?? null}
        onSelectEntity={noop}
        selectedEntityIds={selection}
        onSelectEntities={setSelection}
      />

      <section
        aria-label="Sélection d’entité (fixture)"
        style={{
          minWidth: 0,
          padding: 16,
          border: "1px solid var(--line)",
          borderRadius: 13,
          background: "var(--white)",
        }}
      >
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: 16, fontWeight: 600, margin: "0 0 4px", color: "var(--navy)" }}>
          Sélection — fixture
        </h2>
        <p style={{ color: "var(--ink-soft)", fontSize: 12, lineHeight: 1.5, margin: "0 0 12px" }}>
          Alimente <code>selectedEntityIds</code> sans hit-testing géométrique. En mode
          <strong> Sélection</strong>, un appui direct sur un tracé fonctionne aussi.
          {selection.length > 0 && <> — <strong>{selection.length}</strong> sélectionnée(s).</>}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {entities.slice(0, 24).map((entity) => (
            <button
              key={entity.id}
              type="button"
              aria-pressed={selection.includes(entity.id)}
              onClick={() => setSelection((current) => toggleSelection(current, entity.id))}
              style={{
                minHeight: 34,
                padding: "5px 10px",
                borderRadius: 8,
                border: `1px solid ${selection.includes(entity.id) ? "var(--amber)" : "var(--line)"}`,
                background: selection.includes(entity.id) ? "var(--amber-soft)" : "var(--paper)",
                color: "var(--ink)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {entity.label}
            </button>
          ))}
          {entities.length > 24 && (
            <span style={{ alignSelf: "center", color: "var(--ink-soft)", fontSize: 12 }}>
              + {entities.length - 24} autres entités rendues
            </span>
          )}
        </div>
      </section>
    </main>
  );
}
