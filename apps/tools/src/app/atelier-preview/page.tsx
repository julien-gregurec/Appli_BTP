import type { Metadata } from "next";
import {
  LightingSummaryCard,
  MarginSelector,
  NomenclatureTable,
  ProfilePlanCard,
  ReportTableView,
  WitnessDimensionCard,
} from "@/components/atelier";
import type { ReportPoint } from "@/lib/chantier";

/**
 * Page de démonstration interne des vues Atelier « report + métrés » (§10).
 *
 * Non cataloguée, hors sitemap, `noindex`. Ne remplace aucun outil commercial : elle sert
 * uniquement à vérifier le rendu (desktop + mobile) avec des props typées figées.
 */
export const metadata: Metadata = {
  title: "Aperçu interne — Atelier report & métrés",
  robots: { index: false, follow: false },
};

const REPORT_POINTS: readonly ReportPoint[] = [
  { label: "A", point: { x: 0, y: 0 } },
  { label: "B", point: { x: 1250, y: 0 } },
  { label: "C", point: { x: 1250, y: 900 } },
  { label: "D", point: { x: 620, y: 1460 } },
  { label: "E", point: { x: 0, y: 900 } },
];

export default function AtelierPreviewPage() {
  return (
    <main className="shell" style={{ paddingBlock: 40, display: "grid", gap: 18, maxWidth: 880 }}>
      <header>
        <p className="eyebrow">Aperçu interne</p>
        <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 500, margin: 0 }}>
          Atelier — report &amp; métrés
        </h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>
          Rendu de contrôle des composants sur données figées. Réduire la fenêtre à 375 / 430 px
          pour vérifier le passage en cartes verticales.
        </p>
      </header>

      <ReportTableView
        points={REPORT_POINTS}
        measurementOrigin="calibrated"
        caption="Contour relevé sur photo calibrée, repère chantier (O en bas à gauche)."
      />

      <WitnessDimensionCard editable />

      <NomenclatureTable
        input={{
          lengthsMm: [
            { label: "Contour principal", value: 5460 },
            { label: "Gorge LED périmétrique", value: 5040, quality: "estimate" },
          ],
          surfacesM2: [{ label: "Surface plafond", value: 1.42 }],
          counts: [{ label: "Spots encastrés", value: 6 }],
        }}
        margin={{ kind: "preset", percent: 10 }}
      />

      <MarginSelector baseMm={5460} defaultValue={{ kind: "preset", percent: 10 }} unitLabel="mm" />

      <ProfilePlanCard
        input={{ type: "Cornière plafond", totalLengthMm: 5460, barLengthMm: 3000, margin: { kind: "preset", percent: 10 } }}
      />

      <LightingSummaryCard
        summary={{ spot: 6, "led-supply": 1 }}
        led={{ totalLengthMm: 5040, withMarginMm: 5544, breaks: 0, rollCount: 2 }}
      />
    </main>
  );
}
