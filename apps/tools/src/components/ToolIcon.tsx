import type { ToolId } from "@/lib/catalog";

export function ToolIcon({ id, size = 28 }: { id: ToolId; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 32 32", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (id === "diagonale-rectangle") return <svg {...common}><rect x="4" y="7" width="24" height="18" rx="1" /><path d="M5 24 27 8M7 21v-4h4" /></svg>;
  if (id === "pythagore" || id === "angle-droit-345") return <svg {...common}><path d="M5 25h22L5 7v18Z" /><path d="M5 21h4v4" />{id === "angle-droit-345" && <text x="11" y="23" fill="currentColor" stroke="none" fontSize="7">345</text>}</svg>;
  if (id === "pente") return <svg {...common}><path d="M4 25h24M6 23 26 9" /><path d="m22 9 4 0 0 4" /></svg>;
  if (id === "surface-rectangle") return <svg {...common}><rect x="5" y="6" width="22" height="20" rx="2" /><path d="M10 11h12v10H10z" /></svg>;
  if (id === "cercle") return <svg {...common}><circle cx="16" cy="16" r="11" /><circle cx="16" cy="16" r="1" fill="currentColor" stroke="none" /><path d="M16 16h11" /></svg>;
  if (id === "arc-corde-fleche") return <svg {...common}><path d="M4 23Q16 3 28 23M4 23h24M16 23V12" /><path d="m13 15 3-3 3 3" /></svg>;
  if (["repartition", "entraxes", "fixations"].includes(id)) return <svg {...common}><path d="M4 7h24M4 25h24M6 4v6M26 4v6M8 16h4v6H8zM14 16h4v6h-4zM20 16h4v6h-4z" /></svg>;
  if (id === "repartition-vitrages") return <svg {...common}><rect x="4" y="6" width="24" height="20" /><path d="M12 6v20M20 6v20" /></svg>;
  if (id === "poids-vitrage") return <svg {...common}><rect x="7" y="4" width="18" height="18" /><path d="M11 28h10M16 22v6M11 12h10" /></svg>;
  if (id === "calcul-plaques") return <svg {...common}><rect x="5" y="5" width="16" height="21" /><path d="M11 9h16v18H11" /></svg>;
  if (id === "quantite-peinture") return <svg {...common}><path d="M8 5h16v7H8zM10 12h12v15H10zM14 17h4" /></svg>;
  if (id === "isolation") return <svg {...common}><rect x="5" y="6" width="22" height="20" /><path d="m8 12 5 4-5 4 5 4M19 9l5 4-5 4 5 4" /></svg>;
  return <svg {...common}><path d="M5 26V16a11 11 0 0 1 22 0v10M5 16h22" /><path d="M16 16V5" strokeDasharray="2 2" /></svg>;
}
