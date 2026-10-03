import { adminSocial, contexteSocial } from "@/lib/social/acces";
import { listerComptes, joursAvantExpiration } from "@/lib/social/comptes";
import { configLinkedIn, configMeta, modeSimulation, redirectUriSocial, SCOPES_LINKEDIN, SCOPES_META } from "@/lib/social/config";
import { LinkedInConnector } from "@/lib/social/linkedin";
import { MetaConnector } from "@/lib/social/meta";
import type { Capacites, SocialProvider } from "@/lib/social/provider";
import { peut } from "@/lib/social/roles";
import { LIBELLE_RESEAU, RESEAUX, type Reseau } from "@/lib/social/types";
import { abonnerWebhooksAction, rechiffrerJetonsAction, revoquerCompteAction, verifierCompteAction } from "@/app/actions/social";
import { AccesRefuse } from "@/components/social/AccesRefuse";
import { BoutonAction } from "@/components/social/BoutonAction";
import { ConnexionEnAttente } from "@/components/social/ConnexionEnAttente";
import { SocialEntete } from "@/components/social/SocialEntete";

export const metadata = { title: "Comptes — ELSATIA Social" };

const LIBELLE_CAPACITE: Record<keyof Capacites, string> = {
  texteSeul: "Texte seul",
  lien: "Lien",
  image: "Image",
  video: "Vidéo",
  reel: "Reel",
  programmationNative: "Programmation native",
  lecturePublications: "Lecture des publications",
  statistiques: "Statistiques",
  commentaires: "Lecture des commentaires",
  reponseCommentaire: "Réponse aux commentaires",
  messages: "Messages privés",
  reponseMessage: "Réponse aux messages",
  webhooks: "Webhooks",
};

function connecteurTheorique(reseau: Reseau, scopes: string[]): SocialProvider {
  // Sans appel réseau : sert uniquement à afficher les capacités officielles.
  return reseau === "linkedin" ? new LinkedInConnector("0", "", scopes) : new MetaConnector({ reseau, externalAccountId: "0", pageId: "0", scopes }, "");
}

const date = (v: string | null) => (v ? new Date(v).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }) : "—");

