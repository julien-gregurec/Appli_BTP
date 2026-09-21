import type { Candidate } from "@/lib/types";

function escapeCell(value: string | number | boolean): string {
  const text = String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function candidatesToCsv(candidates: Candidate[]): string {
  const rows = [
    [
      "Nom", "Prononciation", "Lettres", "Syllabes", "Score global",
      "Score phonétique", "Score international", "Potentiel ambigramme",
      "Origine", "Avertissement",
    ],
    ...candidates.map((candidate) => [
      candidate.name,
      candidate.pronunciation,
      candidate.letters,
      candidate.syllableCount,
      candidate.score.total,
      candidate.phoneticScore,
      candidate.internationalScore,
      candidate.ambigram.label,
      candidate.origin.explanation,
      "Premier filtrage uniquement — vérification approfondie recommandée.",
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(escapeCell).join(";")).join("\n")}`;
}
