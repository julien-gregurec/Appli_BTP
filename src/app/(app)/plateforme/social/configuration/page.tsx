import { adminSocial, contexteSocial } from "@/lib/social/acces";
import { listerComptes } from "@/lib/social/comptes";
import { configLinkedIn, configMeta, redirectUriSocial, urlApplication } from "@/lib/social/config";
import { controlerConfiguration, type Controle } from "@/lib/social/configuration";
import { logosElsatia } from "@/lib/social/identite";
import { peut } from "@/lib/social/roles";
import { testerApplicationMetaAction } from "@/app/actions/social";
import { AccesRefuse } from "@/components/social/AccesRefuse";
import { BoutonAction } from "@/components/social/BoutonAction";
import { SocialEntete } from "@/components/social/SocialEntete";

export const metadata = { title: "Configuration — ELSATIA Social" };

const BADGE: Record<Controle["etat"], string> = {
  ok: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  manquant: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  invalide: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  attention: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  info: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200",
};
const LIBELLE: Record<Controle["etat"], string> = { ok: "OK", manquant: "Manquant", invalide: "Invalide", attention: "À vérifier", info: "Info" };

const PERMISSIONS_META: Array<[string, string, string]> = [
  ["pages_show_list", "Facebook", "Lister les Pages administrées (choix de la Page ELSATIA)"],
  ["pages_read_engagement", "Facebook", "Lire la Page et ses publications"],
  ["pages_manage_posts", "Facebook", "Publier sur la Page (après validation)"],
  ["pages_read_user_content", "Facebook", "Lire les commentaires des visiteurs"],
  ["pages_manage_engagement", "Facebook", "Répondre aux commentaires (après validation)"],
  ["pages_manage_metadata", "Facebook", "Abonner la Page aux webhooks"],
  ["read_insights", "Facebook", "Statistiques des publications"],
  ["pages_messaging", "Facebook", "Messenger : lire et répondre (24 h)"],
  ["business_management", "Facebook", "Accès via le portefeuille Meta Business (dépendance)"],
  ["instagram_basic", "Instagram", "Lire le compte Instagram professionnel"],
  ["instagram_content_publish", "Instagram", "Publier images et Reels (après validation)"],
  ["instagram_manage_comments", "Instagram", "Lire et répondre aux commentaires, webhooks"],
  ["instagram_manage_insights", "Instagram", "Statistiques Instagram"],
  ["instagram_manage_messages", "Instagram", "Messages Instagram (entreprise vérifiée)"],
];
const PERMISSIONS_LINKEDIN: Array<[string, string]> = [
  ["w_organization_social", "Publier et commenter au nom de la Page ELSATIA"],
  ["r_organization_social", "Lire les publications, commentaires et réactions de la Page"],
  ["rw_organization_admin", "Statistiques, abonnés, liste des Pages administrées, webhooks"],
];

