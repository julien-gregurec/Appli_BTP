import type {
  AmbigramResult,
  CandidateOrigin,
  ScoreBreakdown,
  ScoreWeights,
} from "@/lib/types";

type ScoreInput = {
  name: string;
  syllables: number;
  origin: CandidateOrigin;
  phoneticScore: number;
  internationalScore: number;
  ambigram: AmbigramResult;
  weights: ScoreWeights;
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function scoreCandidate(input: ScoreInput): ScoreBreakdown {
  const { name, phoneticScore, internationalScore, ambigram, weights } = input;
  const uniqueLetters = new Set(name.toLowerCase()).size;
  const vowelRatio = (name.match(/[aeiouy]/gi)?.length ?? 0) / name.length;
  const repeatedPenalty = /(.)\1\1/i.test(name) ? 30 : 0;

  const raw = {
    memorability: clamp(92 - Math.abs(name.length - 6) * 11 - repeatedPenalty),
    french: clamp(phoneticScore),
    international: clamp(internationalScore),
    elegance: clamp(92 - Math.abs(vowelRatio - 0.48) * 95 - repeatedPenalty),
    distinctiveness: clamp(48 + uniqueLetters * 7 - (/(ia|io|ly)$/i.test(name) ? 12 : 0)),
    domains: 50,
    crowding: 50,
    trademark: 50,
    graphic: clamp(42 + Math.max(ambigram.rotationRatio, ambigram.mirrorRatio) * 58),
  };

  const weightTotal = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;
  const total = Math.round(
    Object.entries(weights).reduce(
      (sum, [key, weight]) => sum + raw[key as keyof typeof raw] * weight,
      0,
    ) / weightTotal,
  );

  return { ...raw, total, confidence: "préliminaire" };
}
