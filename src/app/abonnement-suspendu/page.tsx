import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "@/app/actions/auth";
import { ouvrirPortailAbonnementSuspenduAction } from "@/app/actions/abonnement";
import { peutGererAbonnementSuspendu } from "@/lib/acces-support-abonnement";

// GP-EXTERNAL-PILOT-CLOSURE-V1 — expérience compte suspendu (hors moteur
// billing) : raison générique et exacte selon le motif réel (avant ce
// correctif, un message unique « règlement non confirmé » s'affichait même
// pour un essai expiré ou une suspension administrative sans rapport avec un
// paiement) ; export RGPD et support toujours accessibles (déjà vrai côté
// routage depuis getContexteEntreprise, mais invisibles depuis cette page) ;
// bouton « Régulariser » réservé aux utilisateurs autorisés (gerer_parametres
// ou accès support), jamais affiché à un simple membre qui ne peut de toute
// façon rien y faire (ouvrirPortailAbonnementSuspenduAction le refuserait).
//
// ELSATIA-GP-TRIAL-EXPIRY-P1-CLOSURE-V1 (fusionné avec ce qui précède) : la
// variante essai n'est pas un cul-de-sac — un lien « Choisir une offre » vers
// /abonnement reste affiché uniquement pour motif=essai_expire (aucun
// abonnement n'existe encore, pas de portail Stripe à proposer).
export default async function AbonnementSuspenduPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; motif?: string }>;
}) {
  const { error, motif } = await searchParams;

  const peutRegulariser = await utilisateurPeutRegulariser();

  const { titre, description } =
    motif === "essai_expire"
      ? {
          titre: "Votre période d’essai est terminée",
          description:
            "Les 30 jours d’essai sont écoulés. Vos données sont conservées : vous pouvez les exporter à tout moment et contacter le support pour toute question.",
        }
      : {
          titre: "Accès temporairement suspendu",
          description:
            "L’accès à cette entreprise est temporairement suspendu. Vos données sont conservées : vous pouvez les exporter à tout moment et contacter le support pour connaître la raison exacte et les suites possibles.",
        };

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-lg space-y-5 rounded-xl border bg-white p-6 text-center shadow-sm">
        <div className="text-4xl">⏸</div>
        <h1 className="text-2xl font-semibold">{titre}</h1>
        <p className="text-sm text-neutral-600">{description}</p>
        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-center gap-2">
          {motif === "essai_expire" && (
            <Link href="/abonnement" className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Choisir une offre</Link>
          )}
          <Link href="/parametres/donnees" className="rounded-md border px-4 py-2 text-sm">Exporter mes données</Link>
          <Link href="/aide" className="rounded-md border px-4 py-2 text-sm">Contacter le support</Link>
          {peutRegulariser && (
            <form action={ouvrirPortailAbonnementSuspenduAction}>
              <button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Régulariser l’abonnement</button>
            </form>
          )}
          <form action={logoutAction}><button className="rounded-md border px-4 py-2 text-sm">Se déconnecter</button></form>
        </div>
      </div>
    </main>
  );
}

// Même contrôle que ouvrirPortailAbonnementSuspenduAction (via
// peutGererAbonnementSuspendu, source unique), en lecture seule ici : ne sert
// qu'à décider si le bouton doit apparaître, jamais à autoriser l'action
// elle-même (qui revérifie de son côté). Requêtes brutes (pas
// getContexteEntreprise) : cette page EST la destination de sa redirection,
// l'appeler rebouclerait.
async function utilisateurPeutRegulariser(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profil } = await supabase.from("utilisateurs").select("entreprise_active_id").eq("id", user.id).maybeSingle();
  if (!profil?.entreprise_active_id) return false;
  return peutGererAbonnementSuspendu(supabase, user.id, profil.entreprise_active_id);
}
