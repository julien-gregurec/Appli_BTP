/**
 * Vue d'impression chantier.
 *
 * `window.open(url, target, "noopener")` renvoie `null` par spécification HTML : la poignée
 * était donc toujours nulle, `printProjectDocument` levait systématiquement « Autorisez
 * l'ouverture de la vue d'impression » et aucune impression n'était possible, CSP ou non.
 *
 * La poignée est indispensable : la vue est écrite avec `document.write` puis lancée par
 * `print()`. La fenêtre est donc ouverte sans `noopener`, et la référence retour est coupée
 * immédiatement (`opener = null`, avant la moindre écriture) : la fenêtre fille ne peut plus
 * atteindre l'application, l'application garde sa poignée. Aucune URL n'est chargée
 * (`about:blank`), donc aucun `Referer` n'est émis et l'abandon de `noreferrer` ne divulgue rien.
 *
 * Cette voie est la seule ouverte par la politique de `lib/security-headers.ts` : COOP
 * `same-origin-allow-popups` préserve la poignée, mais `frame-src 'none'` interdit le repli par
 * `<iframe>`. Le document écrit hérite de la CSP de l'application : il ne porte aucun script et
 * son seul `<style>` en ligne est couvert par `style-src 'unsafe-inline'`.
 */

import type { ProjectDocument } from "./document";
import { exportProjectSvg } from "./svg";

/** `_blank` ouvre toujours une fenêtre neuve, jamais une fenêtre nommée déjà ouverte. */
const PRINT_WINDOW_TARGET = "_blank";

/** Repli quand le navigateur n'émet pas de `load` sur un document écrit (Safari iOS, WebView). */
const PRINT_FALLBACK_DELAY_MS = 400;

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function renderPrintHtml(document: ProjectDocument) {
  const params = document.parameters.map((item) => `<tr><th>${escape(item.label)}</th><td>${escape(item.value)}</td></tr>`).join("");
  const results = document.execution.results.map((item) => `<tr><th>${escape(item.label)}</th><td>${escape(item.value)}</td></tr>`).join("");
  const points = document.execution.geometry.points.map((item) => `<tr><th>${escape(item.id)}</th><td>X ${Math.round(item.x)} mm</td><td>Y ${Math.round(item.y)} mm</td></tr>`).join("");
  const steps = document.execution.geometry.steps.map((item, index) => `<li><strong>${index + 1}. ${escape(item.title)}</strong><p>${escape(item.instruction)}</p></li>`).join("");
  const controls = document.execution.geometry.controls.map((item) => `<li>${escape(item.label)} : ${item.value.toFixed(1)} ${item.unit}</li>`).join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escape(document.project.name)} - ELSATIA Tools</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;color:#17303f;font:10pt Arial,sans-serif}header{display:flex;justify-content:space-between;border-bottom:2px solid #f5aa22;padding-bottom:8px}h1{font:22pt Georgia,serif;margin:14px 0 4px}h2{font-size:10pt;color:#a56500;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #ddd;padding-bottom:4px;margin-top:18px}.meta{color:#53656f}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}table{width:100%;border-collapse:collapse}th,td{padding:4px;border-bottom:1px solid #eee;text-align:left}th{color:#53656f}svg{width:100%;max-height:130mm}li{margin-bottom:6px}li p{margin:2px 0}.warning{padding:8px;border-left:3px solid #f5aa22;background:#fff7e7}.page-break{break-before:page}footer{position:fixed;bottom:0;width:100%;border-top:1px solid #ddd;padding-top:5px;color:#777;font-size:8pt}@media screen{body{max-width:900px;margin:20px auto;padding:20px;box-shadow:0 2px 20px #ccc}}</style></head><body><header><strong>ELSATIA<br><small>TOOLS</small></strong><span>${escape(new Date(document.generatedAt).toLocaleDateString("fr-FR"))}</span></header><h1>${escape(document.project.name)}</h1><p class="meta">${escape(document.tool.name)}${document.project.siteName ? ` - Chantier : ${escape(document.project.siteName)}` : ""}</p><div class="grid"><section><h2>Paramètres</h2><table>${params}</table></section><section><h2>Résultats</h2><table>${results}</table></section></div><section><h2>Plan coté</h2>${exportProjectSvg(document, { mode: "complete", includeLegend: false })}<p class="warning">Schéma coté : utiliser les valeurs numériques, ne pas mesurer directement sur le document.</p></section><section class="page-break"><h2>Points de construction</h2><table>${points}</table><h2>Étapes chantier</h2><ol>${steps}</ol><h2>Contrôles</h2><ul>${controls}</ul>${document.project.notes ? `<h2>Notes</h2><p>${escape(document.project.notes)}</p>` : ""}</section><footer>ELSATIA Tools - Document généré localement</footer></body></html>`;
}

/**
 * Coupe la référence `fenêtre fille -> application` dès l'ouverture, avant toute écriture.
 * L'affectation reste défensive : un moteur qui la refuse ne doit pas casser l'impression,
 * la fenêtre restant de toute façon un `about:blank` de même origine sans contenu tiers.
 */
function detachOpener(target: Window) {
  try { target.opener = null; } catch { /* moteur refusant l'écriture : rien à révoquer de plus */ }
}

export function printProjectDocument(document: ProjectDocument) {
  const target = window.open("", PRINT_WINDOW_TARGET);
  if (!target) throw new Error("Autorisez l’ouverture de la vue d’impression.");
  detachOpener(target);
  // WebView Capacitor : `print` n'existe pas. On referme plutôt que d'afficher une page morte.
  if (typeof target.print !== "function") { target.close(); throw new Error("Impression indisponible sur cette plateforme : utilisez « Télécharger PDF » ou « Partager »."); }

  let launched = false;
  const launch = () => {
    if (launched || target.closed) return;
    launched = true;
    try { target.focus(); } catch { /* focus refusé : l'impression reste possible */ }
    target.print();
  };

  const view = target.document;
  view.open();
  view.write(renderPrintHtml(document));
  // Abonnement avant `close()` : c'est `close()` qui déclenche le `load` du document écrit.
  target.addEventListener("load", launch, { once: true });
  view.close();
  // Trois voies, une seule impression (`launched`) : `load`, document déjà complet, puis repli.
  if (view.readyState === "complete") launch(); else setTimeout(launch, PRINT_FALLBACK_DELAY_MS);
}