function Ligne({ c }: { c: Controle }) {
  return (
    <tr className="border-t border-neutral-200 align-top dark:border-neutral-800">
      <td className="px-3 py-2 font-mono text-xs">{c.cle}{c.secret && <span className="ml-1 rounded bg-neutral-100 px-1 font-sans text-[10px] text-neutral-500 dark:bg-neutral-800">secret</span>}</td>
      <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[c.etat]}`}>{LIBELLE[c.etat]}</span></td>
      <td className="px-3 py-2 text-xs">{c.detail}</td>
    </tr>
  );
}

export default async function ConfigurationPage() {
  const ctx = await contexteSocial();
  if (!ctx || !peut(ctx.role, "gerer_comptes")) return <AccesRefuse />;
  const admin = adminSocial();
  const controles = controlerConfiguration();
  const [comptes, { error: erreurMigration }, { data: bucket }] = await Promise.all([listerComptes(admin), admin.from("social_parametres").select("id").limit(1), admin.storage.getBucket("social-medias")]);
  const logos = logosElsatia();
  let base: string | null = null;
  try {
    base = urlApplication();
  } catch {
    base = null;
  }
  const linkedin = comptes.find((c) => c.reseau === "linkedin");
  const accesCm = linkedin?.scopes.includes("w_organization_social") ? "confirme" : linkedin ? "partiel" : "inconnu";
  const groupes = ["ELSATIA", "Meta", "LinkedIn"] as const;
  const bloquants = controles.filter((c) => c.etat === "manquant" || c.etat === "invalide").length + (erreurMigration ? 1 : 0) + (!bucket ? 1 : 0) + logos.manquants.length;

  const etapes: Array<{ titre: string; fait: boolean; detail: string }> = [
    { titre: "Migration 184 appliquée", fait: !erreurMigration, detail: erreurMigration ? "Tables ELSATIA Social absentes de cette base." : "Tables présentes." },
    { titre: "Bucket privé social-medias", fait: Boolean(bucket), detail: bucket ? `Présent${bucket.public ? " — ATTENTION : public" : ", privé"}.` : "Absent." },
    { titre: "Logo officiel ELSATIA", fait: logos.manquants.length === 0, detail: logos.manquants.length ? `Manquant : ${logos.manquants.join(", ")}` : "Présent." },
    { titre: "Variables ELSATIA", fait: controles.filter((c) => c.groupe === "ELSATIA").every((c) => c.etat !== "manquant" && c.etat !== "invalide"), detail: "Clé de chiffrement, CRON_SECRET, URL." },
    { titre: "Application Meta configurée", fait: configMeta().configure && Boolean(configMeta().webhookVerifyToken), detail: "META_APP_ID, META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN." },
    { titre: "Application LinkedIn configurée", fait: configLinkedIn().configure, detail: "LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET." },
    { titre: "Facebook connecté", fait: comptes.some((c) => c.reseau === "facebook" && c.statut === "connecte"), detail: "Comptes › Connecter via Meta." },
    { titre: "Instagram connecté", fait: comptes.some((c) => c.reseau === "instagram" && c.statut === "connecte"), detail: "Connecté avec la Page Facebook liée." },
    { titre: "LinkedIn connecté", fait: comptes.some((c) => c.reseau === "linkedin" && c.statut === "connecte"), detail: "Comptes › Connecter (LinkedIn)." },
    { titre: "Diagnostic lecture seule réussi sur les 3 comptes", fait: comptes.length >= 3 && comptes.every((c) => (c as { dernier_diagnostic?: { ok?: boolean } | null }).dernier_diagnostic?.ok === true), detail: "Comptes › Diagnostiquer." },
  ];

  return (
    <main className="p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <SocialEntete titre="Assistant de configuration" role={ctx.role} actif="/plateforme/social/configuration" description="État réel de la configuration. Aucune valeur de secret n’est jamais affichée : uniquement sa présence et son format." />

        <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-base font-semibold">Étapes avant un premier test réel (en simulation)</h2>
          <p className="text-xs text-neutral-500">{bloquants === 0 ? "Aucun contrôle bloquant." : `${bloquants} contrôle(s) bloquant(s) au total (variables, fichiers, base).`}</p>
          <ol className="mt-3 space-y-1 text-sm">
            {etapes.map((e, i) => (
              <li key={e.titre} className="flex gap-2">
                <span aria-hidden className={e.fait ? "text-green-700" : "text-neutral-400"}>{e.fait ? "✓" : "○"}</span>
                <span><strong>{i + 1}. {e.titre}</strong> <span className="text-neutral-500">— {e.detail}</span></span>
              </li>
            ))}
          </ol>
        </section>

        {groupes.map((g) => (
          <section key={g} className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3">
              <h2 className="text-base font-semibold">Variables {g}</h2>
              {g === "Meta" && configMeta().configure && <BoutonAction libelle="Tester l’application Meta" action={testerApplicationMetaAction} />}
            </div>
            <table className="mt-2 w-full min-w-[600px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900"><tr><th className="px-3 py-2">Variable (Vercel)</th><th className="px-3 py-2">État</th><th className="px-3 py-2">Détail</th></tr></thead>
              <tbody>{controles.filter((c) => c.groupe === g).map((c) => <Ligne key={c.cle} c={c} />)}</tbody>
            </table>
          </section>
        ))}

        <section className="space-y-2 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <h2 className="text-base font-semibold">Adresses à déclarer chez Meta et LinkedIn</h2>
          {!base && <p className="text-red-700">NEXT_PUBLIC_APP_URL manquante : adresses indisponibles.</p>}
          {base && (
            <dl className="grid gap-2 sm:grid-cols-[260px_1fr]">
              <dt className="text-neutral-500">Meta — URI de redirection OAuth valide</dt><dd><code className="break-all">{redirectUriSocial("meta")}</code></dd>
              <dt className="text-neutral-500">Meta — URL de rappel Webhooks</dt><dd><code className="break-all">{base}/api/social/webhooks/meta</code></dd>
              <dt className="text-neutral-500">LinkedIn — Authorized redirect URL</dt><dd><code className="break-all">{redirectUriSocial("linkedin")}</code></dd>
              <dt className="text-neutral-500">LinkedIn — Webhook endpoint</dt><dd><code className="break-all">{base}/api/social/webhooks/linkedin</code></dd>
              <dt className="text-neutral-500">Planificateur (toutes les 5 min)</dt><dd><code className="break-all">{base}/api/social/cron</code> avec l’en-tête <code>Authorization: Bearer CRON_SECRET</code></dd>
            </dl>
          )}
        </section>

        <section className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
          <h2 className="px-3 pt-3 text-base font-semibold">Permissions Meta (accès standard, sans App Review pour les comptes ELSATIA)</h2>
          <table className="mt-2 w-full min-w-[600px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900"><tr><th className="px-3 py-2">Permission</th><th className="px-3 py-2">Réseau</th><th className="px-3 py-2">Usage</th><th className="px-3 py-2">Accordée</th></tr></thead>
            <tbody>
              {PERMISSIONS_META.map(([p, r, u]) => {
                const compte = comptes.find((c) => c.reseau === (r === "Facebook" ? "facebook" : "instagram"));
                return <tr key={p} className="border-t border-neutral-200 dark:border-neutral-800"><td className="px-3 py-2 font-mono text-xs">{p}</td><td className="px-3 py-2">{r}</td><td className="px-3 py-2 text-xs">{u}</td><td className="px-3 py-2 text-xs">{!compte ? "—" : compte.scopes.includes(p) ? "✓" : "✕"}</td></tr>;
              })}
            </tbody>
          </table>
        </section>

        <section className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
          <h2 className="px-3 pt-3 text-base font-semibold">Permissions LinkedIn</h2>
          <p className="px-3 text-xs">
            Accès Community Management API :{" "}
            {accesCm === "confirme" ? <strong className="text-green-700">confirmé (w_organization_social accordé à la connexion)</strong> : accesCm === "partiel" ? <strong className="text-amber-700">connexion faite mais w_organization_social absent : accès non accordé par LinkedIn</strong> : <strong className="text-neutral-600">non vérifiable avant la première connexion (LinkedIn n’expose pas l’état de la demande par API)</strong>}
          </p>
          <table className="mt-2 w-full min-w-[600px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900"><tr><th className="px-3 py-2">Scope</th><th className="px-3 py-2">Usage</th><th className="px-3 py-2">Accordé</th></tr></thead>
            <tbody>{PERMISSIONS_LINKEDIN.map(([p, u]) => <tr key={p} className="border-t border-neutral-200 dark:border-neutral-800"><td className="px-3 py-2 font-mono text-xs">{p}</td><td className="px-3 py-2 text-xs">{u}</td><td className="px-3 py-2 text-xs">{!linkedin ? "—" : linkedin.scopes.includes(p) ? "✓" : "✕"}</td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
