import { NextResponse } from "next/server";
import { AccesSocialRefuse, consommerQuota, exigerSocial } from "@/lib/social/acces";
import { configLinkedIn, configMeta, redirectUriSocial } from "@/lib/social/config";
import { urlAutorisationLinkedIn } from "@/lib/social/linkedin";
import { urlAutorisationMeta } from "@/lib/social/meta";
import { COOKIE_OAUTH, creerEtatOAuth } from "@/lib/social/securite";

type Contexte = { params: Promise<{ fournisseur: string }> };

function retour(request: Request, message: string) {
  const url = new URL("/plateforme/social/comptes", request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

// Démarre une connexion OAuth côté serveur (Administrateur ELSATIA Social uniquement).
export async function GET(request: Request, { params }: Contexte) {
  const { fournisseur } = await params;
  if (fournisseur !== "meta" && fournisseur !== "linkedin") return NextResponse.json({ error: "Fournisseur inconnu" }, { status: 404 });
  let email: string;
  try {
    email = (await exigerSocial("gerer_comptes")).email;
  } catch (e) {
    return retour(request, e instanceof AccesSocialRefuse ? e.message : "Accès refusé");
  }
  if (!(await consommerQuota(`oauth:${email}`, 10, 3600))) return retour(request, "Trop de tentatives de connexion : réessayer dans une heure");
  const configure = fournisseur === "meta" ? configMeta().configure : configLinkedIn().configure;
  if (!configure) return retour(request, fournisseur === "meta" ? "Application Meta non configurée (META_APP_ID / META_APP_SECRET)" : "Application LinkedIn non configurée (LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET)");

  const { etat, nonce } = creerEtatOAuth(fournisseur, email);
  const destination = fournisseur === "meta" ? urlAutorisationMeta(etat, redirectUriSocial("meta")) : urlAutorisationLinkedIn(etat, redirectUriSocial("linkedin"));
  const reponse = NextResponse.redirect(destination);
  reponse.cookies.set(COOKIE_OAUTH, nonce, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/social/oauth", maxAge: 600 });
  return reponse;
}
