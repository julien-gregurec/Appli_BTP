import { authenticatedToolsUser, createToolsCheckout, isToolsSku, toolsJson, toolsOptions } from "@/lib/tools-monetization";

export const OPTIONS = toolsOptions;

export async function POST(request: Request) {
  const user = await authenticatedToolsUser(request);
  if (!user) return toolsJson(request, { error: "Authentification requise" }, 401);
  const body = await request.json().catch(() => null) as { sku?: unknown } | null;
  if (!isToolsSku(body?.sku)) return toolsJson(request, { error: "Offre Tools invalide" }, 400);
  try {
    const session = await createToolsCheckout(user, body.sku);
    if (!session.url) throw new Error("Checkout Stripe indisponible");
    return toolsJson(request, { url: session.url });
  } catch (error) {
    return toolsJson(request, { error: error instanceof Error ? error.message : "Checkout indisponible" }, 409);
  }
}
