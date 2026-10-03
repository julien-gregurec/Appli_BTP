import { statutPublication } from "@/lib/social/types";

export function StatutBadge({ statut }: { statut: string }) {
  const s = statutPublication(statut);
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: s.couleur }}>
      {s.libelle}
    </span>
  );
}
