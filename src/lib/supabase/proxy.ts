import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { MODULE_PERMISSION_PAR_CHEMIN, PERMISSIONS_ACCES_ALTERNATIVES, droitsGestionPour } from "@/lib/module-permissions";
import { permissionEstPorteDEntreeModule, permissionIncluseDansOffre } from "@/lib/tarification";
import { appliquerRateLimit, politiquesRateLimitPour } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { clePubliqueSupabase } from "@/lib/supabase/keys";
import { optionsCookieAuth } from "@/lib/security/cookies";
import { decisionGardeMfa } from "@/lib/auth/mfa";
import { destinationInterneSure } from "@/lib/security/redirects";
import {
  PERMISSION_BORNE,
  cheminAutorisePourCompteDepot,
  decisionRoutageAuthentifieSurPagePublique,
  decisionRoutageCompteDepot,
  estCulDeSacInformatif,
} from "@/lib/supabase/routage-proxy";

const PUBLIC_PATHS = ["/login", "/signup", "/tarifs", "/offline", "/monitoring", "/mentions-legales", "/cgv", "/cgu", "/confidentialite", "/cookies", "/auth", "/mfa", "/mot-de-passe-oublie", "/nouveau-mot-de-passe", "/abonnement-suspendu", "/guides", "/videos", "/paiement", "/document", "/imprimer/partage", "/api/documents/partage", "/api/stripe/webhook", "/api/stripe/abonnement/webhook", "/api/stripe/boutique/webhook", "/api/cron/abonnements", "/api/cron/notifications-push", "/api/webhooks/notifications-push", "/api/paiements-bancaires/powens", "/api/paie/import"];

