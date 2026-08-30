"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tentativeMfaAutorisee } from "@/lib/rate-limit-mfa";
import { destinationInterneSure } from "@/lib/securite/redirections";

// Messages neutres : « mauvais code » et « code expiré » sont indistinguables et
// le code TOTP n'apparaît jamais dans une URL, un log ou un message.
const MESSAGE_CODE = "Code incorrect ou expiré.";
const MESSAGE_INDISPONIBLE = "Vérification indisponible. Réessayez dans un instant.";
const MESSAGE_TROP = "Trop de tentatives. Réessayez dans quelques minutes.";
const MESSAGE_SANS_FACTEUR = "Aucun facteur d’authentification vérifié n’est associé à ce compte.";

function retour(next: string, message: string): never {
  redirect(`/login/mfa?next=${encodeURIComponent(next)}&error=${encodeURIComponent(message)}`);
}

export async function verifierMfaColorsAction(formData: FormData) {
  const brut = formData.get("next");
  const next = destinationInterneSure(typeof brut === "string" ? brut : null);
  const code = String(formData.get("code") ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!/^\d{6}$/.test(code)) retour(next, MESSAGE_CODE);

  if (!(await tentativeMfaAutorisee(user.id))) retour(next, MESSAGE_TROP);

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
