import type { AmbigramMapping, NamingBrief, ScoreWeights } from "@/lib/types";

export const DEFAULT_BRIEF: NamingBrief = {
  sector: "Éditeur de logiciels, SaaS et applications",
  values: ["liberté", "simplicité", "sérénité", "maîtrise", "innovation"],
  minLength: 4,
  maxLength: 7,
  minSyllables: 2,
  maxSyllables: 3,
  styles: ["invented", "soft", "premium", "freedom", "sky", "founder", "neutral"],
  syllables: [
    "la", "li", "lu", "ly", "na", "ne", "ni", "no", "ra", "re", "ri", "ro",
    "ya", "ye", "yi", "ae", "ia", "ea", "el", "al", "or",
  ],
  forbiddenPatterns: [
    "tech", "soft", "cloud", "digital", "ai", "labs",
    "liria", "lyria", "naya", "aveva", "navia", "nova", "lyra", "nysa", "maia", "vega", "sonos",
  ],
  threshold: 68,
  count: 1000,
};

export const DEFAULT_WEIGHTS: ScoreWeights = {
  memorability: 15,
  french: 10,
  international: 10,
  elegance: 15,
  distinctiveness: 15,
  domains: 15,
  crowding: 10,
  trademark: 5,
  graphic: 5,
};

export const DEFAULT_AMBIGRAM_MAPPINGS: AmbigramMapping[] = [
  ["A", "V", false], ["V", "A", false], ["B", "B", false],
  ["B", "P", true], ["P", "B", true], ["E", "E", false],
  ["H", "H", false], ["H", "Y", true], ["Y", "H", false],
  ["I", "I", false], ["K", "K", false], ["N", "N", true],
  ["N", "U", false], ["U", "N", false], ["O", "O", false],
  ["S", "S", false], ["X", "X", false],
].map(([from, to, optional], index) => ({
  id: `${from}-${to}-${index}`,
  from: String(from),
  to: String(to),
  optional: Boolean(optional),
  enabled: true,
}));

export const STYLE_LABELS: Record<string, string> = {
  invented: "Mot inventé",
  soft: "Doux et vocalique",
  premium: "Premium",
  freedom: "Liberté",
  sky: "Ciel et horizon",
  mythology: "Mythologie",
  founder: "Fondateur",
  neutral: "Court et neutre",
  palindrome: "Palindrome",
  "quasi-palindrome": "Quasi-palindrome",
  rotational: "Rotation 180°",
  mirror: "Effet miroir",
};
