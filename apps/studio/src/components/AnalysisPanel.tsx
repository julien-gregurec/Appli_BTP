"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listStudioTemplates, type RankedAsset } from "@elsatia/studio-domain";
interface Data {
  template: string;
  enabled: boolean;
  rows: RankedAsset[];
  suggested: string[];
  order: string[];
  revision: number;
  total: number;
  completed: number;
  active: number;
  failed: number;
  metrics: {
    ai_operations: number;
    analyzed_assets: number;
    provider_calls: number;
    estimated_cost: number;
  };
}
async function request(
  project: string,
  template: string,
  body?: unknown,
): Promise<Data> {
  const r = await fetch(
    `/api/analysis/${project}?template=${encodeURIComponent(template)}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  const value = await r.json();
  if (!r.ok) throw Error(value.error || "Analyse indisponible.");
  return value;
}
export default function AnalysisPanel({
  project,
  canWrite,
  enabled,
  asset,
}: {
  project: string;
  canWrite: boolean;
  enabled: boolean;
  asset?: string | null;
}) {
  const router = useRouter(),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [template, setTemplate] = useState("chantier-pro"),
    [filter, setFilter] = useState("Tous"),
    [selected, setSelected] = useState<string[] | null>(null),
    [offset, setOffset] = useState(0);
  const compact = asset !== undefined;
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const load = async () => {
      try {
        const d = await request(project, template);
        if (live) {
          setData(d);
          setError("");
        }
      } catch (e) {
        if (live)
          setError(e instanceof Error ? e.message : "Analyse indisponible.");
      }
    };
    void load();
    return () => {
      live = false;
    };
  }, [enabled, project, template, compact]);
  if (!enabled) return null;
  if (compact) {
    const row = data?.rows.find((r) => r.asset.id === asset);
    return row?.analysis?.result ? (
      <p className="analysis-badge">
        {row.recommendation} ·{" "}
        {row.analysis.result.warnings.join(" · ") ||
          "Analyse locale indicative"}
      </p>
    ) : null;
  }
  const refresh = async () => setData(await request(project, template));
  async function action(body: unknown) {
    setBusy(true);
    setError("");
    try {
      await request(project, template, body);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analyse indisponible.");
    } finally {
      setBusy(false);
    }
  }
  // Restart polling after a manual admission without continuously polling completed caches.
  async function analyze(force = false) {
    await action({ action: "analyze", force });
  }
  const filtered =
    data?.rows.filter(
      (r) =>
        filter === "Tous" ||
        (filter === "Recommandés" &&
          ["Excellent", "Recommandé"].includes(r.recommendation)) ||
        (filter === "Doublons" && r.duplicate_group_id) ||
        (filter === "Faible qualité" && r.quality_score < 40),
    ) ?? [];
  return (
    <section
      className="card analysis-panel"
      aria-label="Sélection intelligente"
    >
      <h2>Sélection intelligente</h2>
      <p>
        Analyse locale indicative. Aucun média supprimé. Vous gardez le choix de
        la sélection et de l’ordre.
      </p>
      <a href="#montage-sans-analyse">Continuer sans analyse</a>
      {error && <p role="alert">{error}</p>}
      {canWrite && (
        <div className="analysis-actions">
          <button
            disabled={busy || !!data?.active}
            onClick={() => void analyze()}
          >
            Analyser les médias
          </button>
          <button
            disabled={busy || !!data?.active}
            onClick={() => void analyze(true)}
          >
            Ré-analyser
          </button>
          {!!data?.active && (
            <button
              disabled={busy}
              onClick={() => void action({ action: "cancel" })}
            >
              Annuler l’analyse
            </button>
          )}
        </div>
      )}
      {data && (
        <>
          <p role="status">
            {data.completed}/{data.total} médias analysés · {data.active} en
            attente ou en cours · {data.failed} non analysés
          </p>
          <progress
            aria-label="Progression analyse"
            value={data.completed + data.failed}
            max={Math.max(1, data.total)}
          />
          {data.active > 0 && (
            <AnalysisPoll
              project={project}
              template={template}
              update={setData}
              error={setError}
            />
          )}
          <p>
            {data.metrics.provider_calls} appel externe · coût fournisseur : 0 €
          </p>
          <label>
            Filtrer l’analyse{" "}
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setOffset(0);
              }}
            >
              {["Tous", "Recommandés", "Doublons", "Faible qualité"].map(
                (v) => (
                  <option key={v}>{v}</option>
                ),
              )}
            </select>
          </label>
          {canWrite && (
            <>
              <label>
                Style de la proposition{" "}
                <select
                  value={template}
                  onChange={(e) => {
                    setTemplate(e.target.value);
                    setSelected(null);
                  }}
                >
                  {listStudioTemplates()
                    .filter((t) => t.overlayConfig.structure !== "before-after")
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </label>
              <p>
                Avant/Après conserve ses groupes manuels dans le parcours de
                montage habituel.
              </p>
              <button
                disabled={
                  busy || !data.rows.length || data.template !== template
                }
                onClick={() => setSelected(data.suggested)}
              >
                Choisir les meilleurs médias
              </button>
              {selected && (
                <>
                  <p aria-label="Nombre proposé">
                    {selected.length} médias proposés sur {data.total}
                  </p>
                  <button
                    onClick={() =>
                      setSelected(
                        data.order.filter((id) => selected.includes(id)),
                      )
                    }
                  >
                    Utiliser l’ordre recommandé
                  </button>
                  <button
                    onClick={() =>
                      setSelected(
                        data.rows
                          .filter((r) => selected.includes(r.asset.id))
                          .sort(
                            (a, b) =>
                              (a.asset.sort_order ?? 0) -
                              (b.asset.sort_order ?? 0),
                          )
                          .map((r) => r.asset.id),
                      )
                    }
                  >
                    Conserver l’ordre du projet
                  </button>
                  <button
                    disabled={busy || !selected.length}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          "Créer une nouvelle version avec cette sélection ? Le montage actuel sera conservé.",
                        )
                      )
                        return;
                      setBusy(true);
                      try {
                        await request(project, template, {
                          action: "generate",
                          ids: selected,
                          revision: data.revision,
                          options: { templateId: template, templateVersion: 1 },
                        });
                        router.refresh();
                        await refresh();
                        setSelected(null);
                      } catch (e) {
                        setError(
                          e instanceof Error ? e.message : "Création refusée.",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Créer un montage avec la sélection
                  </button>
                </>
              )}
            </>
          )}
          <ul className="analysis-grid">
            {filtered.slice(offset, offset + 24).map((r) => (
              <li key={r.asset.id} data-analysis-asset={r.asset.id}>
                <strong>{r.asset.original_filename}</strong>
                <p>
                  {r.recommendation} · Qualité {r.quality_score}/100
                </p>
                <p>
                  {r.analysis?.result?.warnings.join(" · ") ||
                    (!r.analysis ? "Non analysé" : "")}
                </p>
                {r.analysis?.result && (
                  <p>
                    {r.analysis.result.orientation} ·{" "}
                    {r.analysis.result.face_count} visage(s) détecté(s), sans
                    identification
                  </p>
                )}
                {r.analysis?.fallback && (
                  <p>Fournisseur indisponible : analyse locale utilisée.</p>
                )}
                {canWrite && selected && (
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.includes(r.asset.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, r.asset.id]
                            : selected.filter((id) => id !== r.asset.id),
                        )
                      }
                    />
                    Conserver {r.asset.original_filename}
                  </label>
                )}
              </li>
            ))}
          </ul>
          <div className="analysis-actions">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 24))}
            >
              Résultats précédents
            </button>
            <button
              disabled={offset + 24 >= filtered.length}
              onClick={() => setOffset(offset + 24)}
            >
              Résultats suivants
            </button>
          </div>
        </>
      )}
    </section>
  );
}
function AnalysisPoll({
  project,
  template,
  update,
  error,
}: {
  project: string;
  template: string;
  update: (d: Data) => void;
  error: (s: string) => void;
}) {
  useEffect(() => {
    let live = true,
      busy = false;
    const timer = setInterval(() => {
      if (busy) return;
      busy = true;
      void request(project, template)
        .then((d) => {
          if (live) {
            update(d);
            error("");
          }
        })
        .catch(() => {
          if (live)
            error(
              "Analyse momentanément indisponible. Les autres fonctions restent accessibles.",
            );
        })
        .finally(() => {
          busy = false;
        });
    }, 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [project, template, update, error]);
  return null;
}
