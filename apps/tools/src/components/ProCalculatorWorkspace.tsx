"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ToolDefinition } from "@/lib/catalog";
import { getCategory } from "@/lib/categories";
import { getLocalAccess, hasCapability } from "@/lib/access";
import { executeProTool, proToolDefaults, proToolFields, type ProToolId } from "@/lib/pro-engine";
import { Brand } from "./HomeDashboard";
import { ProFeaturePreview } from "./ProFeaturePreview";
import { ToolIcon } from "./ToolIcon";
import { AdvancedPlan } from "./AdvancedPlan";

type Tab = "result" | "plan" | "points" | "steps";

export function ProCalculatorWorkspace({ tool }: { tool: ToolDefinition }) {
  const access = getLocalAccess();
  if (!hasCapability(access, "advanced-tracing")) return <LockedProWorkspace tool={tool} />;
  return <UnlockedProWorkspace tool={tool} />;
}

function LockedProWorkspace({ tool }: { tool: ToolDefinition }) {
  return <main className="calculator-page"><header className="calculator-header shell"><Brand /><Link className="all-tools" href="/">Tous les outils <span>×</span></Link></header><div className="tool-hero"><div className="shell"><Link href="/" className="breadcrumb">← Accueil</Link><div className="tool-heading"><span className="tool-icon large"><ToolIcon id={tool.id} size={36} /></span><div><p className="eyebrow">{getCategory(tool.categoryId).name} · PRO</p><h1>{tool.name}</h1><p>{tool.description}</p></div></div></div></div><section className="shell locked-pro"><div className="locked-pro-copy"><span className="pro-badge">TOOLS PRO</span><h2>Concevez et reproduisez cette forme sur chantier</h2><p>L’outil complet fournit la géométrie exacte, les centres, rayons, axes, points de construction, plan coté et étapes de traçage. Cet aperçu ne lance aucun calcul et n’affiche aucune fausse cote.</p><ul><li>Calcul local et hors ligne</li><li>Plan fondé sur les mesures saisies</li><li>Aucun compte ni paiement intégré dans cette version</li></ul><button type="button" disabled>Accès Pro bientôt disponible</button></div><div className="locked-pro-preview" aria-label="Aperçu non calculé"><ToolIcon id={tool.id} size={100} /><strong>{tool.name}</strong><small>Exemple visuel non coté — aucune géométrie calculée</small></div></section><section className="shell pro-preview-section"><ProFeaturePreview name="Plan coté avancé" description="Axes, points, rayons et distances de report issus d’un modèle métier en millimètres." capability="dimensioned-plan" preview="Aperçu descriptif" /></section></main>;
}