export default async function ComptesPage({ searchParams }: { searchParams: Promise<{ attente?: string; error?: string }> }) {
  const ctx = await contexteSocial();
  if (!ctx) return <AccesRefuse />;
  const { attente, error } = await searchParams;
  const comptes = await listerComptes(adminSocial());
  const gerer = peut(ctx.role, "gerer_comptes");
  const meta = configMeta();
  const linkedin = configLinkedIn();
  let urlsRetour: { meta: string; linkedin: string } | null = null;
  try {
    urlsRetour = { meta: redirectUriSocial("meta"), linkedin: redirectUriSocial("linkedin") };
  } catch {
    urlsRetour = null;
  }

  return (
    <main className="p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <SocialEntete titre="Comptes connectés" role={ctx.role} actif="/plateforme/social/comptes" description="Connexion OAuth côté serveur. Les jetons sont chiffrés (AES-256-GCM) et ne quittent jamais le serveur." />
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        {attente && gerer && <ConnexionEnAttente attenteId={attente} />}

        <section className="grid gap-4 md:grid-cols-3">
          {RESEAUX.map((reseau) => {
            const compte = comptes.find((c) => c.reseau === reseau);
            const jours = compte ? joursAvantExpiration(compte) : null;
            const fournisseur = reseau === "linkedin" ? "linkedin" : "meta";
            const configure = fournisseur === "meta" ? meta.configure : linkedin.configure;
            return (
              <article key={reseau} className="space-y-2 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800">
                <h2 className="text-base font-semibold">{LIBELLE_RESEAU[reseau]}</h2>
                {compte ? (
                  <dl className="space-y-1">
                    <div><dt className="inline text-neutral-500">Compte : </dt><dd className="inline font-medium">{compte.nom_compte}{compte.nom_utilisateur ? ` (@${compte.nom_utilisateur})` : ""}</dd></div>
                    <div><dt className="inline text-neutral-500">Statut : </dt><dd className={`inline ${compte.statut === "connecte" ? "text-green-700" : "text-red-700"}`}>{compte.statut.replace("_", " ")}</dd></div>
                    <div><dt className="inline text-neutral-500">Connecté le : </dt><dd className="inline">{date(compte.connected_at)} par {compte.connecte_par}</dd></div>
                    <div><dt className="inline text-neutral-500">Expiration du jeton : </dt><dd className="inline">{compte.token_expires_at ? `${date(compte.token_expires_at)} (${jours} j)` : "sans expiration fixe"}</dd></div>
                    {compte.data_access_expires_at && <div><dt className="inline text-neutral-500">Accès aux données jusqu’au : </dt><dd className="inline">{date(compte.data_access_expires_at)}</dd></div>}
                    {compte.refresh_expires_at && <div><dt className="inline text-neutral-500">Renouvellement possible jusqu’au : </dt><dd className="inline">{date(compte.refresh_expires_at)}</dd></div>}
                    {compte.fournisseur === "linkedin" && !compte.refresh_expires_at && <p className="text-xs text-amber-700">Pas de jeton de renouvellement LinkedIn : reconnexion manuelle tous les 60 jours.</p>}
                    {compte.derniere_erreur && <p className="text-xs text-red-700">Dernière erreur : {compte.derniere_erreur}</p>}
                    <p className="break-words text-xs text-neutral-500">Permissions : {compte.scopes.join(", ") || "—"}</p>
                  </dl>
                ) : (
                  <p className="text-neutral-500">Non connecté.</p>
                )}
                {gerer && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {configure ? (
                      <a href={`/api/social/oauth/${fournisseur}`} className="rounded-md bg-[#0d1b2a] px-3 py-1.5 text-sm font-medium text-white dark:bg-[#c9a24a] dark:text-[#0d1b2a]">
                        {compte ? "Reconnecter" : "Connecter"}{fournisseur === "meta" ? " via Meta" : ""}
                      </a>
                    ) : (
                      <p className="text-xs text-amber-700">Application {fournisseur === "meta" ? "Meta" : "LinkedIn"} non configurée (variables d’environnement manquantes).</p>
                    )}
                    {compte && <BoutonAction libelle="Vérifier le jeton" action={verifierCompteAction.bind(null, compte.id)} />}
                    {compte && reseau === "facebook" && <BoutonAction libelle="Activer les webhooks" action={abonnerWebhooksAction.bind(null, compte.id)} />}
                    {compte && <BoutonAction variante="danger" libelle="Révoquer" confirmation={fournisseur === "meta" ? "Révoquer l’accès Meta ? Facebook ET Instagram seront déconnectés (jeton partagé)." : "Révoquer l’accès LinkedIn ?"} action={revoquerCompteAction.bind(null, compte.id, true)} />}
                  </div>
                )}
              </article>
            );
          })}
        </section>

        <section className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
          <h2 className="px-3 pt-3 text-base font-semibold">Fonctions disponibles via les API officielles</h2>
          <p className="px-3 text-xs text-neutral-500">Calculé à partir des permissions réellement accordées. Une fonction indisponible n’est jamais simulée.</p>
          <table className="mt-2 w-full min-w-[720px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
              <tr><th className="px-3 py-2">Fonction</th>{RESEAUX.map((r) => <th key={r} className="px-3 py-2">{LIBELLE_RESEAU[r]}</th>)}</tr>
            </thead>
            <tbody>
              {(Object.keys(LIBELLE_CAPACITE) as Array<keyof Capacites>).map((cle) => (
                <tr key={cle} className="border-t border-neutral-200 align-top dark:border-neutral-800">
                  <td className="px-3 py-2 font-medium">{LIBELLE_CAPACITE[cle]}</td>
                  {RESEAUX.map((r) => {
                    const compte = comptes.find((c) => c.reseau === r);
                    const cap = connecteurTheorique(r, compte?.scopes ?? []).capacites[cle];
                    return (
                      <td key={r} className="px-3 py-2 text-xs">
                        {cap.disponible ? <span className="text-green-700 dark:text-green-400">✓ {cap.note ?? "Disponible"}</span> : <span className="text-neutral-500">✕ Fonction non disponible via API — {cap.raison}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {gerer && (
          <section className="space-y-2 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800">
            <h2 className="text-base font-semibold">Configuration technique</h2>
            <ul className="list-inside list-disc space-y-1 text-xs">
              <li>Mode : {modeSimulation() ? "simulation (SOCIAL_DRY_RUN ≠ false)" : "publication réelle (SOCIAL_DRY_RUN=false)"}</li>
              <li>Meta Graph API {meta.version} — application {meta.configure ? "configurée" : "non configurée"}{meta.configId ? " (Facebook Login for Business)" : ""} — webhook {meta.webhookVerifyToken ? "jeton de vérification défini" : "jeton de vérification absent"}</li>
              <li>LinkedIn API version {linkedin.version} — application {linkedin.configure ? "configurée" : "non configurée"}</li>
              {urlsRetour && <li>URL de retour OAuth Meta : <code>{urlsRetour.meta}</code></li>}
              {urlsRetour && <li>URL de retour OAuth LinkedIn : <code>{urlsRetour.linkedin}</code></li>}
              {urlsRetour && <li>Webhooks : <code>{urlsRetour.meta.replace("/oauth/meta/callback", "/webhooks/meta")}</code> et <code>{urlsRetour.meta.replace("/oauth/meta/callback", "/webhooks/linkedin")}</code></li>}
              <li>Permissions Meta demandées : {SCOPES_META.join(", ")}</li>
              <li>Permissions LinkedIn demandées : {SCOPES_LINKEDIN.join(", ")}</li>
            </ul>
            <BoutonAction libelle="Rechiffrer les jetons (rotation de clé)" action={rechiffrerJetonsAction} />
          </section>
        )}
      </div>
    </main>
  );
}
