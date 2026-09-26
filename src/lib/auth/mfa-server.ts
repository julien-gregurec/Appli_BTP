import "server-only";

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decisionGardeMfa } from "@/lib/auth/mfa";
import { destinationInterneSure } from "@/lib/security/redirects";

export async function exigerAal2Plateforme(destination = "/plateforme") {
  const supabase = await createClient();
  const { data: utilisateur, error: erreurUtilisateur } = await supabase.auth.getUser();
  if (erreurUtilisateur || !utilisateur.user) redirect("/login");

  const { data: admin, error: erreurAdmin } = await supabase.rpc("est_plateforme_admin");
  if (erreurAdmin || admin !== true) notFound();

  const { data: aal, error: erreurAal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const decision = decisionGardeMfa(aal, Boolean(erreurAal));
  const prochaine = destinationInterneSure(destination, "/plateforme");
  if (decision === "autoriser") return;
  if (decision === "challenge") redirect(`/mfa/challenge?next=${encodeURIComponent(prochaine)}`);
  if (decision === "enroler") redirect(`/parametres/securite?requis=plateforme&next=${encodeURIComponent(prochaine)}`);
  redirect(`/mfa/challenge?controle=indisponible&next=${encodeURIComponent(prochaine)}`);
}
