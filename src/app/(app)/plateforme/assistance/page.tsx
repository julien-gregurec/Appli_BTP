import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { estPlateformeAdmin } from "@/lib/plateforme";
import {
  ouvrirAssistanceAction,
  quitterAssistanceAction,
  revoquerAssistanceAction,
} from "@/app/actions/plateforme-assistance";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { AssistanceOuvertureForm } from "@/components/AssistanceOuvertureForm";
import {
  DUREES_ASSISTANCE_MINUTES,
  MOTIFS_ASSISTANCE,
  PERIMETRES_ASSISTANCE,
} from "@elsatia/platform-support-comms";

export const dynamic = "force-dynamic";

type EntrepriseLigne = { id: string; nom: string };
type AccesLigne = { entreprise_id: string; application_code: string };
type ApplicationLigne = { code: string; nom: string; actif: boolean; portee_donnees: string | null };
type SessionLigne = {
  id: string;
  acteur_email: string;
  entreprise_id: string;
  motif_cle: string;
  perimetre: string;
  ticket: string | null;
  ouverte_at: string;
  expire_at: string;
  terminee_at: string | null;
  terminee_motif: string | null;
  revoquee_at: string | null;
};

function dateCourte(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statut(s: SessionLigne): string {
  if (s.revoquee_at) return "Révoquée";
  if (s.terminee_at) return "Terminée";
  if (new Date(s.expire_at).getTime() <= Date.now()) return "Expirée";
  return "En cours";
}

export default async function PlateformeAssistancePage({
  searchParams,
}: {
  searchParams: Promise<{ succes?: string; error?: string }>;
}) {
  if (!(await estPlateformeAdmin())) notFound();
  const { succes, error } = await searchParams;
  const supabase = await createClient();

  // Le contrat d'assistance est livré AVANT sa migration (aucun numéro de ledger
  // réservé : voir docs/migrations-proposees/). Tant qu'elle n'est pas appliquée, cet
  // écran l'annonce clairement au lieu de tomber en erreur.
  const [{ data: sessionsData, error: erreurSessions }, { data: entreprisesData }, { data: appsData }, { data: accesData }] =
    await Promise.all([
      supabase
        .from("assistance_sessions")
        .select("id,acteur_email,entreprise_id,motif_cle,perimetre,ticket,ouverte_at,expire_at,terminee_at,terminee_motif,revoquee_at")
        .order("ouverte_at", { ascending: false })
        .limit(100),
      supabase.from("entreprises").select("id,nom").order("nom"),
      supabase.from("applications_elsatia").select("code,nom,actif,portee_donnees").order("ordre"),
      supabase.from("acces_applications_entreprises").select("entreprise_id,application_code").eq("autorise", true),
    ]);

  const contratAbsent =
    erreurSessions?.code === "PGRST205" ||
    erreurSessions?.code === "42P01" ||
    (erreurSessions?.message ?? "").includes("assistance_sessions");

  const entreprises = (entreprisesData ?? []) as EntrepriseLigne[];
  const applications = ((appsData ?? []) as ApplicationLigne[]).filter(
    // Tools n'a pas de tenant : ses projets appartiennent à une personne. Une session
    // d'assistance vise une entreprise, elle ne peut donc pas viser Tools.
    (a) => a.actif && (a.portee_donnees ?? "entreprise") === "entreprise",
  );
  const acces = (accesData ?? []) as AccesLigne[];
  const sessions = (sessionsData ?? []) as SessionLigne[];
  const nomEntreprise = new Map(entreprises.map((e) => [e.id, e.nom]));
  const actives = sessions.filter((s) => statut(s) === "En cours");

  const abonnementsParEntreprise: Record<string, string[]> = {};
  for (const a of acces) {
    if (!applications.some((app) => app.code === a.application_code)) continue;
    (abonnementsParEntreprise[a.entreprise_id] ??= []).push(a.application_code);
  }

  return (
    <main className="p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Assistance interapplications</h1>
            <p className="text-sm text-neutral-500">
              Ouvrir une session justifiée, limitée dans le temps et bornée à un périmètre.
              L’entreprise est prévenue à chaque ouverture.
            </p>
          </div>
          <Link href="/plateforme" className="rounded-md border px-3 py-2 text-sm font-medium">
            ← Plateforme
          </Link>
        </div>

        {succes && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{succes}</p>}
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {contratAbsent && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Contrat d’assistance non encore appliqué en base.</p>
            <p className="mt-1">
              Le SQL de ce lot est proposé dans{" "}
              <code>docs/migrations-proposees/platform-support-access-communications-v1.sql.proposed</code>{" "}
              et n’a réservé aucun numéro de migration, le Train V3 et le chantier Pricing
              étant en cours. Cet écran devient opérant dès son intégration.
            </p>
            <p className="mt-1">
              D’ici là, le mode support historique (<code>/plateforme</code>, bouton
              « Entrer ») reste en service, mais <strong>en lecture seule</strong> : la
              posture stricte est le comportement par défaut et ne peut pas être désactivée
              en Production.
            </p>
          </div>
        )}

        {!contratAbsent && (
          <>
            <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
              <h2 className="mb-3 font-semibold">Sessions actives</h2>
              {actives.length === 0 ? (
                <p className="text-sm text-neutral-500">Aucune session d’assistance ouverte.</p>
              ) : (
                <ul className="space-y-2">
                  {actives.map((s) => (
                    <li key={s.id} className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <strong>{nomEntreprise.get(s.entreprise_id) ?? s.entreprise_id}</strong>{" "}
                          — {s.perimetre} — ouverte le {dateCourte(s.ouverte_at)} par {s.acteur_email}
                          {s.ticket ? ` — ticket ${s.ticket}` : ""}
                        </div>
                        <div className="flex items-center gap-2">
                          <form action={quitterAssistanceAction}>
                            <button className="rounded-md border px-3 py-1.5 text-xs font-medium">
                              Quitter
                            </button>
                          </form>
                          <form action={revoquerAssistanceAction.bind(null, s.id)} className="flex items-center gap-1">
                            <input
                              name="motifRevocation"
                              placeholder="Motif de révocation"
                              className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                              required
                              minLength={5}
                            />
                            <ConfirmSubmitButton
                              message={`Révoquer immédiatement la session de ${s.acteur_email} ? Elle ne pourra pas être reprise.`}
                              className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white"
                            >
                              Révoquer
                            </ConfirmSubmitButton>
                          </form>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
              <h2 className="mb-3 font-semibold">Ouvrir une session d’assistance</h2>
              <AssistanceOuvertureForm
                action={ouvrirAssistanceAction}
                entreprises={entreprises}
                applications={applications.map((a) => ({ code: a.code, nom: a.nom }))}
                abonnements={abonnementsParEntreprise}
                motifs={MOTIFS_ASSISTANCE.map((m) => ({
                  cle: m.cle,
                  libelle: m.libelleInterne,
                  detailRequis: m.detailRequis,
                  libellePublic: m.libellePublic,
                }))}
                perimetres={PERIMETRES_ASSISTANCE.map((p) => ({
                  cle: p.cle,
                  libelle: p.libelle,
                  description: p.description,
                  dureeMaximaleMinutes: p.dureeMaximaleMinutes,
                  confirmationRenforcee: p.confirmationRenforcee,
                }))}
                durees={[...DUREES_ASSISTANCE_MINUTES]}
              />
            </section>

            <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
              <h2 className="mb-3 font-semibold">Historique</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-neutral-500">
                    <tr>
                      <th className="py-1 pr-3">Entreprise</th>
                      <th className="py-1 pr-3">Intervenant</th>
                      <th className="py-1 pr-3">Motif</th>
                      <th className="py-1 pr-3">Périmètre</th>
                      <th className="py-1 pr-3">Début</th>
                      <th className="py-1 pr-3">Fin</th>
                      <th className="py-1">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-3 text-neutral-500">
                          Aucune session enregistrée.
                        </td>
                      </tr>
                    )}
                    {sessions.map((s) => (
                      <tr key={s.id} className="border-t border-neutral-200 dark:border-neutral-800">
                        <td className="py-1.5 pr-3">{nomEntreprise.get(s.entreprise_id) ?? s.entreprise_id}</td>
                        <td className="py-1.5 pr-3">{s.acteur_email}</td>
                        <td className="py-1.5 pr-3">{s.motif_cle}</td>
                        <td className="py-1.5 pr-3">{s.perimetre}</td>
                        <td className="py-1.5 pr-3">{dateCourte(s.ouverte_at)}</td>
                        <td className="py-1.5 pr-3">{dateCourte(s.terminee_at)}</td>
                        <td className="py-1.5">{statut(s)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-neutral-500">
                L’historique est immuable : ni la plateforme ni l’entreprise ne peuvent le
                réécrire. L’export d’audit se fait depuis <code>assistance_evenements</code>,
                append-only et soumis à une rétention de 36 mois.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
