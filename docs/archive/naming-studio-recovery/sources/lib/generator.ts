import { analyzeAmbigram } from "@/lib/ambigram";
import { DEFAULT_AMBIGRAM_MAPPINGS, DEFAULT_WEIGHTS } from "@/lib/defaults";
import { scoreCandidate } from "@/lib/scoring";
import { isTooClose } from "@/lib/similarity";
import type {
  AmbigramMapping,
  Candidate,
  CandidateOrigin,
  NameStyle,
  NamingBrief,
  ScoreWeights,
} from "@/lib/types";

const CONSONANTS = ["b", "d", "f", "g", "j", "k", "l", "m", "n", "p", "r", "s", "t", "v", "z"];
const VOWELS = ["a", "e", "i", "o", "u", "y"];
const PATTERNS = ["CVCV", "CVCVV", "VCVCV", "CVVCV", "CVCVC", "CVVCVC"];
const FOUNDER = ["ju", "jul", "li", "en", "gre", "greg", "gur", "rec"];
const MEANING_ROOTS: Record<string, string[]> = {
  freedom: ["libe", "elia", "fria", "leva", "sora"],
  sky: ["aero", "orbi", "astra", "celo", "hori"],
  premium: ["elis", "aure", "vel", "or", "sera"],
  mythology: ["eos", "iris", "nyx", "thea", "ero"],
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let result = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function approximateSyllables(value: string): number {
  return Math.max(1, value.toLowerCase().match(/[aeiouy]+/g)?.length ?? 1);
}

function phoneticScore(value: string): number {
  let score = 92;
  if (/[bcdfghjklmnpqrstvwxz]{3,}/i.test(value)) score -= 45;
  if (/[jqwx]{2}/i.test(value)) score -= 25;
  if (/(iy|yi|uo|oa){2}/i.test(value)) score -= 15;
  if (!/[aeiouy]/i.test(value)) score -= 60;
  return Math.max(0, score);
}

function internationalScore(value: string): number {
  let score = 88;
  if (/[jqwx]/i.test(value)) score -= 8;
  if (/[éèêàçùô]/i.test(value)) score -= 50;
  if (value.length > 7) score -= 10;
  return Math.max(0, score);
}

function makePhonetic(random: () => number): string {
  return pick(PATTERNS, random)
    .split("")
    .map((token) => pick(token === "C" ? CONSONANTS : VOWELS, random))
    .join("");
}

function makeSyllabic(brief: NamingBrief, random: () => number): string {
  const count = brief.minSyllables + Math.floor(random() * (brief.maxSyllables - brief.minSyllables + 1));
  return Array.from({ length: count }, () => pick(brief.syllables, random)).join("");
}

function makeFounder(random: () => number): string {
  const first = pick(FOUNDER, random);
  const choices = FOUNDER.filter((fragment) => fragment !== first);
  const second = pick(choices, random);
  const bridge = /[aeiouy]$/i.test(first) || /^[aeiouy]/i.test(second) ? "" : pick(["a", "e", "i"], random);
  return `${first}${bridge}${second}`;
}

function makeMeaning(style: NameStyle, random: () => number): string {
  const roots = MEANING_ROOTS[style] ?? ["ela", "ori", "sena", "viva", "lume"];
  const root = pick(roots, random);
  const ending = pick(["a", "e", "i", "o", "is", "en", "or"], random);
  return `${root}${ending}`;
}

function makeSymmetry(random: () => number, quasi: boolean): string {
  const half = Array.from({ length: 2 + Math.floor(random() * 2) }, () =>
    pick(["a", "e", "i", "o", "n", "s", "x", "v"], random),
  ).join("");
  const mirrored = half.split("").reverse().join("");
  return quasi
    ? `${half}${pick(VOWELS, random)}${mirrored.slice(1)}`
    : `${half}${pick(["", "a", "o"], random)}${mirrored}`;
}

function originFor(style: NameStyle, engine: CandidateOrigin["engine"]): CandidateOrigin {
  const descriptions: Record<CandidateOrigin["engine"], string> = {
    phonetic: "Structure consonne-voyelle optimisée pour la prononciation",
    syllabic: "Composition de syllabes douces et modifiables",
    meaning: "Racines évocatrices utilisées comme inspiration, sans valeur de traduction",
    founder: "Contraction musicale de fragments de Julien Gregurec",
    symmetry: "Construction orientée vers la symétrie typographique",
  };
  return { engine, style, explanation: descriptions[engine] };
}

function generateRaw(
  brief: NamingBrief,
  random: () => number,
): { value: string; origin: CandidateOrigin } {
  const style = pick<NameStyle>(
    brief.styles.length ? brief.styles : (["invented"] satisfies NameStyle[]),
    random,
  );
  if (style === "founder") return { value: makeFounder(random), origin: originFor(style, "founder") };
  if (style === "palindrome") return { value: makeSymmetry(random, false), origin: originFor(style, "symmetry") };
  if (style === "quasi-palindrome" || style === "rotational" || style === "mirror") {
    return { value: makeSymmetry(random, true), origin: originFor(style, "symmetry") };
  }
  if (
    style === "freedom" ||
    style === "sky" ||
    style === "premium" ||
    style === "mythology"
  ) {
    return { value: makeMeaning(style, random), origin: originFor(style, "meaning") };
  }
  if (style === "soft" && random() > 0.35) {
    return { value: makeSyllabic(brief, random), origin: originFor(style, "syllabic") };
  }
  return { value: makePhonetic(random), origin: originFor(style, "phonetic") };
}

export function generateCandidates(
  brief: NamingBrief,
  options?: {
    rejected?: string[];
    mappings?: AmbigramMapping[];
    weights?: ScoreWeights;
    seed?: string;
  },
): Candidate[] {
  const rejected = options?.rejected ?? [];
  const mappings = options?.mappings ?? DEFAULT_AMBIGRAM_MAPPINGS;
  const weights = options?.weights ?? DEFAULT_WEIGHTS;
  const blocked = [...brief.forbiddenPatterns, ...rejected];
  const random = mulberry32(hashString(options?.seed ?? JSON.stringify(brief)));
  const unique = new Map<string, Candidate>();
  const maxAttempts = brief.count * 30;

  for (let attempt = 0; attempt < maxAttempts && unique.size < brief.count; attempt += 1) {
    const raw = generateRaw(brief, random);
    const normalized = raw.value.toLowerCase().replace(/[^a-z]/g, "");
    const syllableCount = approximateSyllables(normalized);
    if (normalized.length < brief.minLength || normalized.length > brief.maxLength) continue;
    if (syllableCount < brief.minSyllables || syllableCount > brief.maxSyllables) continue;
    if (/[bcdfghjklmnpqrstvwxz]{4,}/i.test(normalized)) continue;
    if (isTooClose(normalized, blocked)) continue;

    const name = titleCase(normalized);
    const ambigram = analyzeAmbigram(name, mappings);
    const french = phoneticScore(name);
    const international = internationalScore(name);
    const score = scoreCandidate({
      name,
      syllables: syllableCount,
      origin: raw.origin,
      phoneticScore: french,
      internationalScore: international,
      ambigram,
      weights,
    });
    const warnings: string[] = [];
    if (french < 70) warnings.push("Prononciation française à confirmer");
    if (international < 70) warnings.push("Lecture internationale variable");
    if (ambigram.level !== "favorable") warnings.push(ambigram.label);

    unique.set(normalized, {
      id: normalized,
      name,
      pronunciation: name.toLowerCase().replace(/y/g, "i"),
      letters: name.length,
      syllableCount,
      origin: raw.origin,
      phoneticScore: french,
      internationalScore: international,
      ambigram,
      score,
      warnings,
    });
  }

  return [...unique.values()].sort((a, b) => b.score.total - a.score.total);
}
