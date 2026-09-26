import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { peutSupprimerFacteur } from "@/lib/auth/mfa";

const REPONSE_GENERIQUE = { error: "Impossible de modifier ce facteur MFA." };

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: utilisateur, error: erreurUtilisateur } = await supabase.auth.getUser();
  if (erreurUtilisateur || !utilisateur.user) return NextResponse.json(REPONSE_GENERIQUE, { status: 401 });

  let facteurId = "";
  try {
    const corps = (await request.json()) as { factorId?: unknown };
    facteurId = typeof corps.factorId === "string" ? corps.factorId : "";
  } catch {
    return NextResponse.json(REPONSE_GENERIQUE, { status: 400 });
  }
  if (!facteurId) return NextResponse.json(REPONSE_GENERIQUE, { status: 400 });

  const [{ data: liste, error: erreurListe }, { data: aal, error: erreurAal }, { data: role, error: erreurRole }] =
    await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.rpc("plateforme_role_courant"),
    ]);
  if (erreurListe || erreurAal || erreurRole || !liste || !aal) {
    return NextResponse.json(REPONSE_GENERIQUE, { status: 503 });
  }

  const facteur = liste.all.find((item) => item.id === facteurId && item.factor_type === "totp");
  if (!facteur) return NextResponse.json(REPONSE_GENERIQUE, { status: 404 });

  let nombreAdminsTotalActifs: number | null = null;
  if (role === "total") {
    const { data: admins, error } = await supabase.rpc("plateforme_lister_admins");
    if (error) return NextResponse.json(REPONSE_GENERIQUE, { status: 503 });
    nombreAdminsTotalActifs = (admins ?? []).filter(
      (admin: { role?: string; actif?: boolean; statut_identite?: string }) =>
        admin.role === "total" && admin.actif === true && admin.statut_identite === "active",
    ).length;
  }

  const autorisation = peutSupprimerFacteur({
    facteur,
    facteurs: liste.all,
    aalActuel: aal.currentLevel,
    rolePlateforme: typeof role === "string" ? role : null,
    nombreAdminsTotalActifs,
  });
  if (!autorisation.autorise) {
    return NextResponse.json({ error: autorisation.raison }, { status: 403 });
  }

  const { error } = await supabase.auth.mfa.unenroll({ factorId: facteur.id });
  if (error) return NextResponse.json(REPONSE_GENERIQUE, { status: 400 });
  await supabase.auth.refreshSession();
  return NextResponse.json({ ok: true });
}