export async function updateSession(request: NextRequest) {
  // Transmet le chemin demandé aux Server Components (layout ET page appellent
  // chacun getContexteEntreprise() — voir ELSATIA-TRIAL-MODULES-POLICY-CLOSURE-V1) :
  // seule la page /abonnement doit rester accessible pendant un essai expiré
  // sans offre, et un Server Component n'a pas accès au chemin autrement.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-elsatia-pathname", request.nextUrl.pathname);
  const nextRequestInit = { request: { headers: requestHeaders } };
  let response = NextResponse.next(nextRequestInit);

  const verifierLimite = async (authentifie: boolean, contexte: { utilisateurId?: string | null; entrepriseId?: string | null } = {}) => {
    const politiques = politiquesRateLimitPour(request.nextUrl.pathname, request.method, authentifie);
    if (!politiques.length) return null;
    try {
      const resultat = await appliquerRateLimit(request, createAdminClient(), politiques, contexte);
      if (resultat.autorise) return null;
      return NextResponse.json(
        { error: resultat.statut === 429 ? "Trop de requêtes, réessayez plus tard." : "Protection anti-abus indisponible." },
        { status: resultat.statut, headers: { "Retry-After": String(resultat.reessayerApres), "Cache-Control": "private, no-store" } },
      );
    } catch {
      return NextResponse.json(
        { error: "Protection anti-abus indisponible." },
        { status: 503, headers: { "Retry-After": "60", "Cache-Control": "private, no-store" } },
      );
    }
  };

  const limitePublique = await verifierLimite(false);
  if (limitePublique) return limitePublique;

  if (isEmailLoginDisabled()) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    clePubliqueSupabase(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next(nextRequestInit);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, { ...options, ...optionsCookieAuth() }),
          );
        },
      },
    },
  );

  // Comparaison stricte pour l'accueil : "/" en préfixe matcherait tous les chemins.
  const estAccueil = request.nextUrl.pathname === "/";
  const isPublic = estAccueil || PUBLIC_PATHS.some((path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(path + "/"));

  // Les chemins purement statiques n'ont aucune règle d'accès : inutile de
  // vérifier le jeton auprès de Supabase, ce qui coûtait un aller-retour
  // réseau pour servir un PDF ou une vidéo. La page d'accueil vérifie elle-même
  // la session pour rediriger un utilisateur déjà connecté vers /dashboard.
  const CHEMINS_SANS_SESSION = ["/offline", "/monitoring", "/mentions-legales", "/cgv", "/cgu", "/confidentialite", "/cookies", "/guides", "/videos", "/document", "/imprimer/partage", "/api/documents/partage", "/api/stripe/webhook", "/api/stripe/abonnement/webhook", "/api/stripe/boutique/webhook", "/api/cron/abonnements",
                                "/api/cron/notifications-push", "/api/webhooks/notifications-push", "/api/paiements-bancaires/powens", "/api/paie/import"];
  if (estAccueil || CHEMINS_SANS_SESSION.some((c) => request.nextUrl.pathname.startsWith(c))) {
    return response;
  }

  // getUser() vérifie le token auprès du serveur Auth — ne jamais se fier à getSession() ici.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (!user) return response;

  // Les permissions a verifier sont determinees AVANT l'appel, afin que la base
  // reponde en une seule fois. Auparavant le proxy enchainait jusqu'a 6 allers-
  // retours sequentiels par requete, soit environ 1 seconde payee par page.
  const chemin = request.nextUrl.pathname;
  const correspond = (base: string) => chemin === base || chemin.startsWith(base + "/");

  if (correspond("/plateforme")) {
    const { data: admin, error: erreurAdmin } = await supabase.rpc("est_plateforme_admin");
    if (!erreurAdmin && admin === true) {
      const { data: aal, error: erreurAal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const decision = decisionGardeMfa(aal, Boolean(erreurAal));
      if (decision !== "autoriser") {
        const destination = destinationInterneSure(`${chemin}${request.nextUrl.search}`, "/plateforme");
        const url = request.nextUrl.clone();
        url.pathname = decision === "enroler" ? "/parametres/securite" : "/mfa/challenge";
        url.search = "";
        url.searchParams.set("next", destination);
        if (decision === "enroler") url.searchParams.set("requis", "plateforme");
        if (decision === "refuser") url.searchParams.set("controle", "indisponible");
        return NextResponse.redirect(url);
      }
    }
  }

  const droitRequis = isPublic ? undefined : MODULE_PERMISSION_PAR_CHEMIN.find(([c]) => correspond(c))?.[1];
  const estMutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  const droitsGestion = !isPublic && estMutation ? droitsGestionPour(chemin) : [];

  const droitsAcces = droitRequis
    ? PERMISSIONS_ACCES_ALTERNATIVES[Object.keys(PERMISSIONS_ACCES_ALTERNATIVES).find((c) => correspond(c)) ?? ""] ?? [droitRequis]
    : [];

  const { data: acces } = await supabase.rpc("contexte_acces_proxy", {
    p_droits_acces: droitsAcces,
    p_droits_gestion: droitsGestion,
  });
  const ctx = (acces ?? {}) as {
    compte_depot?: boolean; entreprise_id?: string | null;
    acces_support?: boolean; droit_acces?: boolean; droit_gestion?: boolean;
  };

  const limiteAuthentifiee = await verifierLimite(true, {
    utilisateurId: user.id,
    entrepriseId: ctx.entreprise_id,
  });
  if (limiteAuthentifiee) return limiteAuthentifiee;

  // « Module non inclus » est un cul-de-sac informatif : il explique à
  // l'utilisateur ce que l'offre de l'entreprise ne couvre pas. Il ne porte
  // aucune donnée sensible et ne doit JAMAIS être renvoyé vers une route
  // protégée, sous peine de boucle (garde module ↔ priorité compte dépôt).
  if (estCulDeSacInformatif(request.nextUrl.pathname)) {
    return response;
  }

  // Évalue si une permission « porte d'entrée » est réellement ouverte pour
  // l'entreprise (offre souscrite OU module optionnel acquis — R3). Sert à ne
  // jamais forcer une redirection vers une route que la garde refusera ensuite.
  const permissionOuvertePourEntreprise = async (permission: string) => {
    if (!ctx.entreprise_id || ctx.acces_support === true) return true;
    const { data: ent } = await supabase
      .from("entreprises")
      .select("abonnement_offre")
      .eq("id", ctx.entreprise_id)
      .maybeSingle();
    // Sans offre choisie, le plan ne peut jamais ouvrir lui-même une porte de
    // MODULE (ELSATIA-TRIAL-MODULES-POLICY-CLOSURE-V1) : seul l'entitlement
    // module (achat, offert, ou essai actif sur un module catalogue "actif")
    // le peut. Les permissions administratives (paramètres, utilisateurs)
    // restent ouvertes offre ou pas, exactement comme avant.
    const offreCouvrePermission = (!ent?.abonnement_offre && !permissionEstPorteDEntreeModule(permission))
      || Boolean(ent?.abonnement_offre);
    if (offreCouvrePermission && permissionIncluseDansOffre(permission, ent?.abonnement_offre)) return true;
    const { data: parModule } = await supabase.rpc("acces_module_pour_permission", {
      p_entreprise_id: ctx.entreprise_id,
      p_permissions: [permission],
    });
    return parModule === true;
  };

  {
    const compteDepot = ctx.compte_depot === true;
    const pathname = request.nextUrl.pathname;

    // Tant que le compte partagé est connecté, il reste prioritaire : aucune
    // page de connexion ni aucun autre module n'est accessible sans déconnexion.
    // §2 : on ne vise /stock/borne que si l'entreprise y a réellement droit,
    // sinon on va droit au cul-de-sac informatif (pas de rebond via la garde).
    if (compteDepot && !cheminAutorisePourCompteDepot(pathname)) {
      const borneAccessible = await permissionOuvertePourEntreprise(PERMISSION_BORNE);
      const decision = decisionRoutageCompteDepot({ compteDepot, pathname, borneAccessible });
      if (decision.type === "rediriger") {
        const url = request.nextUrl.clone();
        url.search = "";
        url.pathname = decision.pathname;
        if (decision.module) url.searchParams.set("module", decision.module);
        return NextResponse.redirect(url);
      }
    }

    const decisionPublique = decisionRoutageAuthentifieSurPagePublique({ compteDepot, pathname });
    if (decisionPublique.type === "rediriger") {
      const url = request.nextUrl.clone();
      url.pathname = decisionPublique.pathname;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Une session de support ouverte donne acces sans verifier les permissions,
  // exactement comme auparavant.
  if (!isPublic && ctx.entreprise_id && ctx.acces_support !== true) {
    if (droitRequis) {
      const { data: entreprise } = await supabase
        .from("entreprises")
        .select("abonnement_offre")
        .eq("id", ctx.entreprise_id)
        .maybeSingle();
      // Sans offre choisie, le plan ne peut jamais ouvrir lui-même une porte de
      // MODULE (ELSATIA-TRIAL-MODULES-POLICY-CLOSURE-V1) : seul l'entitlement
      // module (achat, offert, ou essai actif sur un module catalogue "actif")
      // le peut. Les permissions administratives (paramètres, utilisateurs)
      // restent ouvertes offre ou pas, exactement comme avant.
      let droitsInclus = droitsAcces.some((droit) =>
        ((!entreprise?.abonnement_offre && !permissionEstPorteDEntreeModule(droit)) || Boolean(entreprise?.abonnement_offre))
        && permissionIncluseDansOffre(droit, entreprise?.abonnement_offre));
      if (!droitsInclus) {
        // R3 : un module optionnel explicitement acquis par l'entreprise (achat,
        // offert, essai, geste plateforme) débloque sa permission porte-d'entrée,
        // quel que soit le forfait. Contrôle en OU : n'enlève jamais un accès plan.
        const { data: parModule } = await supabase.rpc("acces_module_pour_permission", {
          p_entreprise_id: ctx.entreprise_id,
          p_permissions: droitsAcces,
        });
        droitsInclus = parModule === true;
      }
      if (!droitsInclus) {
        const url = request.nextUrl.clone();
        url.pathname = "/abonnement/module-non-inclus";
        url.searchParams.set("module", droitRequis);
        return NextResponse.redirect(url);
      }
    }
    if (droitRequis && ctx.droit_acces !== true) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.searchParams.set("acces", "refuse");
      return NextResponse.redirect(url);
    }
    if (droitsGestion.length > 0 && ctx.droit_gestion !== true) {
      const url = request.nextUrl.clone();
      url.searchParams.set("lecture", "seule");
      return NextResponse.redirect(url, 303);
    }
  }

  return response;
}
