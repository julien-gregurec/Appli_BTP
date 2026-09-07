import { LIBELLES_STATUT, type StatutReserve } from "@/lib/workflow";

const TONS: Record<StatutReserve, string> = {
  emise: "",
  assignee: "",
  refusee_responsabilite: "refus",
  acceptee: "",
  levee_demandee: "attente",
  levee_refusee: "refus",
  levee: "levee",
  annulee: "",
};

export function EtiquetteStatut({ statut }: { statut: StatutReserve }) {
  return <span className={`etiquette ${TONS[statut]}`.trim()}>{LIBELLES_STATUT[statut]}</span>;
}