function UnlockedProWorkspace({ tool }: { tool: ToolDefinition }) {
  const id = tool.id as ProToolId; const [values, setValues] = useState(proToolDefaults[id]); const [tab, setTab] = useState<Tab>("result"); const [stepIndex, setStepIndex] = useState(0);
  const evaluation = useMemo(() => { try { return { value: executeProTool(tool, values), error: "" }; } catch (error) { return { value: null, error: error instanceof Error ? error.message : "Valeurs invalides." }; } }, [tool, values]);
  const fields = proToolFields[id].filter((field) => !field.showWhen || field.showWhen.values.includes(values[field.showWhen.key])); const currentStep = evaluation.value?.geometry.steps[stepIndex];
  return <main className="calculator-page pro-calculator"><header className="calculator-header shell"><Brand /><Link className="all-tools" href="/">Tous les outils <span>×</span></Link></header><div className="tool-hero"><div className="shell"><Link href="/" className="breadcrumb">← Accueil</Link><div className="tool-heading"><span className="tool-icon large"><ToolIcon id={tool.id} size={36} /></span><div><p className="eyebrow">{getCategory(tool.categoryId).name} · PRO INTERNE</p><h1>{tool.name}</h1><p>{tool.description}</p></div></div></div></div>
    <div className="shell calculator-grid pro-grid"><section className="input-panel"><div className="panel-heading"><span>1</span><div><p className="eyebrow">GÉOMÉTRIE EN MM</p><h2>Définissez l’ouvrage</h2></div></div><div className="fields">{fields.map((field, index) => <label className="field" key={field.key}><span>{field.label}</span><div>{field.inputType === "select" ? <select value={values[field.key]} onChange={(event) => { setValues((current) => ({ ...current, [field.key]: event.target.value })); setStepIndex(0); }}>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input inputMode="decimal" enterKeyHint={index === fields.length - 1 ? "done" : "next"} type="number" step={field.step ?? "any"} value={values[field.key]} onChange={(event) => { setValues((current) => ({ ...current, [field.key]: event.target.value })); setStepIndex(0); }} />}{field.unit && <b>{field.unit === "mm" ? values.unit ?? "mm" : field.unit}</b>}</div>{field.hint && <small>{field.hint}</small>}</label>)}</div><button className="reset-button" onClick={() => { setValues(proToolDefaults[id]); setStepIndex(0); }}>↺ Réinitialiser l’exemple</button></section>
      <section className="output-panel pro-output"><div className="result-tabs pro-tabs">{(["result", "plan", "points", "steps"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item === "result" ? "Résultats" : item === "plan" ? "Plan coté" : item === "points" ? "Coordonnées" : "Mode chantier"}</button>)}</div>
        {evaluation.error && <div className="calculation-error"><strong>Géométrie impossible</strong><p>{evaluation.error}</p></div>}
        {evaluation.value && tab === "result" && <div className="result-content"><p className="eyebrow">GÉOMÉTRIE CALCULÉE</p><div className="result-lines">{evaluation.value.results.map((line) => <div key={line.label} className={line.primary ? "primary" : ""}><span>{line.label}</span><strong>{line.value}</strong></div>)}</div><p className="result-note">ⓘ {evaluation.value.note}</p><button className="next-tab" onClick={() => setTab("plan")}>Voir le plan coté <span>→</span></button></div>}
        {evaluation.value && tab === "plan" && <div className="diagram-content"><AdvancedPlan model={evaluation.value.geometry} /><div className="diagram-legend"><span><i className="solid" /> Géométrie calculée</span><span><i /> Construction</span></div></div>}
        {evaluation.value && tab === "points" && <Coordinates model={evaluation.value.geometry} />}
        {evaluation.value && tab === "steps" && currentStep && <div className="site-step-mode"><div className="step-progress"><span>Étape {stepIndex + 1}/{evaluation.value.geometry.steps.length}</span><progress value={stepIndex + 1} max={evaluation.value.geometry.steps.length} /></div><p className="eyebrow">MODE CHANTIER</p><h2>{currentStep.title}</h2><p className="step-instruction">{currentStep.instruction}</p>{currentStep.measurements.length > 0 && <div className="step-measures"><strong>Mesure{currentStep.measurements.length > 1 ? "s" : ""}</strong>{currentStep.measurements.map((value) => <span key={value}>{value}</span>)}</div>}{currentStep.controlId && <p className="step-control">✓ {evaluation.value.geometry.controls.find((item) => item.id === currentStep.controlId)?.label}</p>}<div className="step-actions"><button disabled={stepIndex === 0} onClick={() => setStepIndex((value) => Math.max(0, value - 1))}>← Précédent</button><button onClick={() => stepIndex === evaluation.value!.geometry.steps.length - 1 ? setTab("plan") : setStepIndex((value) => value + 1)}>{stepIndex === evaluation.value.geometry.steps.length - 1 ? "Plan complet" : "Suivant →"}</button></div></div>}
      </section></div></main>;
}

function Coordinates({ model }: { model: NonNullable<ReturnType<typeof executeProTool>>["geometry"] }) {
  const origin = model.referenceFrame.origin;
  return <div className="coordinates-content"><p className="eyebrow">POINTS D’IMPLANTATION</p><h2>Coordonnées chantier</h2><p>Repère pièce : origine P0 lorsqu’elle existe. Repère forme : origine au centre O.</p><div className="coordinate-table" role="table"><div role="row" className="coordinate-head"><span>Point</span><span>X pièce</span><span>Y pièce</span><span>X depuis O</span><span>Y depuis O</span></div>{model.points.filter((item, index) => index < 18).map((item) => <div role="row" key={item.id}><strong>{item.id}</strong><span>{Math.round(item.x)} mm</span><span>{Math.round(item.y)} mm</span><span>{Math.round(item.x - origin.x)} mm</span><span>{Math.round(item.y - origin.y)} mm</span></div>)}</div><div className="site-controls coordinate-controls"><strong>Contrôles indépendants</strong>{model.controls.map((control) => <p key={control.id}>✓ {control.label} : {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(control.value)} {control.unit}</p>)}</div></div>;
}
