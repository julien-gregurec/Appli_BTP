import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { GESTION_PERMISSION_PAR_CHEMIN, MODULE_PERMISSION_PAR_CHEMIN, PERMISSIONS_ACCES_ALTERNATIVES, PERMISSIONS_MUTATION_ALTERNATIVES } from "@/lib/module-permissions";

const PUBLIC_PATHS = ["/login", "/signup", "/tarifs", "/offline", "/monitoring", "/mentions-legales", "/cgv", "/cgu", "/confidentialite", "/cookies", "/auth", "/mot-de-passe-oublie", "/nouveau-mot-de-passe", "/abonnement-suspendu", "/guides", "/videos", "/paiement", "/api/stripe/webhook", "/api/stripe/abonnement/webhook", "/api/cron/abonnements", "/api/cron/notifications-push", "/api/webhooks/notifications-push", "/api/paiements-bancaires/powens", "/api/paie/import"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (isEmailLoginDisabled()) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const isPublic = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  // Les chemins purement statiques n'ont aucune règle d'accès : inutile de
  // vérifier le jeton auprès de Supabase, ce qui coûtait un aller-retour
  // réseau pour servir un PDF ou une vidéo.
  const CHEMINS_SANS_SESSION = ["/offline", "/monitoring", "/mentions-legales", "/cgv", "/cgu", "/confidentialite", "/cookies", "/guides", "/videos", "/api/stripe/webhook", "/api/stripe/abonnement/webhook", "/api/cron/abonnements",
                                "/api/cron/notifications-push", "/api/webhooks/notifications-push", "/api/paiements-bancaires/powens", "/api/paie/import"];
  if (CHEMINS_SANS_SESSION.some((c) => request.nextUrl.pathname.startsWith(c))) {
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

  const droitRequis = isPublic ? undefined : MODULE_PERMISSION_PAR_CHEMIN.find(([c]) => correspond(c))?.[1];
  const estMutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  const droitGestion = !isPublic && estMutation
    ? GESTION_PERMISSION_PAR_CHEMIN.find(([c]) => correspond(c))?.[1]
    : undefined;

  const droitsAcces = droitRequis
    ? PERMISSIONS_ACCES_ALTERNATIVES[Object.keys(PERMISSIONS_ACCES_ALTERNATIVES).find((c) => correspond(c)) ?? ""] ?? [droitRequis]
    : [];
  const droitsGestion = droitGestion
    ? PERMISSIONS_MUTATION_ALTERNATIVES[Object.keys(PERMISSIONS_MUTATION_ALTERNATIVES).find((c) => correspond(c)) ?? ""] ?? [droitGestion]
    : [];

  const { data: acces } = await supabase.rpc("contexte_acces_proxy", {
    p_droits_acces: droitsAcces,
    p_droits_gestion: droitsGestion,
  });
  const ctx = (acces ?? {}) as {
    compte_depot?: boolean; entreprise_id?: string | null;
    acces_support?: boolean; droit_acces?: boolean; droit_gestion?: boolean;
  };

  {
    const compteDepot = ctx.compte_depot === true;
    const cheminDepotAutorise = request.nextUrl.pathname === "/depot" || request.nextUrl.pathname === "/stock" || request.nextUrl.pathname.startsWith("/stock/");

    // Tant que le compte partagé est connecté, il reste prioritaire : aucune
    // page de connexion ni aucun autre module n'est accessible sans déconnexion.
    if (compteDepot && !cheminDepotAutorise) {
      const url=request.nextUrl.clone();url.pathname="/stock/borne";url.search="";
      return NextResponse.redirect(url);
    }
    if ((request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup") && !compteDepot) {
      const url=request.nextUrl.clone();url.pathname="/dashboard";url.search="";
      return NextResponse.redirect(url);
    }
  }

  // Une session de support ouverte donne acces sans verifier les permissions,
  // exactement comme auparavant.
  if (!isPublic && ctx.entreprise_id && ctx.acces_support !== true) {
    if (droitRequis && ctx.droit_acces !== true) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.searchParams.set("acces", "refuse");
      return NextResponse.redirect(url);
    }
    if (droitGestion && ctx.droit_gestion !== true) {
      const url = request.nextUrl.clone();
      url.searchParams.set("lecture", "seule");
      return NextResponse.redirect(url, 303);
    }
  }

  return response;
}
