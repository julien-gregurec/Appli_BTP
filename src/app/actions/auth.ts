"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";

export async function signupAction(formData: FormData) {
  if (isEmailLoginDisabled()) {
    redirect("/dashboard");
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const nom = String(formData.get("nom") ?? "");
  const prenom = String(formData.get("prenom") ?? "");
  const codeEntreprise = String(formData.get("code_entreprise") ?? "").trim().toUpperCase();

  const supabase = await createClient();

  // Le profil public.utilisateurs est créé côté base par le trigger on_auth_user_created,
  // qui lit nom/prenom depuis les métadonnées passées ici.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nom, prenom, code_entreprise: codeEntreprise || null } },
  });
  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }
  if (!data.user) {
    redirect(`/signup?error=${encodeURIComponent("Compte non créé.")}`);
  }

  // Si aucune session n'est retournée, la confirmation d'email est active : on invite à confirmer.
  if (!data.session) {
    redirect("/login?message=" + encodeURIComponent("Compte créé. Vérifie tes emails pour confirmer, puis connecte-toi."));
  }

  redirect(codeEntreprise ? `/onboarding?code=${encodeURIComponent(codeEntreprise)}` : "/onboarding");
}

export async function loginAction(formData: FormData) {
  if (isEmailLoginDisabled()) {
    redirect("/dashboard");
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  if (isEmailLoginDisabled()) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
