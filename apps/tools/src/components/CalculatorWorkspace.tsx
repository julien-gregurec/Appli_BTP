"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ToolDefinition, ToolId } from "@/lib/catalog";
import { activeTools } from "@/lib/catalog";
import { FREE_ACCESS } from "@/lib/access";
import { getCategory } from "@/lib/categories";
import { getPromotionForAccess } from "@/lib/promotions";
import { migrateLegacyStorage, readStoredIds, STORAGE_KEYS } from "@/lib/storage";
import { executeTool, toolDefaults, toolFields } from "@/lib/tool-engine";
import { Brand } from "./HomeDashboard";
import { PromotionCard } from "./PromotionCard";
import { ToolDiagram } from "./ToolDiagram";
import { ToolIcon } from "./ToolIcon";

export function CalculatorWorkspace({ tool }: { tool: ToolDefinition }) {
  const [values, setValues] = useState(toolDefaults[tool.id]);
  const [tab, setTab] = useState<"result" | "plan" | "steps">("result");
  const evaluation = useMemo(() => { try { return { value: executeTool(tool.id, values), error: "" }; } catch (error) { return { value: null, error: error instanceof Error ? error.message : "Valeurs invalides." }; } }, [tool.id, values]);

  useEffect(() => {
    migrateLegacyStorage(localStorage);
    const current = readStoredIds<ToolId>(localStorage, STORAGE_KEYS.recent);
    localStorage.setItem(STORAGE_KEYS.recent, JSON.stringify([tool.id, ...current.filter((id) => id !== tool.id)].slice(0, 4)));
  }, [tool.id]);

  const promotion = getPromotionForAccess(tool.promotionId, FREE_ACCESS);

  return <main className="calculator-page">
    <header className="calculator-header shell"><Brand /><Link className="all-tools" href="/">Tous les outils <span>×</span></Link></header>
    <div className="tool-hero"><div className="shell"><Link href="/" className="breadcrumb">← Accueil</Link><div className="tool-heading"><span className="tool-icon large"><ToolIcon id={tool.id} size={36} /></span><div><p className="eyebrow">{getCategory(tool.categoryId).name} · {tool.access === "free" ? "GRATUIT" : "PRO"}</p><h1>{tool.name}</h1><p>{tool.description}</p></div></div></div></div>
    <div className="shell calculator-grid">
      <section className="input-panel"><div className="panel-heading"><span>1</span><div><p className="eyebrow">VOS MESURES</p><h2>Renseignez les dimensions</h2></div></div><div className="fields">{toolFields[tool.id].filter((field) => !field.showWhen || field.showWhen.values.includes(values[field.showWhen.key])).map((field) => <label className="field" key={field.key}><span>{field.label}</span><div>{field.inputType === "select" ? <select value={values[field.key]} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input inputMode="decimal" type="number" min="0" step={field.step ?? "any"} value={values[field.key]} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} />}{field.unit && <b>{field.unit}</b>}</div>{field.hint && <small>{field.hint}</small>}</label>)}</div><button className="reset-button" onClick={() => setValues(toolDefaults[tool.id])}>↺ Réinitialiser l’exemple</button></section>
      <section className="output-panel"><div className={`result-tabs ${!tool.hasSvg || !tool.hasSiteMode ? "reduced" : ""}`}><button className={tab === "result" ? "active" : ""} onClick={() => setTab("result")}>Résultat</button>{tool.hasSvg && <button className={tab === "plan" ? "active" : ""} onClick={() => setTab("plan")}>Schéma</button>}{tool.hasSiteMode && <button className={tab === "steps" ? "active" : ""} onClick={() => setTab("steps")}>Tracer sur chantier</button>}</div>
        {evaluation.error && <div className="calculation-error"><strong>Vérifiez les mesures</strong><p>{evaluation.error}</p></div>}
        {evaluation.value && tab === "result" && <div className="result-content"><p className="eyebrow">RÉSULTAT CALCULÉ</p><div className="result-lines">{evaluation.value.results.map((line) => <div key={line.label} className={line.primary ? "primary" : ""}><span>{line.label}</span><strong>{line.value}</strong></div>)}</div><p className="result-note">ⓘ {evaluation.value.note}</p>{tool.hasSvg ? <button className="next-tab" onClick={() => setTab("plan")}>Voir le schéma <span>→</span></button> : tool.hasSiteMode ? <button className="next-tab" onClick={() => setTab("steps")}>Voir les instructions <span>→</span></button> : null}</div>}
        {evaluation.value && tab === "plan" && <div className="diagram-content"><ToolDiagram id={tool.id} values={values} /><div className="diagram-legend"><span><i className="solid" /> Cote calculée</span><span><i /> Ligne de construction</span></div></div>}
        {evaluation.value && tab === "steps" && <div className="steps-content"><p className="eyebrow">MODE CHANTIER</p><h2>Tracez pas à pas</h2><ol>{evaluation.value.instructions.steps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol>{evaluation.value.instructions.controls.length > 0 && <div className="site-controls"><strong>Contrôles</strong>{evaluation.value.instructions.controls.map((control) => <p key={control}>✓ {control}</p>)}</div>}</div>}
      </section>
    </div>
    {promotion && <div className="shell promotion-wrap"><PromotionCard promotion={promotion} /></div>}
    <section className="shell related"><p className="eyebrow">CONTINUEZ VOTRE OUVRAGE</p><h2>Outils complémentaires</h2><div>{activeTools.filter((item) => item.id !== tool.id).slice(0, 3).map((item) => <Link href={`/outils/${item.slug}`} key={item.id}><ToolIcon id={item.id} /><span><small>{getCategory(item.categoryId).name}</small><strong>{item.shortName}</strong></span><b>→</b></Link>)}</div></section>
  </main>;
}
