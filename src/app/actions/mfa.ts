"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { appliquerRateLimit } from "@/lib/security/rate-limit";
import { destinationInterneSure } from "@/lib/security/redirects";

// Messages neutres : ne jamais distinguer « mauvais code » de « code expiré »
// ni révéler l'existence/la nature d'un facteur. Le code TOTP n'apparaît jamais
// dans une URL, un log ou un message.
const MESSAGE_CODE = "Code incorrect ou expiré.";
const MESSAGE_INDISPONIBLE = "Vérification indisponible. Réessayez dans un instant.";
const MESSAGE_TROP = "Trop de tentatives. Réessayez dans quelques minutes.";
const MESSAGE_SANS_FACTEUR = "Aucun facteur d’authentification vérifié n’est associé à ce compte.";

function retour(next: string, message: string): never {
  redirect(`/login/mfa?next=${encodeURIComponent(next)}&error=${encodeURIComponent(message)}`);
}

export async function verifierMfaConnexionAction(formData: FormData) {
  const nextBrut = formData.get("next");
  const next = destinationInterneSure(typeof nextBrut === "string" ? nextBrut : null, "/dashboard");
  const code = String(formData.get("code") ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Format d'abord : une saisie manifestement invalide ne consomme pas le
  // budget anti-bruteforce (le proxy applique déjà une limite de chemin).
  if (!/^\d{6}$/.test(code)) retour(next, MESSAGE_CODE);

  // Limite anti-bruteforce dédiée à la vérification du second facteur, en plus
  // de la limite de chemin appliquée par le proxy (clé auth:mfa).
  const limite = await appliquerRateLimit(
    new Request("https://interne.invalid", { headers: new Headers(await headers()) }),
    createAdminClient(),
    [
      { cle: "auth:mfa:tentative", maximum: 5, fenetreSecondes: 300, portee: "utilisateur" },
      { cle: "auth:mfa:tentative-ip", maximum: 20, fenetreSecondes: 300, portee: "ip" },
    ],
    { utilisateurId: user.id },
  );
  if (!limite.autorise) retour(next, MESSAGE_TROP);

  const { data: facteurs } = await supabase.auth.mfa.listFactors();
  const facteur = facteurs?.totp?.find((element) => element.status === "verified") ?? null;
  if (!facteur) retour(next, MESSAGE_SANS_FACTEUR);

  const { data: defi, error: erreurDefi } = await supabase.auth.mfa.challenge({ factorId: facteur.id });
  if (erreurDefi || !defi) retour(next, MESSAGE_INDISPONIBLE);

  const { error: erreurVerification } = await supabase.auth.mfa.verify({
    factorId: facteur.id,
    challengeId: defi.id,
    code,
  });
  if (erreurVerification) retour(next, MESSAGE_CODE);

  const { data: niveau } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (niveau?.currentLevel !== "aal2") retour(next, MESSAGE_INDISPONIBLE);

  redirect(next);
}
