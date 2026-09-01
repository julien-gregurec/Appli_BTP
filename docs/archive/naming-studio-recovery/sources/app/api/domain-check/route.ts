import { NextResponse } from "next/server";
import { z } from "zod";
import type { DomainCheck, DomainStatus } from "@/lib/types";

const requestSchema = z.object({
  domains: z.array(
    z.string().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.[a-z]{2,24}$/),
  ).min(1).max(20),
});

type CloudflareDomain = {
  name: string;
  registrable: boolean;
  reason?: string;
  tier?: "standard" | "premium";
  pricing?: {
    currency: string;
    registration_cost: string;
    renewal_cost: string;
  };
};

function cloudflareStatus(item: CloudflareDomain): DomainStatus {
  if (item.registrable) return item.tier === "premium" ? "premium" : "available";
  if (item.reason === "domain_premium") return "premium";
  if (item.reason === "domain_unavailable") return "unavailable";
  return "manual";
}

async function checkWithCloudflare(domains: string[]): Promise<DomainCheck[]> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID!;
  const token = process.env.CLOUDFLARE_API_TOKEN!;
  const sourceUrl = "https://developers.cloudflare.com/api/resources/registrar/methods/check";
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/registrar/domain-check`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ domains }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Cloudflare a répondu avec le statut ${response.status}`);
  }

  const payload = (await response.json()) as {
    success: boolean;
    result?: { domains?: CloudflareDomain[] };
  };
  if (!payload.success || !payload.result?.domains) {
    throw new Error("Réponse Cloudflare incomplète");
  }

  const checkedAt = new Date().toISOString();
  return payload.result.domains.map((item) => ({
    domain: item.name,
    status: cloudflareStatus(item),
    provider: "Cloudflare Registrar",
    sourceUrl,
    checkedAt,
    verified: true,
    detail: item.registrable
      ? "Disponible à l’enregistrement au moment précis du contrôle. Non réservé."
      : item.reason === "domain_unavailable"
        ? "Non enregistrable ou réservé au moment du contrôle."
        : `Contrôle manuel requis : ${item.reason ?? "raison non communiquée"}.`,
    pricing: item.pricing
      ? {
          currency: item.pricing.currency,
          registrationCost: item.pricing.registration_cost,
          renewalCost: item.pricing.renewal_cost,
        }
      : undefined,
  }));
}

async function checkWithRdap(domain: string): Promise<DomainCheck> {
  const endpoint = `https://rdap.org/domain/${encodeURIComponent(domain)}`;
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(endpoint, {
      headers: { accept: "application/rdap+json, application/json" },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });

    if (response.ok) {
      return {
        domain,
        status: "registered",
        provider: "RDAP",
        sourceUrl: endpoint,
        checkedAt,
        verified: true,
        detail: "Un enregistrement RDAP a été trouvé. Le domaine est enregistré.",
      };
    }

    if (response.status === 404) {
      return {
        domain,
        status: "manual",
        provider: "RDAP",
        sourceUrl: endpoint,
        checkedAt,
        verified: false,
        detail: "Aucun enregistrement RDAP trouvé. Cela ne prouve pas la disponibilité.",
      };
    }

    return {
      domain,
      status: "unverified",
      provider: "RDAP",
      sourceUrl: endpoint,
      checkedAt,
      verified: false,
      detail: `Information indisponible (statut RDAP ${response.status}).`,
    };
  } catch {
    return {
      domain,
      status: "unverified",
      provider: "RDAP",
      sourceUrl: endpoint,
      checkedAt,
      verified: false,
      detail: "Le service RDAP n’a pas pu être joint. Vérification manuelle nécessaire.",
    };
  }
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Liste de domaines invalide.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const hasCloudflare =
    Boolean(process.env.CLOUDFLARE_ACCOUNT_ID) && Boolean(process.env.CLOUDFLARE_API_TOKEN);

  if (hasCloudflare) {
    try {
      const checks = await checkWithCloudflare(parsed.data.domains);
      return NextResponse.json({ mode: "verified", checks });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur fournisseur";
      const checks = await Promise.all(parsed.data.domains.map(checkWithRdap));
      return NextResponse.json({ mode: "rdap-fallback", warning: message, checks });
    }
  }

  const checks = await Promise.all(parsed.data.domains.map(checkWithRdap));
  return NextResponse.json({
    mode: "rdap-only",
    warning:
      "Aucun registrar n’est configuré. RDAP peut confirmer un enregistrement, pas une disponibilité.",
    checks,
  });
}
