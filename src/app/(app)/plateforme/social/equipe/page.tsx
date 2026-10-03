import { adminSocial, contexteSocial } from "@/lib/social/acces";
import { libelleRole, peut, ROLES_SOCIAL, type ActionSocial } from "@/lib/social/roles";
import { AccesRefuse } from "@/components/social/AccesRefuse";
import { ChoixRole } from "@/components/social/ChoixRole";
import { SocialEntete } from "@/components/social/SocialEntete";

export const metadata = { title: "Équipe — ELSATIA Social" };

const ACTIONS: Array<[ActionSocial, string]> = [
  ["consulter", "Consulter"],
  ["rediger", "Rédiger, soumettre, IA"],
  ["planifier", "Calendrier"],
  ["valider", "Autoriser une publication"],
  ["publier", "Publier / programmer"],
  ["preparer_reponse", "Préparer une réponse"],
  ["envoyer_reponse", "Envoyer une réponse"],
  ["gerer_comptes", "Comptes et jetons"],
  ["gerer_equipe", "Gérer l’équipe"],
];

export default async function EquipePage() {
  const ctx = await contexteSocial();
  if (!ctx) return <AccesRefuse />;
  const admin = adminSocial();
  // Modèle canonique : seules les identités plateforme actives (UID rattaché) ont un rôle social.
  const [{ data: plateforme }, { data: membres }] = await Promise.all([
    admin.from("plateforme_admins").select("email,nom,role,utilisateur_id").eq("actif", true).not("utilisateur_id", "is", null).order("email"),
    admin.from("social_membres").select("utilisateur_id,role"),
  ]);
  const roles = new Map((membres ?? []).map((m) => [m.utilisateur_id as string, m.role as string]));
  const gerer = peut(ctx.role, "gerer_equipe");

  return (
    <main className="p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <SocialEntete titre="Équipe et rôles" role={ctx.role} actif="/plateforme/social/equipe" description="Seuls les administrateurs plateforme actifs peuvent recevoir un rôle. Par défaut : « Accès total » → Administrateur, autres → Lecture seule. Toute modification exige une session AAL2 et est journalisée." />
        <section className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900"><tr><th className="px-3 py-2">Membre</th><th className="px-3 py-2">Rôle ELSATIA Social</th></tr></thead>
            <tbody>
              {(plateforme ?? []).map((m) => {
                const role = roles.get(m.utilisateur_id) ?? (m.role === "total" ? "administrateur" : "lecture");
                return (
                  <tr key={m.email} className="border-t border-neutral-200 dark:border-neutral-800">
                    <td className="px-3 py-2">{m.nom ? `${m.nom} — ` : ""}{m.email}{!roles.has(m.utilisateur_id) && <span className="ml-1 text-xs text-neutral-500">(par défaut)</span>}</td>
                    <td className="px-3 py-2">{gerer ? <ChoixRole utilisateurId={m.utilisateur_id} email={m.email} role={role} /> : libelleRole(role)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <section className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
          <h2 className="px-3 pt-3 text-base font-semibold">Matrice des droits</h2>
          <table className="mt-2 w-full min-w-[720px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900"><tr><th className="px-3 py-2">Droit</th>{ROLES_SOCIAL.map((r) => <th key={r.cle} className="px-3 py-2">{r.libelle}</th>)}</tr></thead>
            <tbody>
              {ACTIONS.map(([action, libelle]) => (
                <tr key={action} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="px-3 py-2">{libelle}</td>
                  {ROLES_SOCIAL.map((r) => <td key={r.cle} className="px-3 py-2 text-center">{peut(r.cle, action) ? "✓" : "—"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
