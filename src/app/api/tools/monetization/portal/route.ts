import { authenticatedToolsUser, createToolsPortal, toolsJson, toolsOptions } from "@/lib/tools-monetization";

export const OPTIONS = toolsOptions;

export async function POST(request: Request) {
  const user = await authenticatedToolsUser(request);
  if (!user) return toolsJson(request, { error: "Authentification requise" }, 401);
  try {
    const session = await createToolsPortal(user.id);
    if (!session.url) throw new Error("Portail Stripe indisponible");
    return toolsJson(request, { url: session.url });
  } catch (error) {
    return toolsJson(request, { error: error instanceof Error ? error.message : "Portail indisponible" }, 409);
  }
}
