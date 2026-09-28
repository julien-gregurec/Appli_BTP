import { NextResponse } from "next/server";
import { codeHttpSante, evaluerSante, type RapportSantePublic } from "@elsatia/incident-control";
import { lecteurEtatIncident } from "@/lib/incident/etat";
import { controlesSanteGestionPro, profondeurDemandee } from "@/lib/incident/sante";

// Santé de Gestion Pro : réponse publique sans secret (noms de contrôles + ok/ko/non_configure).
// 503 uniquement en OUTAGE (base ou Auth injoignable, ou application coupée) pour les sondes.
// La profondeur publique est mise en cache 5 s par instance : la route, sans authentification,
// ne doit pas devenir un amplificateur de charge vers la base et Auth.
export const dynamic = "force-dynamic";

let cachePublic: { rapport: RapportSantePublic; expire: number } | null = null;

export async function GET(request: Request) {
  const profondeur = profondeurDemandee(request.headers.get("authorization"));
  let rapport: RapportSantePublic;
  if (profondeur === "publique" && cachePublic && cachePublic.expire > Date.now()) {
    rapport = cachePublic.rapport;
  } else {
    rapport = await evaluerSante({
      app: "gestion_pro",
      controles: controlesSanteGestionPro({ profondeur }),
      etat: await lecteurEtatIncident().lire(),
      journaliser: (nom, erreur) =>
        console.error(JSON.stringify({
          event: "health_check_failed",
          check: nom,
          reason: erreur instanceof Error ? erreur.name : "unknown",
        })),
    });
    if (profondeur === "publique") cachePublic = { rapport, expire: Date.now() + 5_000 };
  }
  return NextResponse.json(
    { application: "gestion_pro", profondeur, ...rapport },
    { status: codeHttpSante(rapport), headers: { "Cache-Control": "no-store" } },
  );
}
