import { NextResponse } from "next/server";
import { z } from "zod";
import type { CompanyCheck, CompanyMatch } from "@/lib/types";

const requestSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

type ApiCompany = {
  siren: string;
  nom_complet?: string;
  nom_raison_sociale?: string;
  activite_principale?: string | null;
  etat_administratif?: string;
  score?: number | null;
  siege?: {
    activite_principale?: string | null;
    etat_administratif?: string;
  };
};

function crowdingScore(matches: CompanyMatch[], query: string): number {
  const exact = matches.filter((item) => item.name.toLowerCase() === query.toLowerCase()).length;
  const active = matches.filter((item) => item.active).length;
  return Math.min(10, exact * 3 + Math.min(5, active));
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Nom invalide." }, { status: 400 });
  }

  const sourceUrl = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(parsed.data.name)}&page=1&per_page=10&minimal=true&include=score`;
  try {
    const response = await fetch(sourceUrl, {
      headers: {
        accept: "application/json",
        "user-agent": "NomenaBrandStudio/0.1 contact-local-application",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      const providerMessage = await response.text().catch(() => "");
      throw new Error(
        `Statut ${response.status}${providerMessage ? ` — ${providerMessage.slice(0, 240)}` : ""}`,
      );
    }

    const payload = (await response.json()) as { results?: ApiCompany[] };
    const matches: CompanyMatch[] = (payload.results ?? []).map((item) => ({
      siren: item.siren,
      name: item.nom_raison_sociale ?? item.nom_complet ?? "Dénomination non communiquée",
      activity: item.siege?.activite_principale ?? item.activite_principale ?? null,
      active:
        (item.siege?.etat_administratif ?? item.etat_administratif ?? "A") === "A",
      score: item.score ?? null,
    }));

    const result: CompanyCheck = {
      query: parsed.data.name,
      matches,
      crowdingScore: crowdingScore(matches, parsed.data.name),
      provider: "API Recherche d’entreprises",
      sourceUrl,
      checkedAt: new Date().toISOString(),
      verified: true,
    };
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: "La source publique n’est pas disponible pour le moment.",
        detail: error instanceof Error ? error.message : "Erreur inconnue",
        provider: "API Recherche d’entreprises",
        sourceUrl,
        checkedAt: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
