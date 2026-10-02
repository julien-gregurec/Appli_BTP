/**
 * Diagnostic de configuration mémoire, journalisé une fois au démarrage du serveur
 * (ELSATIA_GP_HEAVY_PAGES_PDF_CAPACITY_V1 § 7).
 *
 * Mesuré : Node 22 CONNAÎT la limite du conteneur (`process.constrainedMemory()`), mais V8 dérive
 * son plafond de heap de la RAM de l'HÔTE (heap_size_limit ≈ 8,2 Go sous un cgroup de 512 Mo sur
 * un hôte de 16 Go). Sans `--max-old-space-size`, le GC laisse grossir le heap jusqu'à l'OOM kill
 * du conteneur. Ce diagnostic rend la situation visible dans les journaux de chaque instance ; il
 * ne modifie rien.
 */
export type DiagnosticMemoire = {
  heapLimitMo: number;
  limiteConteneurMo: number | null;
  pdfConcurrence: number;
  ok: boolean;
  message: string;
};

const MO = 1024 * 1024;

export function diagnostiquerMemoire(entree: { heapLimit: number; contrainte: number | undefined; pdfConcurrence: number }): DiagnosticMemoire {
  const heapLimitMo = Math.round(entree.heapLimit / MO);
  // 0 ou une valeur absurde (≥ 2^60) signifie « pas de limite » selon les plateformes.
  const limiteConteneurMo = entree.contrainte && entree.contrainte > 0 && entree.contrainte < 2 ** 60 ? Math.round(entree.contrainte / MO) : null;
  if (limiteConteneurMo === null) {
    return { heapLimitMo, limiteConteneurMo, pdfConcurrence: entree.pdfConcurrence, ok: true, message: "aucune limite mémoire de conteneur détectée" };
  }
  const ok = heapLimitMo <= limiteConteneurMo * 0.75;
  return {
    heapLimitMo,
    limiteConteneurMo,
    pdfConcurrence: entree.pdfConcurrence,
    ok,
    message: ok
      ? "plafond de heap V8 compatible avec la limite du conteneur"
      : `plafond de heap V8 (${heapLimitMo} Mo) supérieur à 75 % de la limite du conteneur (${limiteConteneurMo} Mo) : définir NODE_OPTIONS=--max-old-space-size (voir ELSATIA_GP_HEAVY_PAGES_PDF_CAPACITY_V1 § 7)`,
  };
}

export async function journaliserConfigurationMemoire() {
  const { getHeapStatistics } = await import("node:v8");
  const { optionsDepuisEnv } = await import("@/lib/pdf/file-pdf");
  const diagnostic = diagnostiquerMemoire({
    heapLimit: getHeapStatistics().heap_size_limit,
    contrainte: typeof process.constrainedMemory === "function" ? process.constrainedMemory() : undefined,
    pdfConcurrence: optionsDepuisEnv().concurrence,
  });
  const ligne = JSON.stringify({ event: "memory_config", ...diagnostic });
  if (diagnostic.ok) console.info(ligne);
  else console.warn(ligne);
}
