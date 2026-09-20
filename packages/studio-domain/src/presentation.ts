import type { AspectRatio } from "./projects";
import { TimelineValidationError, type TimelineClipDraft } from "./timeline";

export const fontRoles = [
  "display",
  "title",
  "subtitle",
  "body",
  "caption",
] as const;
export type FontRole = (typeof fontRoles)[number];
export interface FontStyle {
  family: "sans" | "serif";
  size: number;
  weight: 400 | 700;
  spacing: number;
}
export type Typography = Record<FontRole, FontStyle>;
export interface TextOverlay {
  id: string;
  clip_key: string;
  text: string;
  /** Hidden copy for reversible visibility; renderer reads only text. */
  hidden_text?: string;
  start_ms: number;
  end_ms: number;
  position: "top" | "center" | "bottom";
  alignment: "left" | "center" | "right";
  font_role: FontRole;
  size_role: FontRole;
  weight: 400 | 700;
  animation: "none" | "fade";
  background: "none" | "dark";
  color: string;
  max_lines: number;
}
export interface TimelinePresentation {
  version: 1;
  template: { id: string; version: number; snapshot: object };
  typography: Typography;
  overlays: TextOverlay[];
  logo: {
    asset_id: string;
    clip_key: string;
    position: "top" | "bottom";
    width: number;
  } | null;
}
export const safeAreas: Record<
  AspectRatio,
  { x: number; top: number; bottom: number }
> = {
  "9:16": { x: 0.12, top: 0.12, bottom: 0.22 },
  "16:9": { x: 0.08, top: 0.1, bottom: 0.1 },
  "1:1": { x: 0.1, top: 0.1, bottom: 0.14 },
  "4:5": { x: 0.1, top: 0.1, bottom: 0.18 },
};
// Latin, Cyrillic, Vietnamese/Latin extended, general punctuation, euro and trademark:
// the ranges every bundled Noto face is verified to cover. Emoji and rare symbols have no glyph.
const renderableCharacters =
  /^[\s\u0020-\u007e\u00a0-\u024f\u0400-\u04ff\u1e00-\u1eff\u2010-\u2027\u2030-\u205e\u20ac\u2122]*$/u;
/** Write-path validation: bounded AND drawable with the bundled fonts, so a render cannot fail on glyphs. */
export function renderableText(value: string): string {
  const clean = boundedText(value);
  if (!renderableCharacters.test(clean))
    throw new TimelineValidationError(
      "Ce texte contient des caractères non pris en charge (emoji, symboles rares). Utilisez des lettres, chiffres et ponctuation.",
    );
  return clean;
}
export function boundedText(value: string): string {
  if (
    typeof value !== "string" ||
    value.length > 500 ||
    /[\x00-\x08\x0b-\x1f\x7f]/u.test(value)
  )
    throw new TimelineValidationError(
      "Texte invalide (500 caractères maximum).",
    );
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}
/** Only retime/drop existing overlays; manual edits never resolve the catalogue again. */
export function retimePresentation(
  p: TimelinePresentation | null | undefined,
  clips: TimelineClipDraft[],
): TimelinePresentation | null {
  if (!p) return null;
  const lengths = new Map(
    clips.map((c) => [c.metadata_json.key, c.duration_ms]),
  );
  return {
    ...p,
    overlays: p.overlays.flatMap((o) => {
      const duration = lengths.get(o.clip_key);
      if (!duration || o.start_ms >= duration) return [];
      return [{ ...o, end_ms: Math.min(o.end_ms, duration) }];
    }),
    logo: p.logo && lengths.has(p.logo.clip_key) ? p.logo : null,
  };
}
export function validatePresentation(
  p: TimelinePresentation,
  clips: TimelineClipDraft[],
): void {
  const fail = () => {
    throw new Error("Présentation invalide.");
  };
  if (
    p.version !== 1 ||
    !p.template ||
    !/^[a-z0-9-]{1,80}$/.test(p.template.id) ||
    !Number.isSafeInteger(p.template.version) ||
    p.template.version < 1 ||
    !p.template.snapshot ||
    typeof p.template.snapshot !== "object"
  )
    fail();
  for (const role of fontRoles) {
    const f = p.typography?.[role];
    if (
      !f ||
      !["sans", "serif"].includes(f.family) ||
      ![400, 700].includes(f.weight) ||
      !Number.isFinite(f.size) ||
      f.size < 0.01 ||
      f.size > 0.12 ||
      !Number.isFinite(f.spacing) ||
      f.spacing !== 0
    )
      fail();
  }
  const keyed = clips.filter((c) => c.metadata_json.key);
  const keys = new Map(keyed.map((c) => [c.metadata_json.key!, c]));
  if (
    keys.size !== keyed.length ||
    [...keys.keys()].some((k) => !/^[a-zA-Z0-9-]{1,100}$/.test(k))
  )
    fail();
  if (
    !Array.isArray(p.overlays) ||
    p.overlays.length > 2000 ||
    new Set(p.overlays.map((o) => o.id)).size !== p.overlays.length
  )
    fail();
  for (const o of p.overlays) {
    const clip = keys.get(o.clip_key);
    if (
      !clip ||
      !/^[a-zA-Z0-9-]{1,120}$/.test(o.id) ||
      boundedText(o.text) !== o.text ||
      (o.hidden_text !== undefined &&
        (boundedText(o.hidden_text) !== o.hidden_text || o.text !== "")) ||
      !Number.isSafeInteger(o.start_ms) ||
      !Number.isSafeInteger(o.end_ms) ||
      o.start_ms < 0 ||
      o.end_ms <= o.start_ms ||
      o.end_ms > clip.duration_ms ||
      !["top", "center", "bottom"].includes(o.position) ||
      !["left", "center", "right"].includes(o.alignment) ||
      !fontRoles.includes(o.font_role) ||
      !fontRoles.includes(o.size_role) ||
      ![400, 700].includes(o.weight) ||
      !["none", "fade"].includes(o.animation) ||
      !["none", "dark"].includes(o.background) ||
      !/^#[0-9a-fA-F]{6}$/.test(o.color) ||
      !Number.isInteger(o.max_lines) ||
      o.max_lines < 1 ||
      o.max_lines > 4
    )
      fail();
  }
  if (
    p.logo &&
    (!/^[0-9a-f-]{36}$/i.test(p.logo.asset_id) ||
      !keys.has(p.logo.clip_key) ||
      !["top", "bottom"].includes(p.logo.position) ||
      !Number.isFinite(p.logo.width) ||
      p.logo.width < 0.05 ||
      p.logo.width > 0.3)
  )
    fail();
}
