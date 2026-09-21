import type { AmbigramMapping, AmbigramResult } from "@/lib/types";

function ratioFor(
  value: string,
  mappings: AmbigramMapping[],
  reverse: boolean,
): number {
  const chars = value.toUpperCase().split("");
  const target = reverse ? [...chars].reverse() : chars;
  let matched = 0;

  for (let index = 0; index < chars.length; index += 1) {
    const from = chars[index];
    const expected = target[index];
    if (mappings.some((item) => item.enabled && item.from === from && item.to === expected)) {
      matched += 1;
    }
  }

  return chars.length ? matched / chars.length : 0;
}

function compatibility(ratio: number): AmbigramResult["rotation"] {
  if (ratio === 1) return "compatible";
  if (ratio >= 0.5) return "partial";
  return "incompatible";
}

export function analyzeAmbigram(
  name: string,
  mappings: AmbigramMapping[],
): AmbigramResult {
  const normalized = name.toUpperCase().replace(/[^A-Z]/g, "");
  const palindrome = normalized === normalized.split("").reverse().join("");
  const rotationRatio = ratioFor(normalized, mappings, true);

  const mirrorSelfLetters = new Set(["A", "H", "I", "M", "O", "T", "U", "V", "W", "X", "Y"]);
  const mirrorMatches = normalized
    .split("")
    .filter((letter) => mirrorSelfLetters.has(letter)).length;
  const mirrorRatio = normalized.length ? mirrorMatches / normalized.length : 0;

  const bestRatio = Math.max(rotationRatio, mirrorRatio, palindrome ? 1 : 0);
  const level = bestRatio >= 0.85 ? "favorable" : bestRatio >= 0.5 ? "custom" : "low";
  const label =
    level === "favorable"
      ? "Structure favorable à un ambigramme"
      : level === "custom"
        ? "Nécessite un dessin typographique sur mesure"
        : "Faible potentiel d’ambigramme";

  return {
    palindrome,
    rotation: compatibility(rotationRatio),
    mirror: compatibility(mirrorRatio),
    rotationRatio,
    mirrorRatio,
    level,
    label,
  };
}
