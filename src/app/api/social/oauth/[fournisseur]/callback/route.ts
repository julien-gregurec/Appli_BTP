import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminSocial, exigerSocial, type ContexteSocial } from "@/lib/social/acces";
import { journaliser } from "@/lib/social/audit";
import { chiffrerSecret } from "@/lib/social/crypto";
import { echangerCodeLinkedIn, listerOrganisationsAdministrees } from "@/lib/social/linkedin";
import { echangerCodeMeta } from "@/lib/social/meta";
import { masquerSecrets } from "@/lib/social/http";
import { COOKIE_OAUTH, verifierEtatOAuth } from "@/lib/social/securite";
import { redirectUriSocial } from "@/lib/social/config";

type Contexte = { params: Promise<{ fournisseur: string }> };

function retour(request: Request, cle: "error" | "attente", valeur: string) {
  const url = new URL("/plateforme/social/comptes", request.url);
  url.searchParams.set(cle, valeur);
  const reponse = NextResponse.redirect(url);
  reponse.cookies.delete({ name: COOKIE_OAUTH, path: "/api/social/oauth" });
  return reponse;
}

// Retour OAuth : vérifie l'état anti-CSRF, échange le code côté serveur, puis
// conserve le résultat chiffré 15 minutes le temps de choisir la Page / l'organisation.
export async function GET(request: Request, { params }: Contexte) {
  const { fournisseur } = await params;
  if (fournisseur !== "meta" && fournisseur !== "linkedin") return NextResponse.json({ error: "Fournisseur inconnu" }, { status: 404 });
  const url = new URL(request.url);
  const erreurFournisseur = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (erreurFournisseur) return retour(request, "error", `Connexion refusée : ${erreurFournisseur.slice(0, 200)}`);

  let ctx: ContexteSocial;
  try {
    ctx = await exigerSocial("gerer_comptes");
  } catch {
    return retour(request, "error", "Accès refusé");
  }
  const nonce = (await cookies()).get(COOKIE_OAUTH)?.value;
  if (!verifierEtatOAuth(url.searchParams.get("state"), nonce, fournisseur, ctx.utilisateurId)) return retour(request, "error", "Connexion expirée ou invalide : recommencer");
  const code = url.searchParams.get("code");
  if (!code) return retour(request, "error", "Réponse OAuth incomplète");

  const admin = adminSocial();
  try {
    const donnees =
      fournisseur === "meta"
        ? await echangerCodeMeta(code, redirectUriSocial("meta"))
        : await (async () => {
            const jetons = await echangerCodeLinkedIn(code, redirectUriSocial("linkedin"));
            return { ...jetons, organisations: await listerOrganisationsAdministrees(jetons.jeton) };
          })();
    const { data, error } = await admin.from("social_connexions_en_attente").insert({ fournisseur, cree_par_id: ctx.utilisateurId, donnees_chiffrees: chiffrerSecret(JSON.stringify(donnees)) }).select("id").single();
    if (error || !data) throw new Error(error?.message ?? "Enregistrement impossible");
    await journaliser(admin, { acteur: ctx, action: "oauth_autorise", reseau: fournisseur, details: { scopes: donnees.scopes } });
    return retour(request, "attente", data.id);
  } catch (erreur) {
    const message = masquerSecrets(erreur instanceof Error ? erreur.message : "Connexion impossible");
    await journaliser(admin, { acteur: ctx, action: "oauth_echec", reseau: fournisseur, details: { message } });
    return retour(request, "error", message.slice(0, 300));
  }
}
