import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "@/app/actions/auth";
import { ouvrirPortailAbonnementSuspenduAction } from "@/app/actions/abonnement";
import { etatReabonnementEntreprise } from "@/lib/acces-support-abonnement";
import { ecranReabonnement, MESSAGES_REABONNEMENT, type EcranReabonnement } from "@/lib/stripe-reabonnement";
import {
  compteSuspenduGlobalement,
  etatsCommerciauxApplications,
  libelleStatutCommercial,
  MOTIF_SUSPENSION_PLATEFORME,
  type EtatCommercialApplication,
} from "@/lib/etat-commercial-applications";

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

  const { peutRegulariser: peutRegulariserGp, ecran: ecranGp, etatsApplications } = await etatRegularisation();
  // Per-App Commercial Suspension V1 : une suspension plateforme / sécurité ne se
  // « régularise » pas par un paiement ; aucun bouton de paiement dans ce cas.
  const suspensionPlateforme = motif === MOTIF_SUSPENSION_PLATEFORME || compteSuspenduGlobalement(etatsApplications);
  const peutRegulariser = peutRegulariserGp && !suspensionPlateforme;
  const ecran = suspensionPlateforme ? null : ecranGp;
  const autresApplications = etatsApplications.filter((etat) => etat.applicationCode !== "gestion_pro");

  // ELSATIA_STRIPE_RESUBSCRIPTION_FLOW_V1 : un abonnement annulé ou un paiement
  // requis ont chacun leur écran et leur sortie (réabonnement ou paiement).
  const { titre, description } =
    suspensionPlateforme
      ? {
          titre: "Compte suspendu par ELSATIA",
          description:
            "L’accès à toutes les applications ELSATIA de cette entreprise est suspendu par la plateforme. Vos données sont conservées. Contactez le support pour connaître la raison et les suites possibles.",
        }
      : ecran?.cle === "abonnement_annule"
      ? MESSAGES_REABONNEMENT.abonnement_annule
      : ecran?.cle === "paiement_requis"
      ? MESSAGES_REABONNEMENT.paiement_requis
      : motif === "essai_expire"
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
        {!suspensionPlateforme && autresApplications.length > 0 && (
          <div className="rounded-md border bg-neutral-50 p-3 text-left text-sm">
            <p className="font-medium">Vos autres applications ELSATIA</p>
            <p className="text-neutral-600">Chaque application a son propre abonnement : la suspension de Gestion Pro ne les coupe pas.</p>
            <ul className="mt-2 space-y-1">
              {autresApplications.map((etat) => (
                <li key={etat.applicationCode} className="flex justify-between gap-2">
                  <span>{etat.nom}</span>
                  <span className={etat.accesOuvert ? "text-emerald-700" : "text-red-700"}>{libelleStatutCommercial(etat.statut)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {motif === "essai_expire" && !ecran && (
            <Link href="/abonnement" className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Choisir une offre</Link>
          )}
          {ecran?.cle === "abonnement_annule" && peutRegulariser && (
            <Link href="/abonnement#choisir-offre" className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">{MESSAGES_REABONNEMENT.reactiver.libelle}</Link>
          )}
          {ecran?.cle === "paiement_requis" && ecran.urlFacture && peutRegulariser && (
            <a href={ecran.urlFacture} target="_blank" rel="noreferrer" className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">{MESSAGES_REABONNEMENT.paiement_requis.libellePayer}</a>
          )}
          <Link href="/parametres/donnees" className="rounded-md border px-4 py-2 text-sm">Exporter mes données</Link>
          <Link href="/aide" className="rounded-md border px-4 py-2 text-sm">Contacter le support</Link>
          {peutRegulariser && ecran?.cle !== "abonnement_annule" && (
            <form action={ouvrirPortailAbonnementSuspenduAction}>
              <button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">{ecran?.cle === "paiement_requis" ? MESSAGES_REABONNEMENT.paiement_requis.libellePortail : "Régulariser l’abonnement"}</button>
            </form>
          )}
          <form action={logoutAction}><button className="rounded-md border px-4 py-2 text-sm">Se déconnecter</button></form>
        </div>
      </div>
    </main>
  );
}

// Même contrôle que ouvrirPortailAbonnementSuspenduAction (via
// etat_reabonnement_entreprise, source unique), en lecture seule ici : ne sert
// qu'à décider si le bouton doit apparaître, jamais à autoriser l'action
// elle-même (qui revérifie de son côté). Requêtes brutes (pas
// getContexteEntreprise) : cette page EST la destination de sa redirection,
// l'appeler rebouclerait.
async function etatRegularisation(): Promise<{
  peutRegulariser: boolean;
  ecran: EcranReabonnement;
  etatsApplications: EtatCommercialApplication[];
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { peutRegulariser: false, ecran: null, etatsApplications: [] };
  const { data: profil } = await supabase.from("utilisateurs").select("entreprise_active_id").eq("id", user.id).maybeSingle();
  if (!profil?.entreprise_active_id) return { peutRegulariser: false, ecran: null, etatsApplications: [] };
  // La RLS masque l'entreprise suspendue ou annulée à ses membres : lecture
  // bornée en base (membre actif ou support, aucun identifiant Stripe).
  const [etat, etatsApplications] = await Promise.all([
    etatReabonnementEntreprise(supabase, profil.entreprise_active_id),
    etatsCommerciauxApplications(supabase, profil.entreprise_active_id),
  ]);
  if (!etat) return { peutRegulariser: false, ecran: null, etatsApplications };
  // Affichage seulement : l'état local n'autorise rien, les actions relisent Stripe.
  const ecran = ecranReabonnement({
    abonnementStatut: etat.abonnement_statut,
    stripeSubscriptionId: etat.subscription_rattachee ? "rattachee" : null,
    annulationPrevueAt: etat.annulation_prevue_at,
    derniereFactureStatut: etat.derniere_facture_statut,
    derniereFactureUrl: etat.derniere_facture_url,
  });
  return { peutRegulariser: etat.peut_gerer, ecran: ecran?.cle === "reprendre" ? null : ecran, etatsApplications };
}
