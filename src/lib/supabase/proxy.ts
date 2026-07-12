import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { MODULE_PERMISSION_PAR_CHEMIN } from "@/lib/module-permissions";

const PUBLIC_PATHS = ["/login", "/signup", "/auth"];

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

  // getUser() vérifie le token auprès du serveur Auth — ne jamais se fier à getSession() ici.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && !isPublic) {
    const droitRequis = MODULE_PERMISSION_PAR_CHEMIN.find(([chemin]) => request.nextUrl.pathname === chemin || request.nextUrl.pathname.startsWith(chemin + "/"))?.[1];
    if (droitRequis) {
      const { data: profil } = await supabase.from("utilisateurs").select("entreprise_active_id").eq("id", user.id).maybeSingle();
      if (profil?.entreprise_active_id) {
        const { data: appartenance } = await supabase.from("utilisateurs_entreprises").select("poste_id").eq("utilisateur_id", user.id).eq("entreprise_id", profil.entreprise_active_id).eq("statut", "actif").maybeSingle();
        const { data: droit } = appartenance?.poste_id ? await supabase.from("permissions_poste").select("autorise").eq("entreprise_id", profil.entreprise_active_id).eq("poste_id", appartenance.poste_id).eq("cle_permission", droitRequis).eq("autorise", true).maybeSingle() : { data: null };
        if (!droit) { const url=request.nextUrl.clone();url.pathname="/dashboard";url.searchParams.set("acces","refuse");return NextResponse.redirect(url); }
      }
    }
  }

  return response;
}
