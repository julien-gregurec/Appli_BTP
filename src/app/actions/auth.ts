"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { headers } from "next/headers";

async function origineApplication() {
  const entetes = await headers();
  return entetes.get("origin") ?? `${entetes.get("x-forwarded-proto") ?? "https"}://${entetes.get("x-forwarded-host") ?? entetes.get("host")}`;
}

export async function signupAction(formData: FormData) {
  if (isEmailLoginDisabled()) {
    redirect("/dashboard");
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const nom = String(formData.get("nom") ?? "");
  const prenom = String(formData.get("prenom") ?? "");
  const codeEntreprise = String(formData.get("code_entreprise") ?? "").trim().toUpperCase();
  const numeroEmploye = String(formData.get("numero_employe") ?? "").trim().toUpperCase();

  const supabase = await createClient();
  const origine = await origineApplication();

  // Le profil public.utilisateurs est créé côté base par le trigger on_auth_user_created,
  // qui lit nom/prenom depuis les métadonnées passées ici.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { nom, prenom, code_entreprise: codeEntreprise || null, numero_employe: numeroEmploye || null },
      emailRedirectTo: `${origine}/auth/callback?next=${encodeURIComponent(numeroEmploye ? `/onboarding?numero=${numeroEmploye}` : codeEntreprise ? `/onboarding?code=${codeEntreprise}` : "/onboarding")}`,
    },
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

  redirect(numeroEmploye ? `/onboarding?numero=${encodeURIComponent(numeroEmploye)}` : codeEntreprise ? `/onboarding?code=${encodeURIComponent(codeEntreprise)}` : "/onboarding");
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
  // Un compte dépôt ne peut pas être déconnecté sans son mot de passe : sinon
  // n'importe qui à la borne le sortirait d'un clic. On l'envoie vers la borne
  // où la déconnexion protégée est proposée.
  const { data: compteDepot } = await supabase.rpc("est_compte_depot_courant");
  if (compteDepot === true) {
    redirect("/stock/borne?deconnexion=1");
  }
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Déconnexion protégée du compte dépôt : seule une personne connaissant le mot
 * de passe du compte peut le déconnecter. On revérifie le mot de passe du compte
 * courant avant de fermer la session ; un mot de passe erroné ne touche pas la
 * session en cours (la borne reste ouverte).
 */
export async function deconnecterCompteDepotAction(formData: FormData) {
  if (isEmailLoginDisabled()) redirect("/dashboard");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const { data: compteDepot } = await supabase.rpc("est_compte_depot_courant");
  if (compteDepot !== true) {
    // Compte ordinaire : déconnexion simple.
    await supabase.auth.signOut();
    redirect("/login");
  }

  const motDePasse = String(formData.get("mot_de_passe") ?? "");
  if (!motDePasse) redirect(`/stock/borne?deconnexion=1&erreur=${encodeURIComponent("Mot de passe requis")}`);

  // Revérifie le mot de passe du compte dépôt lui-même.
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: motDePasse });
  if (error) {
    redirect(`/stock/borne?deconnexion=1&erreur=${encodeURIComponent("Mot de passe incorrect")}`);
  }
  await supabase.auth.signOut();
  redirect("/login");
}

export async function demanderReinitialisationAction(formData: FormData) {
  if (isEmailLoginDisabled()) redirect("/dashboard");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect(`/mot-de-passe-oublie?error=${encodeURIComponent("Saisissez votre adresse email.")}`);
  const supabase = await createClient();
  const origine = await origineApplication();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origine}/auth/callback?next=${encodeURIComponent("/nouveau-mot-de-passe")}`,
  });
  if (error) redirect(`/mot-de-passe-oublie?error=${encodeURIComponent(error.message)}`);
  redirect(`/mot-de-passe-oublie?message=${encodeURIComponent("Si ce compte existe, un lien de réinitialisation vient d’être envoyé.")}`);
}

export async function modifierMotDePasseAction(formData: FormData) {
  if (isEmailLoginDisabled()) redirect("/dashboard");
  const motDePasse = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("password_confirmation") ?? "");
  if (motDePasse.length < 8) redirect(`/nouveau-mot-de-passe?error=${encodeURIComponent("Le mot de passe doit contenir au moins 8 caractères.")}`);
  if (motDePasse !== confirmation) redirect(`/nouveau-mot-de-passe?error=${encodeURIComponent("Les deux mots de passe ne correspondent pas.")}`);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/mot-de-passe-oublie?error=${encodeURIComponent("Le lien a expiré. Demandez un nouveau lien.")}`);
  const { error } = await supabase.auth.updateUser({ password: motDePasse });
  if (error) redirect(`/nouveau-mot-de-passe?error=${encodeURIComponent(error.message)}`);
  await supabase.auth.signOut();
  redirect(`/login?message=${encodeURIComponent("Mot de passe modifié. Vous pouvez maintenant vous connecter.")}`);
}
