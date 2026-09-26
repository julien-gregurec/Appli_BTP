import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { estPlateformeAdmin } from "@/lib/plateforme";
import {
  changerStatutCommunicationAction,
  creerCommunicationAction,
} from "@/app/actions/plateforme-communications";
import { CommunicationRedaction } from "@/components/CommunicationRedaction";
import {
  CORRESPONDANCES_ROLES,
  TYPES_COMMUNICATION,
  transitionAutorisee,
  type StatutCommunication,
} from "@elsatia/platform-support-comms";

export const dynamic = "force-dynamic";

type CommunicationLigne = {
  id: string;
  titre: string;
  texte_court: string;
  type: string;
  nature: string;
  priorite: string;
  mode_affichage: string;
  frequence: string;
  statut: StatutCommunication;
  debut_at: string;
  fin_at: string | null;
  auteur_email: string;
  publiee_at: string | null;
  created_at: string;
};

const TRANSITIONS: { cle: string; libelle: string }[] = [
  { cle: "publier", libelle: "Publier" },
  { cle: "programmer", libelle: "Programmer" },
  { cle: "mettre_en_pause", libelle: "Mettre en pause" },
  { cle: "reprendre", libelle: "Reprendre" },
  { cle: "annuler", libelle: "Annuler" },
  { cle: "archiver", libelle: "Archiver" },
];

function dateCourte(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function PlateformeCommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ succes?: string; error?: string }>;
}) {
  if (!(await estPlateformeAdmin())) notFound();
  const { succes, error } = await searchParams;
  const supabase = await createClient();

  const [{ data: messagesData, error: erreurMessages }, { data: entreprisesData }, { data: appsData }] =
    await Promise.all([
      supabase
        .from("communications")
        .select("id,titre,texte_court,type,nature,priorite,mode_affichage,frequence,statut,debut_at,fin_at,auteur_email,publiee_at,created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("entreprises").select("id,nom").order("nom"),
      supabase.from("applications_elsatia").select("code,nom,actif").order("ordre"),
    ]);

  const centreAbsent =
    erreurMessages?.code === "PGRST205" ||
    erreurMessages?.code === "42P01" ||
    (erreurMessages?.message ?? "").includes("communications");

  const messages = (messagesData ?? []) as CommunicationLigne[];
  const entreprises = (entreprisesData ?? []) as { id: string; nom: string }[];
  const applications = ((appsData ?? []) as { code: string; nom: string; actif: boolean }[]).filter((a) => a.actif);

  return (
    <main className="p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Centre de communications</h1>
            <p className="text-sm text-neutral-500">
              Préparer, cibler et publier les messages ELSATIA vers les applications et les
              entreprises.
            </p>
          </div>
          <Link href="/plateforme" className="rounded-md border px-3 py-2 text-sm font-medium">
            ← Plateforme
          </Link>
        </div>

        {succes && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{succes}</p>}
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {centreAbsent && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Centre de communications non encore appliqué en base.</p>
            <p className="mt-1">
              Le SQL de ce lot est proposé dans{" "}
              <code>docs/migrations-proposees/platform-support-access-communications-v1.sql.proposed</code>,
              sans numéro de migration réservé (Train V3 et Pricing en cours). Cet écran
              devient opérant dès son intégration.
            </p>
          </div>
        )}

        {!centreAbsent && (
          <>
            <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
              <h2 className="mb-3 font-semibold">Nouveau message</h2>
              <CommunicationRedaction
                action={creerCommunicationAction}
                types={TYPES_COMMUNICATION.map((t) => ({ cle: t.cle, libelle: t.libelle, service: t.service }))}
                applications={applications.map((a) => ({ code: a.code, nom: a.nom }))}
                entreprises={entreprises}
                roles={CORRESPONDANCES_ROLES.map((r) => ({ cle: r.cle, libelle: r.libelle, ecart: r.ecart }))}
              />
            </section>

            <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
              <h2 className="mb-3 font-semibold">Messages</h2>
              {messages.length === 0 ? (
                <p className="text-sm text-neutral-500">Aucun message pour l’instant.</p>
              ) : (
                <ul className="space-y-2">
                  {messages.map((m) => (
                    <li key={m.id} className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <strong>{m.titre}</strong>{" "}
                          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] uppercase dark:bg-neutral-800">
                            {m.statut}
                          </span>
                          <p className="mt-1 text-neutral-600 dark:text-neutral-300">{m.texte_court}</p>
                          <p className="mt-1 text-xs text-neutral-500">
                            {m.type} · {m.nature} · {m.mode_affichage} · {m.frequence} · du{" "}
                            {dateCourte(m.debut_at)} au {dateCourte(m.fin_at)} · {m.auteur_email}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {TRANSITIONS.filter((t) =>
                            transitionAutorisee(m.statut, t.cle as Parameters<typeof transitionAutorisee>[1]),
                          ).map((t) => (
                            <form key={t.cle} action={changerStatutCommunicationAction.bind(null, m.id, t.cle)}>
                              <button className="rounded-md border px-2 py-1 text-xs font-medium">{t.libelle}</button>
                            </form>
                          ))}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-neutral-500">
                Après publication, le contenu et le ciblage sont figés : une correction passe
                par une duplication, tracée dans le journal des communications.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
