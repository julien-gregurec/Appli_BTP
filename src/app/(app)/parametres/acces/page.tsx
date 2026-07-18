import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import {
  creerPosteAction,
  enregistrerPermissionsPosteAction,
  installerRolesPredefinisAction,
  modifierPosteMembreAction,
  reinitialiserRolePredefiniAction,
  supprimerPosteAction,
} from "@/app/actions/acces";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { InvitationEntreprise } from "@/components/InvitationEntreprise";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import {
  categoriePermission,
  estPermissionConfigurable,
  normaliserNomRole,
  type ModeleRolePredefini,
} from "@/lib/roles-predefinis";

type Permission = { cle: string; module: string; description: string };
const DROITS_SOCLE = new Set(["acces_planning", "saisir_ses_notes_frais", "demander_ses_conges", "utiliser_borne_stock"]);

export default async function AccesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const msg = await searchParams;
  const ctx = await getContexteEntreprise();
  const sb = await createClient();

  const [{ data: entreprise }, { data: postes }, { data: catalogue }, { data: droits }, { data: membres }, { data: modeles }] =
    await Promise.all([
      sb.from("entreprises").select("code_adhesion").eq("id", ctx.entrepriseId).maybeSingle(),
      sb.from("postes").select("id, nom").eq("entreprise_id", ctx.entrepriseId).order("nom"),
      sb.from("permissions_disponibles").select("cle, module, description").order("module").order("description"),
      sb.from("permissions_poste").select("poste_id, cle_permission, autorise").eq("entreprise_id", ctx.entrepriseId),
      sb
        .from("utilisateurs_entreprises")
        .select("utilisateur_id, poste_id, statut, pointage_personnel_actif, utilisateur:utilisateurs(prenom, nom)")
        .eq("entreprise_id", ctx.entrepriseId)
        .in("statut", ["actif", "en_attente_validation"]),
      sb.from("modeles_roles_predefinis").select("cle, nom, description, ordre, permissions, tous_les_droits").order("ordre"),
    ]);

  const permissions = ((catalogue ?? []) as Permission[]).filter((permission) => estPermissionConfigurable(permission.cle));
  const groupes = new Map<string, Permission[]>();
  for (const p of permissions) groupes.set(p.module, [...(groupes.get(p.module) ?? []), p]);
  const compte = (id: string) => (membres ?? []).filter((m) => m.poste_id === id).length;
  const un = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  const rolesPredefinis = (modeles ?? []) as ModeleRolePredefini[];
  const nomsPostes = new Set((postes ?? []).map((poste) => normaliserNomRole(poste.nom)));
  const modeleDuPoste = (nom: string) => rolesPredefinis.find((modele) => normaliserNomRole(modele.nom) === normaliserNomRole(nom));

  return (
    <main className="p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <Link href="/parametres" className="text-sm text-neutral-500 hover:underline">← Paramètres</Link>
          <h1 className="mt-1 text-xl font-semibold">Accès et rôles</h1>
          <p className="text-sm text-neutral-500">
            Séparez l&apos;accès en consultation de la gestion. Un collaborateur peut voir un module sans pouvoir créer, modifier ou supprimer.
          </p>
        </div>

        {msg.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{msg.error}</p>}
        {msg.success && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{msg.success}</p>}

        <section className="grid gap-3 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100 md:grid-cols-2">
          <div><strong>Consulter</strong><p className="mt-1 text-xs opacity-80">Affiche le module et ses informations en lecture seule.</p></div>
          <div><strong>Gérer</strong><p className="mt-1 text-xs opacity-80">Autorise les créations, modifications, suppressions, imports, validations et envois. Gérer active automatiquement Consulter.</p></div>
        </section>

        <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <h2 className="font-semibold">Pointage facultatif par collaborateur</h2>
          <p className="mt-1 text-xs opacity-80">
            Vous choisissez ci-dessous, compte par compte, qui peut pointer en son nom. La consultation de l’équipe, la gestion et la validation restent des droits distincts du poste. Les modèles Administration et Conducteur de travaux ne pointent pas par défaut.
          </p>
        </section>

        <section className="rounded-md border border-[#c9a24a]/40 bg-[#c9a24a]/5 p-4">
          <h2 className="font-semibold">Code d&apos;entreprise</h2>
          <p className="text-sm text-neutral-500">
            Pour un employé, préparez d&apos;abord sa fiche, son poste et ses droits dans le module Employés : sa fiche produit une invitation personnelle. Ce code général reste disponible pour un collaborateur qui n&apos;a pas encore de fiche.
          </p>
          {entreprise?.code_adhesion ? (
            <InvitationEntreprise code={entreprise.code_adhesion} inscriptionsActives={!isEmailLoginDisabled()} />
          ) : (
            <p className="mt-3 text-sm text-red-600">Aucun code d’entreprise disponible.</p>
          )}
        </section>

        <section className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
          <h2 className="font-semibold">Compte partagé du dépôt</h2>
          <p className="mt-1">Créez un compte utilisateur dédié, puis affectez-le au poste protégé <strong>Compte dépôt</strong>. Ce compte reste connecté sur l’appareil du dépôt et ne voit que Stock, Borne stock et Dépôt.</p>
          <p className="mt-2 text-xs opacity-80">Chaque salarié saisit ensuite son identifiant et son mot de passe personnel sur la borne. Les droits « entrée de stock » et « sortie de stock » sont contrôlés sur son propre poste. Un autre compte ne peut se connecter à cet appareil qu’après déconnexion explicite du compte dépôt.</p>
        </section>

        <section className="rounded-md border p-4 dark:border-neutral-800">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Rôles prédéfinis BTP</h2>
              <p className="mt-1 text-sm text-neutral-500">Neuf modèles prêts à l’emploi. Leurs autorisations restent entièrement modifiables et vous pouvez toujours ajouter des rôles personnalisés.</p>
            </div>
            <form action={installerRolesPredefinisAction}>
              <button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-medium text-white">Ajouter les rôles manquants</button>
            </form>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rolesPredefinis.map((modele) => {
              const installe = nomsPostes.has(normaliserNomRole(modele.nom));
              return <div key={modele.cle} className={`rounded-md border p-3 ${installe ? "border-green-200 bg-green-50/60 dark:border-green-900 dark:bg-green-950/20" : "dark:border-neutral-800"}`}>
                <div className="flex items-center justify-between gap-2"><strong className="text-sm">{modele.nom}</strong><span className={`rounded-full px-2 py-0.5 text-[10px] ${installe ? "bg-green-100 text-green-800" : "bg-neutral-100 text-neutral-600"}`}>{installe ? "Installé" : "À ajouter"}</span></div>
                <p className="mt-1 text-xs text-neutral-500">{modele.description}</p>
              </div>;
            })}
          </div>
        </section>

        <section className="rounded-md border p-4 dark:border-neutral-800">
          <h2 className="font-semibold">Comptes et postes</h2>
          <div className="mt-3 space-y-2">
            {(membres ?? []).map((m) => {
              const u = un(m.utilisateur as { prenom: string | null; nom: string | null } | { prenom: string | null; nom: string | null }[] | null);
              const enAttente = m.statut === "en_attente_validation";
              const action = modifierPosteMembreAction.bind(null, m.utilisateur_id);
              return (
                <form key={m.utilisateur_id} action={action} className="grid gap-2 rounded bg-neutral-50 p-3 dark:bg-neutral-900 md:grid-cols-[minmax(180px,1fr)_minmax(180px,240px)_minmax(170px,220px)_auto] md:items-center">
                  <span className="flex-1 text-sm font-medium">
                    {[u?.prenom, u?.nom].filter(Boolean).join(" ") || "Compte utilisateur"}
                    {enAttente && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-800">En attente</span>}
                  </span>
                  <select name="poste_id" defaultValue={m.poste_id ?? ""} required className="rounded border px-3 py-1.5 text-sm dark:bg-neutral-900">
                    <option value="">Choisir un poste</option>
                    {postes?.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
                  </select>
                  <label className="grid gap-1 text-xs text-neutral-500">
                    Pointage personnel
                    <select name="pointage_personnel_actif" defaultValue={m.pointage_personnel_actif ? "true" : "false"} className="rounded border px-3 py-1.5 text-sm font-medium text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
                      <option value="true">Pointage activé</option>
                      <option value="false">Pointage désactivé</option>
                    </select>
                  </label>
                  <button className="rounded border px-3 py-1.5 text-sm font-medium">
                    {enAttente ? "Valider" : "Affecter"}
                  </button>
                </form>
              );
            })}
            {(!membres || membres.length === 0) && (
              <p className="text-sm text-neutral-500">Aucun membre pour l&apos;instant. Partagez le code d&apos;entreprise ci-dessus.</p>
            )}
          </div>
        </section>

        <form action={creerPosteAction} className="rounded-md border p-4 dark:border-neutral-800">
          <h2 className="font-semibold">Nouveau poste</h2>
          <div className="mt-3 flex gap-3">
            <input name="nom" required placeholder="Chef de chantier, comptable…" className="flex-1 rounded-md border px-3 py-2 text-sm dark:bg-neutral-900" />
            <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white dark:bg-white dark:text-neutral-900">Créer le poste</button>
          </div>
          <p className="mt-2 text-xs text-neutral-500">Le nouveau poste commence sans autorisation ; vous pourrez les activer juste après.</p>
        </form>

        <section className="rounded-md border p-4 dark:border-neutral-800">
          <div><h2 className="font-semibold">Aperçu par poste</h2><p className="text-sm text-neutral-500">Contrôlez le menu, les informations et les actions visibles avant d’attribuer un poste à un collaborateur.</p></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {postes?.map((poste) => {
              const autorise = new Set((droits ?? []).filter((d) => d.poste_id === poste.id && d.autorise).map((d) => d.cle_permission));
              return <Link key={poste.id} href={`/parametres/acces/apercu/${poste.id}`} className="group rounded-md border p-3 transition hover:border-[#c9a24a] hover:bg-[#c9a24a]/5">
                <div className="flex items-center justify-between gap-2"><strong className="truncate text-sm">{poste.nom}</strong><span className="text-xs text-[#9a7625] group-hover:underline">Voir l’aperçu →</span></div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]"><span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">{Array.from(autorise).filter((cle) => cle.startsWith("acces_")).length} consulter</span><span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{Array.from(autorise).filter((cle) => cle.startsWith("gerer_")).length} gérer</span><span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-800">{Array.from(autorise).filter((cle) => cle.startsWith("voir_")).length} chiffres</span></div>
              </Link>;
            })}
          </div>
        </section>

        <div className="space-y-4">
          {postes?.map((poste) => {
            const autorise = new Set((droits ?? []).filter((d) => d.poste_id === poste.id && d.autorise).map((d) => d.cle_permission));
            const consultations = Array.from(autorise).filter((cle) => cle.startsWith("acces_")).length;
            const gestions = Array.from(autorise).filter((cle) => cle.startsWith("gerer_")).length;
            const visualisations = Array.from(autorise).filter((cle) => cle.startsWith("voir_")).length;
            const action = enregistrerPermissionsPosteAction.bind(null, poste.id);
            const supprimer = supprimerPosteAction.bind(null, poste.id);
            const modele = modeleDuPoste(poste.nom);
            return (
              <article key={poste.id} className="overflow-hidden rounded-md border dark:border-neutral-800">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900 [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><h2 className="truncate font-semibold">{poste.nom}</h2>{modele && <span className="rounded-full bg-[#c9a24a]/15 px-2 py-0.5 text-[10px] font-medium text-[#8a681f]">Rôle prédéfini</span>}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                        <span>{compte(poste.id)} membre(s)</span>
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">{consultations} consultation(s)</span>
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{gestions} gestion(s)</span>
                        {visualisations > 0 && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-800">{visualisations} donnée(s) sensible(s)</span>}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium">
                      <span className="group-open:hidden">Afficher les droits ↓</span>
                      <span className="hidden group-open:inline">Réduire les droits ↑</span>
                    </span>
                  </summary>
                  {modele && <form action={reinitialiserRolePredefiniAction.bind(null,poste.id,modele.cle)} className="flex flex-wrap items-center justify-between gap-3 border-t bg-[#c9a24a]/5 px-4 py-3 dark:border-neutral-800">
                    <p className="text-xs text-neutral-600">Vous pouvez personnaliser ce rôle ci-dessous ou restaurer à tout moment les droits recommandés.</p>
                    <button className="rounded-md border border-[#c9a24a] px-3 py-1.5 text-xs font-medium text-[#8a681f]">Réappliquer le modèle recommandé</button>
                  </form>}
                  <form action={action} className="border-t dark:border-neutral-800">
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-50 px-4 py-3 dark:bg-neutral-900">
                      <p className="text-xs text-neutral-500">Cochez les droits de ce poste, puis enregistrez.</p>
                      <button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-medium text-white">Enregistrer les droits</button>
                    </div>
                    <div className="grid gap-5 p-4 md:grid-cols-2">
                    {Array.from(groupes.entries()).map(([module, liste]) => (
                      <fieldset key={module}>
                        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#9a7625]">{module}</legend>
                        <div className="space-y-2">
                          {liste.map((p) => {
                            const categorie = categoriePermission(p.cle);
                            return (
                            <label key={p.cle} className={`flex gap-2 rounded p-1.5 ${DROITS_SOCLE.has(p.cle) ? "cursor-default bg-green-50 dark:bg-green-950/20" : "cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900"}`}>
                              {DROITS_SOCLE.has(p.cle) && <input type="hidden" name="permissions" value={p.cle} />}
                              <input type="checkbox" name={DROITS_SOCLE.has(p.cle) ? undefined : "permissions"} value={p.cle} defaultChecked={DROITS_SOCLE.has(p.cle) || autorise.has(p.cle)} disabled={DROITS_SOCLE.has(p.cle)} className="mt-0.5" />
                              <span>
                                <span className="flex flex-wrap items-center gap-2 text-sm font-medium"><span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${categorie.classes}`}>{categorie.libelle}</span>{p.description}{DROITS_SOCLE.has(p.cle) && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-800">Inclus pour tous</span>}</span>
                                <span className="font-mono text-[10px] text-neutral-400">{p.cle}</span>
                              </span>
                            </label>
                          );})}
                        </div>
                      </fieldset>
                    ))}
                    </div>
                  </form>
                  {compte(poste.id) === 0 && (
                    <form action={supprimer} className="border-t px-4 py-3 text-right dark:border-neutral-800">
                      <ConfirmSubmitButton message={`Supprimer le poste « ${poste.nom} » ?`} className="text-xs text-red-600 hover:underline">Supprimer ce poste</ConfirmSubmitButton>
                    </form>
                  )}
                </details>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
