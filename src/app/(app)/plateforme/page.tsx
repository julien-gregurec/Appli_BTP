import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { estPlateformeAdmin, prixAbonnementMensuel, offreParCle, REDUCTION_ANNUELLE, type EntrepriseAbonnement } from "@/lib/plateforme";
import { activerAdminPlateformeAction, ajouterAdminPlateformeAction, creerEntreprisePlateformeAction, detacherAdminPlateformeAction, genererSnapshotFacturationAction, rattacherAdminPlateformeAction, retirerAdminPlateformeAction } from "@/app/actions/plateforme";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { BRAND_NAME } from "@/lib/brand";

type MembrePlateforme = { email: string; role: string; nom: string | null; ajoute_par: string | null; actif: boolean | null; statut_identite: string | null; proprietaire: boolean | null; created_at: string };
const ROLE_LABEL: Record<string, string> = { total: "Accès total", support: "Support", facturation: "Facturation", lecture: "Lecture seule" };

// Les quatre états du cycle d'identité administrateur (migration 20260826000237).
// Seul « active » confère des droits : les trois autres sont volontairement inertes.
const ETATS_IDENTITE: Record<string, { libelle: string; classe: string }> = {
  en_attente: { libelle: "Déclarée, sans compte", classe: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300" },
  rattachee_non_confirmee: { libelle: "Rattachée, à activer", classe: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  active: { libelle: "Active", classe: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  revoquee: { libelle: "Révoquée", classe: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200" },
};

const input = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export default async function PlateformePage({ searchParams }: { searchParams: Promise<{ succes?: string; error?: string }> }) {
  if (!(await estPlateformeAdmin())) notFound();
  const msg = await searchParams;
  const supabase = await createClient();

  let entreprises: EntrepriseAbonnement[] = [];
  let appareilsParEntreprise = new Map<string,{nb_appareils_actifs:number;nb_comptes_plus_de_deux:number;maximum_appareils_compte:number;montant_depassements_ht:number}>();
  if (isEmailLoginDisabled()) {
    const { data: ents } = await supabase
      .from("entreprises")
      .select("id, nom, code_adhesion, reference_interne, abonnement_statut, abonnement_echeance, abonnement_note, impaye_signale_at, suspension_prevue_at, impaye_message, dernier_reglement_at, remise_stripe_coupon_id, remise_description, remise_appliquee_at, remise_motif_interne, remise_duree_mois, remise_cree_par, remise_type, remise_valeur, option_ia_statut, option_ia_essai_fin, option_ia_palier, created_at")
      .order("created_at", { ascending: false });
    const { data: membres } = await supabase.from("utilisateurs_entreprises").select("entreprise_id, statut");
    const { data: employes } = await supabase.from("employes").select("entreprise_id, poste_id, statut, compte_application_statut, utilisateur_id, invitation_envoyee_at, application_installee_at, derniere_connexion_at");
    const { data: droits } = await supabase.from("permissions_poste").select("entreprise_id, cle_permission, autorise").eq("autorise", true).like("cle_permission", "acces_%");
    const { data: postes } = await supabase.from("postes").select("id,entreprise_id,nom,code_offre,tarif_compte_mensuel").order("nom");
    const { data: besoins } = await supabase.from("entreprise_besoins").select("entreprise_id,offre_recommandee");
    entreprises = (ents ?? []).map((e) => ({
      ...e,
      nb_membres: (membres ?? []).filter((m) => m.entreprise_id === e.id).length,
      nb_membres_actifs: (membres ?? []).filter((m) => m.entreprise_id === e.id && m.statut === "actif").length,
      nb_fiches_employes: (employes ?? []).filter((item) => item.entreprise_id === e.id && item.statut !== "sorti").length,
      nb_comptes_actives: (employes ?? []).filter((item) => item.entreprise_id === e.id && item.compte_application_statut === "actif").length,
      nb_comptes_pause: (employes ?? []).filter((item) => item.entreprise_id === e.id && item.compte_application_statut === "pause").length,
      nb_comptes_facturables: (employes ?? []).filter((item) => item.entreprise_id === e.id && ["actif", "pause"].includes(item.compte_application_statut ?? "")).length,
      nb_invitations_envoyees: (employes ?? []).filter((item) => item.entreprise_id === e.id && item.invitation_envoyee_at).length,
      nb_applications_installees: (employes ?? []).filter((item) => item.entreprise_id === e.id && item.application_installee_at).length,
      nb_connectes_30j: (employes ?? []).filter((item) => item.entreprise_id === e.id && item.derniere_connexion_at && new Date(item.derniere_connexion_at).getTime() >= Date.now() - 30 * 86400000).length,
      derniere_connexion: (employes ?? []).filter((item) => item.entreprise_id === e.id && item.derniere_connexion_at).map((item) => item.derniere_connexion_at as string).sort().at(-1) ?? null,
      options_actives: [...new Set((droits ?? []).filter((item) => item.entreprise_id === e.id).map((item) => item.cle_permission.replace("acces_", "")))].sort(),
      offre_recommandee: (besoins ?? []).find((item) => item.entreprise_id === e.id)?.offre_recommandee ?? "essentiel",
    })) as EntrepriseAbonnement[];
    const{data:appareils}=await supabase.from("appareils_comptes").select("entreprise_id,utilisateur_id,revoque_at").is("revoque_at",null);
    for(const entreprise of entreprises){const actifs=(appareils??[]).filter(a=>a.entreprise_id===entreprise.id),comptes=new Map<string,number>();for(const appareil of actifs)comptes.set(appareil.utilisateur_id,(comptes.get(appareil.utilisateur_id)??0)+1);const utilisateursDepasses=[...comptes.entries()].filter(([,nombre])=>nombre>2).map(([utilisateurId])=>utilisateurId);const montantDepassements=utilisateursDepasses.reduce((total,utilisateurId)=>{const employe=(employes??[]).find(item=>item.entreprise_id===entreprise.id&&item.utilisateur_id===utilisateurId);const poste=(postes??[]).find(item=>item.id===employe?.poste_id);return total+Number(poste?.tarif_compte_mensuel??0);},0);appareilsParEntreprise.set(entreprise.id,{nb_appareils_actifs:actifs.length,nb_comptes_plus_de_deux:utilisateursDepasses.length,maximum_appareils_compte:Math.max(0,...comptes.values()),montant_depassements_ht:montantDepassements});}
  } else {
    // Les tarifs par poste ont rejoint la fiche de l'entreprise : cette page ne
    // les charge plus.
    const [{ data }, { data: usages }, { data: besoins },{data:usageAppareils}] = await Promise.all([supabase.rpc("plateforme_entreprises"), supabase.rpc("plateforme_usage_entreprises"), supabase.rpc("plateforme_besoins"),supabase.rpc("plateforme_usage_appareils")]);
    const usageParEntreprise = new Map<string, Partial<EntrepriseAbonnement>>(((usages ?? []) as Array<Partial<EntrepriseAbonnement> & { entreprise_id: string }>).map((usage) => [usage.entreprise_id, usage]));
    const offreParEntreprise = new Map<string, string>(((besoins ?? []) as Array<{entreprise_id:string;offre_recommandee:string|null}>).map((besoin) => [besoin.entreprise_id, besoin.offre_recommandee ?? "essentiel"]));
    entreprises = ((data ?? []) as EntrepriseAbonnement[]).map((entreprise) => ({ ...entreprise, ...(usageParEntreprise.get(entreprise.id) ?? {}), offre_recommandee: offreParEntreprise.get(entreprise.id) ?? "essentiel" }));
    appareilsParEntreprise=new Map(((usageAppareils??[])as Array<{entreprise_id:string;nb_appareils_actifs:number;nb_comptes_plus_de_deux:number;maximum_appareils_compte:number;montant_depassements_ht:number}>).map(usage=>[usage.entreprise_id,{nb_appareils_actifs:Number(usage.nb_appareils_actifs),nb_comptes_plus_de_deux:Number(usage.nb_comptes_plus_de_deux),maximum_appareils_compte:Number(usage.maximum_appareils_compte),montant_depassements_ht:Number(usage.montant_depassements_ht)}]));
  }

  let membresPlateforme: MembrePlateforme[] = [];
  // Le cycle d'identité (rattacher / activer / détacher) est réservé au rôle `total` en
  // session AAL2. `plateforme_ecriture_autorisee` applique exactement ce prédicat côté base ;
  // l'écran ne fait que le refléter pour expliquer une commande absente. Si le prédicat
  // n'est pas interrogeable, on laisse les commandes visibles plutôt que de rendre la
  // plateforme inadministrable : chaque RPC refuse de toute façon l'appel qui l'atteindrait
  // hors rôle `total` et AAL2. La base reste la seule autorité.
  let peutGererIdentites = false;
  const modeDemonstration = isEmailLoginDisabled();
  if (modeDemonstration) {
    const { data } = await supabase.from("plateforme_admins").select("email, role, nom, ajoute_par, actif, statut_identite, proprietaire, created_at").order("created_at");
    membresPlateforme = (data ?? []) as MembrePlateforme[];
  } else {
    const [{ data }, { data: autorise, error: erreurAutorisation }] = await Promise.all([
      supabase.rpc("plateforme_lister_admins"),
      supabase.rpc("plateforme_ecriture_autorisee", { p_roles: ["total"] }),
    ]);
    membresPlateforme = (data ?? []) as MembrePlateforme[];
    peutGererIdentites = erreurAutorisation ? true : autorise === true;
  }

  const parStatut = (cle: string) => entreprises.filter((e) => e.abonnement_statut === cle).length;
  const impayes = entreprises.filter((e) => Boolean(e.suspension_prevue_at)).length;
  const alertesAppareils=[...appareilsParEntreprise.values()].reduce((total,usage)=>total+usage.nb_comptes_plus_de_deux,0);
  const revenuMensuelRecurrent = entreprises.filter((e)=>e.abonnement_statut==="actif").reduce((total,e)=>{
    const comptes=e.nb_comptes_facturables??e.nb_comptes_actives??e.nb_membres_actifs;
    const offre=offreParCle(e.abonnement_offre??e.offre_recommandee??"essentiel");
    const appareils=appareilsParEntreprise.get(e.id)?.montant_depassements_ht??0;
    const mensuel=prixAbonnementMensuel(comptes,offre,appareils).total;
    return total+mensuel*(e.abonnement_periodicite==="annuel"?1-REDUCTION_ANNUELLE:1);
  },0);

  return (
    <main className="p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
          <h1 className="text-xl font-semibold">Plateforme — entreprises clientes</h1>
          <p className="text-sm text-neutral-500">
            Vue réservée au propriétaire. Chaque entreprise possède un code et un statut d&apos;abonnement à gérer.
          </p>
          </div>
          <div className="flex gap-2">
            <Link href="/plateforme/applications" className="rounded-md border px-3 py-2 text-sm font-medium">Applications ELSATIA</Link>
            <Link href="/plateforme/tarification" className="rounded-md border px-3 py-2 text-sm font-medium">Tarification</Link>
            <Link href="/plateforme/roles-demo" className="rounded-md border px-3 py-2 text-sm font-medium">Rôles de démonstration</Link>
            <Link href="/plateforme/support" className="rounded-md border px-3 py-2 text-sm font-medium">Support</Link>
            <Link href="/plateforme/facturation" className="rounded-md border px-3 py-2 text-sm font-medium">Relevés de facturation</Link>
            <Link href="/plateforme/stripe" className="rounded-md border px-3 py-2 text-sm font-medium">Diagnostic Stripe</Link>
          </div>
        </div>

        {msg.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{msg.error}</p>}
        {msg.succes && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{msg.succes}</p>}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          {[
            { label: "Entreprises", valeur: entreprises.length },
            { label: "Actives", valeur: parStatut("actif") },
            { label: "En essai", valeur: parStatut("essai") },
            { label: "Suspendues", valeur: parStatut("suspendu") },
            { label: "Impayés à suivre", valeur: impayes },
            { label: "Alertes appareils", valeur: alertesAppareils },
            { label: "MRR HT", valeur: `${revenuMensuelRecurrent.toLocaleString("fr-FR",{maximumFractionDigits:0})} €` },
            { label: "ARR HT", valeur: `${(revenuMensuelRecurrent*12).toLocaleString("fr-FR",{maximumFractionDigits:0})} €` },
          ].map((s) => (
            <div key={s.label} className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
              <div className="text-xs uppercase text-neutral-500">{s.label}</div>
              <div className="mt-1 text-2xl font-semibold">{s.valeur}</div>
            </div>
          ))}
        </div>
        <form action={creerEntreprisePlateformeAction} className="grid gap-2 rounded-md border p-4 sm:grid-cols-[2fr_1fr_1fr_auto]"><div className="sm:col-span-4"><h2 className="font-semibold">Ajouter une entreprise cliente</h2><p className="text-xs text-neutral-500">L’entreprise est créée en essai avec ses postes de départ. Son administrateur pourra ensuite être invité.</p></div><input name="nom" required placeholder="Nom de l’entreprise" className={input}/><input name="siret" placeholder="SIRET" className={input}/><input name="ville" placeholder="Ville" className={input}/><button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Créer</button></form>
        <form action={genererSnapshotFacturationAction} className="flex flex-wrap items-end gap-3 rounded-md border border-blue-200 bg-blue-50/50 p-4"><div className="flex-1"><h2 className="font-semibold">Relevé mensuel des comptes facturables</h2><p className="text-xs text-neutral-500">Les comptes actifs et en pause sont figés avec le tarif de leur poste pour le mois choisi.</p></div><label className="text-xs text-neutral-500">Mois<input name="mois" type="month" defaultValue={new Date().toISOString().slice(0,7)} className={`${input} mt-1 block`}/></label><button className="rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white">Générer le relevé</button></form>

        <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="font-semibold">Équipe plateforme</h2>
          <p className="text-xs text-neutral-500">
            Les collaborateurs {BRAND_NAME} qui peuvent assister toutes les entreprises. Une identité ne
            devient opérationnelle qu&apos;au terme du cycle <strong>déclarer → rattacher → activer</strong>.
            Chaque étape exige le rôle « Accès total » et une session en authentification forte (AAL2) ;
            l&apos;auto-rattachement et l&apos;auto-activation sont refusés par la base.
          </p>
          {modeDemonstration ? (
            <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Mode démonstration : la gestion des administrateurs plateforme est fermée. Le cycle
              d&apos;identité exige des comptes authentifiés réels.
            </p>
          ) : !peutGererIdentites && (
            <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Cycle d&apos;identité indisponible depuis cette session : il demande le rôle « Accès total »
              et une authentification forte (AAL2). Réauthentifiez-vous avec votre second facteur, puis
              rechargez cette page.
            </p>
          )}
          <ul className="mt-3 space-y-2">
            {membresPlateforme.map((m) => {
              const etat = ETATS_IDENTITE[m.statut_identite ?? ""] ?? { libelle: m.statut_identite ?? "état inconnu", classe: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300" };
              const aRattacher = m.statut_identite === "en_attente" || m.statut_identite === "revoquee";
              return (
                <li key={m.email} className="rounded border border-neutral-100 p-2 text-sm dark:border-neutral-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <strong>{m.nom || m.email}</strong>
                      {m.nom && <span className="ml-2 text-neutral-500">{m.email}</span>}
                      <span className="ml-2 rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{ROLE_LABEL[m.role] ?? m.role}</span>
                      <span className={`ml-2 rounded px-2 py-0.5 text-xs ${etat.classe}`}>{etat.libelle}</span>
                      {m.proprietaire && (
                        <span
                          className="ml-2 rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200"
                          title="Propriétaire global ELSATIA : accès automatique à toutes les applications actives du catalogue, présentes et futures."
                        >
                          Propriétaire ELSATIA
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {m.statut_identite === "rattachee_non_confirmee" && peutGererIdentites && (
                        <form action={activerAdminPlateformeAction}>
                          <input type="hidden" name="email" value={m.email} />
                          <ConfirmSubmitButton
                            className="rounded border border-green-300 px-2 py-1 text-xs font-semibold text-green-800 hover:bg-green-50"
                            message={`Activer ${m.email} comme administrateur plateforme « ${ROLE_LABEL[m.role] ?? m.role} » ? Cette personne obtiendra immédiatement les droits du rôle sur toutes les entreprises. L'activation est tracée avec votre identifiant.`}
                          >
                            Activer
                          </ConfirmSubmitButton>
                        </form>
                      )}
                      {m.statut_identite === "revoquee" && peutGererIdentites && (
                        <form action={detacherAdminPlateformeAction}>
                          <input type="hidden" name="email" value={m.email} />
                          <ConfirmSubmitButton
                            className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
                            message={`Détacher le compte de connexion de ${m.email} ? L'identité reste révoquée et conservée pour l'audit ; le détachement est refusé si une session support est encore ouverte.`}
                          >
                            Détacher le compte
                          </ConfirmSubmitButton>
                        </form>
                      )}
                      {m.statut_identite !== "revoquee" && !m.proprietaire && (
                        <form action={retirerAdminPlateformeAction}>
                          <input type="hidden" name="email" value={m.email} />
                          <ConfirmSubmitButton
                            className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                            message={`Révoquer ${m.email} ? Ses droits plateforme sont retirés et ses sessions support ouvertes sont fermées immédiatement. La base refuse de révoquer le dernier administrateur « Accès total » actif.`}
                          >
                            Retirer
                          </ConfirmSubmitButton>
                        </form>
                      )}
                    </div>
                  </div>
                  {aRattacher && peutGererIdentites && (
                    <form action={rattacherAdminPlateformeAction} className="mt-2 grid gap-2 border-t border-neutral-100 pt-2 dark:border-neutral-800 sm:grid-cols-[2fr_auto]">
                      <input type="hidden" name="email" value={m.email} />
                      <label className="text-xs text-neutral-500">
                        Identifiant du compte Supabase (Authentication → Users → UID)
                        <input
                          name="utilisateur_id"
                          required
                          autoComplete="off"
                          spellCheck={false}
                          placeholder="00000000-0000-0000-0000-000000000000"
                          pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
                          className={`${input} mt-1 block w-full font-mono`}
                        />
                      </label>
                      <ConfirmSubmitButton
                        className="self-end rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white"
                        message={`Rattacher ${m.email} à cet identifiant de compte ? Aucun droit n'est accordé à cette étape : l'identité passera en « rattachée, non confirmée » et devra encore être activée.`}
                      >
                        Rattacher
                      </ConfirmSubmitButton>
                      <p className="text-xs text-neutral-500 sm:col-span-2">
                        La base vérifie que ce compte existe, porte exactement cette adresse et l&apos;a
                        confirmée. L&apos;activation exigera en plus un facteur MFA vérifié sur ce compte.
                      </p>
                    </form>
                  )}
                </li>
              );
            })}
            {membresPlateforme.length === 0 && <li className="text-sm text-neutral-500">Aucun membre listé.</li>}
          </ul>
          <form action={ajouterAdminPlateformeAction} className="mt-3 grid gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800 sm:grid-cols-[1.5fr_1fr_1fr_auto]">
            <input name="email" type="email" required placeholder="collaborateur@exemple.fr" className={input} />
            <input name="nom" placeholder="Nom (optionnel)" className={input} />
            <select name="role" className={input} defaultValue="total">
              <option value="total">Accès total</option>
              <option value="support">Support</option>
              <option value="facturation">Facturation</option>
              <option value="lecture">Lecture seule</option>
            </select>
            <button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Déclarer</button>
          </form>
          <p className="mt-2 text-xs text-neutral-500">
            Après la déclaration : créez le compte de connexion dans Supabase (Authentication → Add user)
            avec le même email, faites confirmer l&apos;adresse et enrôler un facteur MFA, puis revenez ici
            pour rattacher son identifiant et activer l&apos;identité. Aucune intervention SQL n&apos;est
            nécessaire. Ne recopiez jamais un mot de passe ni un jeton dans cet écran.
          </p>
        </section>

        <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="font-semibold">Entreprises clientes</h2>
          <p className="mt-1 text-sm text-neutral-500">
            La liste par entreprise a été remplacée par un annuaire : tableau sur ordinateur, lignes compactes sur
            téléphone, recherche, onglets de suivi, filtres, tri et pagination. Les commandes qui vivaient dans
            chaque carte — statut d&apos;abonnement, tarifs par poste, remise, impayé, accès d&apos;assistance,
            réinitialisation de mot de passe — sont désormais dans la fiche de l&apos;entreprise concernée, où
            elles s&apos;appliquent à un client identifié plutôt qu&apos;au milieu d&apos;une liste.
          </p>
          <Link
            href="/plateforme/entreprises"
            className="mt-3 inline-block rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white"
          >
            Ouvrir l&apos;annuaire des entreprises
          </Link>
        </section>
      </div>
    </main>
  );
}
