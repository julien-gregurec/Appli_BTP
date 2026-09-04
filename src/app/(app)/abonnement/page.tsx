import Link from "next/link";
import { annulerBaisseCapacitePlanifieeAction, appliquerCapacitePersonnesAction, choisirPalierOptionIAAction, configurerPolitiqueIAAction, demarrerAbonnementAction, desactiverOptionIAAction, ouvrirPortailAbonnementAction, previsualiserCapacitePersonnesAction, reactiverOptionIAAction } from "@/app/actions/abonnement";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { AlerteDepassementAppareils } from "@/components/AlerteDepassementAppareils";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { calculerDepassementsAppareilsFacturables } from "@/lib/facturation-appareils";
import { offreParCle, OFFRES, prixAbonnementMensuel, statutAbonnement } from "@/lib/plateforme";
import { calculerFacturationStockage, OCTETS_PAR_GO, stripeBillingEstConfigure, TARIF_STOCKAGE_SUPPLEMENTAIRE_HT_PAR_GO } from "@/lib/stripe-abonnement";
import { consommationIAMensuelle } from "@/lib/ai/journal";
import { iaEstActive } from "@/lib/preview-features";
import { BRAND_NAME, PRODUCT_NAME, resoudreUrlContactCommercial } from "@/lib/brand";
import { calculerGainsOffreSuivante, calculerReductionRemise, CATEGORIES_COMPARATIF, etatLigneComparatif, LIBELLE_ETAT_COMMERCIAL, type EtatCommercial } from "@/lib/comparatif-offres";
import { estCodeOffreTarifaire } from "@/lib/tarification";
import { abonnementsPublicsOuverts } from "@/lib/commercialisation-abonnements";
import { OFFRES_ABONNEMENT_COMMERCIALISEES } from "@/lib/stripe-abonnement";
import { RACCOURCIS_CAPACITE, resoudreCibleCapacite, resumeChangementCapacite } from "@/lib/stripe-capacite-personnes";
import { BoutonEnvoi } from "@/components/BoutonEnvoi";

const input = "rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

const COULEUR_ETAT: Record<EtatCommercial, string> = {
  inclus: "bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300",
  limite: "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
  non_inclus: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
  beta: "bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300",
  desactive: "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500",
};

const FAQ_ABONNEMENT: Array<{ question: string; reponse: string }> = [
  { question: "Puis-je changer d'offre en cours d'abonnement ?", reponse: "Pas encore en libre-service : ni le portail Stripe, ni l'application ne proposent aujourd'hui de changement de plan autonome. Contactez-nous, le changement est fait manuellement." },
  { question: "Que se passe-t-il à la fin de l'essai de 30 jours ?", reponse: "Les nouvelles souscriptions sont temporairement fermées. Avant leur ouverture, les conditions de fin d'essai, la première échéance et le montant seront présentés pour validation. Les abonnements existants continuent selon leurs conditions contractuelles." },
  { question: "Puis-je ajouter des comptes au-delà du nombre inclus ?", reponse: "Oui, chaque compte supplémentaire est facturé en plus selon le tarif de votre offre, visible dans la section « Coût actuel de l'application » ci-dessus." },
  { question: "Où trouver mes factures d'abonnement ?", reponse: "Dans la section « Factures et historique » ci-dessous, ou via « Gérer mon abonnement » (portail Stripe) une fois souscrit." },
  { question: "Puis-je annuler mon abonnement ?", reponse: "Oui, depuis le portail Stripe (« Gérer mon abonnement ») : la résiliation prend effet à la fin de la période en cours, pas immédiatement." },
  { question: "Mes données sont-elles supprimées si j'annule ?", reponse: "Non, pas automatiquement. La suppression suit la procédure RGPD dédiée (menu Paramètres → Données), avec un délai de 30 jours avant purge définitive." },
  { question: "Puis-je descendre vers une offre inférieure (downgrade) ?", reponse: "Pas encore en libre-service. Contactez-nous pour modifier votre offre : nous vérifions d'abord que votre usage actuel (comptes, modules utilisés) reste compatible avec l'offre visée." },
  { question: "Une remise commerciale a-t-elle un impact sur ma facture Stripe ?", reponse: "Oui : la remise est appliquée directement sur votre abonnement Stripe et se répartit au prorata sur l'ensemble de la facture (abonnement de base et comptes supplémentaires inclus). Le montant que vous voyez ici correspond exactement à celui facturé." },
  { question: "L'assistant IA est-il disponible dès maintenant ?", reponse: "Pas encore en Production : la fonctionnalité est prête techniquement mais son activation commerciale n'a pas encore eu lieu. Le quota indicatif par offre est affiché ci-dessus." },
];

export default async function AbonnementPage({ searchParams }: { searchParams: Promise<{ error?: string; succes?: string; capacite_cible?: string }> }) {
  const [{ error, succes, capacite_cible }, ctx] = await Promise.all([searchParams, getContexteEntreprise()]);
  const supabase = await createClient();
  const [{ data: entreprise }, { data: utilisationStockage }, { data: employesFacturables }, { data: postes }, { data: appareils }, consommationIA, { data: facturesAbonnement }, { data: historique }, { data: capacitePersonnes }, { data: capaciteStripeEtat }, { data: modulesEtat }] = await Promise.all([
    supabase.from("entreprises").select("abonnement_statut,abonnement_echeance,abonnement_offre,abonnement_periodicite,abonnement_essai_fin,abonnement_annulation_prevue_at,stripe_customer_id,stripe_subscription_id,derniere_facture_url,derniere_facture_pdf,derniere_facture_statut,derniere_facture_at,option_ia_statut,option_ia_essai_fin,option_ia_palier,ia_active,ia_politique_quota,ia_plafond_cout_mensuel_ht,remise_description,remise_appliquee_at,remise_duree_mois,remise_type,remise_valeur").eq("id",ctx.entrepriseId).single(),
    supabase.rpc("utilisation_stockage_entreprise", { p_entreprise_id: ctx.entrepriseId }),
    supabase.from("employes").select("utilisateur_id,prenom,nom,poste_id,compte_application_statut").eq("entreprise_id", ctx.entrepriseId).in("compte_application_statut", ["actif", "pause"]),
    supabase.from("postes").select("id,nom,tarif_compte_mensuel").eq("entreprise_id", ctx.entrepriseId),
    supabase.from("appareils_comptes").select("utilisateur_id").eq("entreprise_id", ctx.entrepriseId).is("revoque_at", null),
    consommationIAMensuelle(supabase, ctx.entrepriseId),
    supabase.from("factures_abonnement").select("id,numero,periode_debut,periode_fin,montant_ttc,devise,statut,url_facture,url_pdf,created_at").eq("entreprise_id",ctx.entrepriseId).order("created_at",{ascending:false}).limit(24),
    supabase.from("historique_tarification").select("id,action,motif,created_at,nouveau").eq("entreprise_id",ctx.entrepriseId).order("created_at",{ascending:false}).limit(20),
    supabase.rpc("capacite_personnes_entreprise", { p_entreprise_id: ctx.entrepriseId }).maybeSingle(),
    supabase.rpc("capacite_stripe_etat_entreprise", { p_entreprise_id: ctx.entrepriseId }).maybeSingle(),
    supabase.rpc("modules_entreprise_etat", { p_entreprise_id: ctx.entrepriseId }),
  ]);
  const statut = statutAbonnement(entreprise?.abonnement_statut ?? "essai");
  const configure = stripeBillingEstConfigure();
  const abonnementsOuverts = abonnementsPublicsOuverts();
  const souscrit = Boolean(entreprise?.stripe_subscription_id);
  const offre = offreParCle(entreprise?.abonnement_offre ?? "essentiel");
  const stockage = Array.isArray(utilisationStockage) ? utilisationStockage[0] : utilisationStockage;
  const stockageGo = Number(stockage?.octets_utilises ?? 0) / OCTETS_PAR_GO;
  const stockagePourcentage = offre.stockageGoInclus > 0 ? stockageGo / offre.stockageGoInclus * 100 : 0;
  const stockageAlerte = stockagePourcentage >= 80;
  const stockageDepasse = stockagePourcentage > 100;
  const depassementsAppareils = calculerDepassementsAppareilsFacturables({
    appareils: appareils ?? [],
    employes: employesFacturables ?? [],
    postes: postes ?? [],
  });
  const nbComptesFacturables = employesFacturables?.length ?? 0;
  const supplementAppareilsMensuel = depassementsAppareils.reduce((total, ligne) => total + ligne.supplementMensuelHt, 0);
  const prixComptes = prixAbonnementMensuel(nbComptesFacturables, offre);
  const stockageMensuel = calculerFacturationStockage({
    octetsUtilises: Number(stockage?.octets_utilises ?? 0),
    quotaGo: offre.stockageGoInclus,
    periodicite: "mensuel",
  });
  const annuel = entreprise?.abonnement_periodicite === "annuel";
  const abonnementAvantRemiseMensuel = prixComptes.total + supplementAppareilsMensuel;
  const coutPeriodeEstime = annuel
    ? prixComptes.totalAnnuel + supplementAppareilsMensuel * 12 + stockageMensuel.montantHt * 12
    : abonnementAvantRemiseMensuel + stockageMensuel.montantHt;
  const coutMensuelEstime = annuel ? coutPeriodeEstime / 12 : coutPeriodeEstime;
  const nouvelleGrille = ["mini", "pro", "business", "entreprise", "sur_mesure"].includes(String(entreprise?.abonnement_offre ?? ""));
  const offreSuivante = nouvelleGrille ? OFFRES.find((o) => o.palier === offre.palier + 1) ?? null : null;
  // Calculé depuis le mapping unique (comparatif-offres.ts), pas une liste à part.
  const gainsOffreSuivante = offreSuivante && estCodeOffreTarifaire(offre.cle) && estCodeOffreTarifaire(offreSuivante.cle)
    ? calculerGainsOffreSuivante(offre.cle, offreSuivante.cle)
    : [];
  const remiseActive = Boolean(entreprise?.remise_description);
  const remiseReductionMensuelle = remiseActive
    ? calculerReductionRemise({ type: entreprise?.remise_type as "montant" | "pourcentage" | null, valeur: entreprise?.remise_valeur, sousTotal: abonnementAvantRemiseMensuel })
    : 0;
  const abonnementApresRemiseMensuel = Math.max(0, abonnementAvantRemiseMensuel - remiseReductionMensuelle);
  const paiementEnEchec = entreprise?.abonnement_statut === "suspendu" && souscrit;
  const euros = (montant: number) => montant.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
  const contactCommercial = resoudreUrlContactCommercial();
  type ModuleEtatRow = {
    module_code: string; nom: string; description: string | null; categorie: string;
    statut_catalogue: string; inclus_plan: boolean; entitlement_actif: boolean;
    origine: string | null; valide_jusqu: string | null;
  };
  const modules = ((modulesEtat ?? []) as ModuleEtatRow[]);
  const modulesInclus = modules.filter((m) => m.inclus_plan);
  const modulesActifs = modules.filter((m) => m.entitlement_actif && !m.inclus_plan);
  const modulesDisponibles = modules.filter(
    (m) => !m.inclus_plan && !m.entitlement_actif && (m.statut_catalogue === "actif" || m.statut_catalogue === "bientot"),
  );
  const capRow = (capacitePersonnes ?? null) as {
    personnes_actives?: number; capacite_base?: number; capacite_supplementaire?: number;
    capacite_totale?: number; etat?: string;
  } | null;
  const cap = capRow
    ? {
        actives: Number(capRow.personnes_actives ?? 0),
        base: Number(capRow.capacite_base ?? 0),
        sup: Number(capRow.capacite_supplementaire ?? 0),
        totale: Number(capRow.capacite_totale ?? 0),
        etat: String(capRow.etat ?? "ok"),
      }
    : null;

  // ── Capacité supplémentaire : gestion en libre-service (R2-C) ──────────────
  const capStripe = (capaciteStripeEtat ?? null) as {
    capacite_supplementaire_planifiee?: number | null;
    planifiee_effet_at?: string | null;
    operation_en_cours?: string | null;
    operation_en_cours_type?: string | null;
  } | null;
  const capaciteOffreEligible = (OFFRES_ABONNEMENT_COMMERCIALISEES as readonly string[]).includes(String(entreprise?.abonnement_offre ?? ""));
  const capaciteMensuel = entreprise?.abonnement_periodicite === "mensuel";
  const capaciteGerable = Boolean(cap) && souscrit && capaciteOffreEligible && capaciteMensuel;
  const operationCapaciteEnCours = String(capStripe?.operation_en_cours ?? "");
  const capaciteFigee = ["pending", "stripe_applied", "db_applied", "needs_reconcile"].includes(operationCapaciteEnCours);
  const LIBELLE_OPERATION_CAPACITE: Record<string, { texte: string; classe: string }> = {
    pending: { texte: "Mise à jour en cours", classe: "bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300" },
    stripe_applied: { texte: "Mise à jour en cours", classe: "bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300" },
    db_applied: { texte: "Mise à jour en cours", classe: "bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300" },
    needs_reconcile: { texte: "Vérification nécessaire", classe: "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-300" },
    scheduled: { texte: "Modification planifiée", classe: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300" },
    failed: { texte: "Échec", classe: "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300" },
  };
  const baissePlanifiee = capStripe?.planifiee_effet_at != null && capStripe?.capacite_supplementaire_planifiee != null
    ? { cible: Number(capStripe.capacite_supplementaire_planifiee), effetAt: String(capStripe.planifiee_effet_at) }
    : null;
  // Écran de confirmation (étape 2) : cible transmise par la prévisualisation, bornée serveur.
  const capaciteCibleDemande = capaciteGerable && !capaciteFigee && capacite_cible != null
    ? resoudreCibleCapacite({ actuel: cap?.sup ?? 0, cibleAbsolue: Number(capacite_cible) })
    : null;
  const resumeCapacite = capaciteCibleDemande != null && capaciteCibleDemande !== (cap?.sup ?? 0)
    ? resumeChangementCapacite({
        plan: entreprise?.abonnement_offre ?? null,
        capaciteBase: cap?.base ?? 0,
        personnesActives: cap?.actives ?? 0,
        supplementActuel: cap?.sup ?? 0,
        supplementCible: capaciteCibleDemande,
      })
    : null;

  return <main className="p-4 sm:p-8"><div className="mx-auto max-w-5xl space-y-6">
    <header><h1 className="text-xl font-semibold">Mon abonnement {PRODUCT_NAME}</h1><p className="text-sm text-neutral-500">Offre, moyen de paiement, échéances et factures de votre entreprise.</p></header>
    {ctx.essaiExpireSansOffre&&<div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
      <p className="font-semibold">Votre essai gratuit de 30 jours est terminé.</p>
      <p className="mt-1">Les fonctionnalités métier de {PRODUCT_NAME} sont bloquées tant qu’aucune offre n’est choisie. Vos données sont conservées intégralement et seront immédiatement disponibles après souscription.</p>
      <a href="#choisir-offre" className="mt-3 inline-block rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Choisir une offre</a>
    </div>}
    {!ctx.essaiExpireSansOffre&&ctx.abonnementStatut==="essai"&&<div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
      <p className="font-semibold">Essai gratuit en cours{ctx.abonnementEssaiFin?` — se termine le ${new Date(`${ctx.abonnementEssaiFin}T00:00:00`).toLocaleDateString("fr-FR")}`:""}.</p>
      <p className="mt-1">Accès temporaire à tous les modules commercialisés de {PRODUCT_NAME} (chantiers, pointage, notes de frais, véhicules, matériel, stock, rentabilité avancée, assistant IA), même sans offre encore choisie. <a href="#choisir-offre" className="font-semibold underline">Choisir une offre</a> pour continuer au-delà de l’essai.</p>
    </div>}
    {error&&<p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {succes&&<p className="rounded-md bg-green-50 p-3 text-sm text-green-700">Votre abonnement a été mis à jour.</p>}
    {paiementEnEchec&&<div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
      <p className="font-semibold">Le dernier prélèvement de votre abonnement a échoué.</p>
      <p className="mt-1">L’accès peut être limité tant que le moyen de paiement n’est pas mis à jour.</p>
      <form action={ouvrirPortailAbonnementAction} className="mt-3"><button className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800">Mettre à jour mon moyen de paiement</button></form>
    </div>}
    <section className="grid gap-3 rounded-xl border p-5 sm:grid-cols-3">
      <div><p className="text-xs uppercase text-neutral-500">Statut</p><p className="mt-1 font-semibold" style={{color:statut.couleur}}>{statut.libelle}</p></div>
      <div><p className="text-xs uppercase text-neutral-500">Offre</p><p className="mt-1 font-semibold">{entreprise?.abonnement_offre ? entreprise.abonnement_offre[0].toUpperCase()+entreprise.abonnement_offre.slice(1) : "À choisir"}{entreprise?.abonnement_periodicite ? ` · ${entreprise.abonnement_periodicite}` : ""}</p></div>
      <div><p className="text-xs uppercase text-neutral-500">Prochaine échéance</p><p className="mt-1 font-semibold">{entreprise?.abonnement_echeance ? new Date(entreprise.abonnement_echeance).toLocaleDateString("fr-FR") : entreprise?.abonnement_essai_fin ? new Date(entreprise.abonnement_essai_fin).toLocaleDateString("fr-FR") : "—"}</p></div>
      {entreprise?.abonnement_annulation_prevue_at&&<p className="sm:col-span-3 rounded bg-amber-50 p-3 text-sm text-amber-900">Résiliation programmée le {new Date(entreprise.abonnement_annulation_prevue_at).toLocaleDateString("fr-FR")}.</p>}
    </section>

    {cap&&<section id="capacite" className="rounded-xl border p-5 scroll-mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Personnes actives</h2>
          <p className="mt-1 text-sm text-neutral-500">Personnes enregistrées dans {PRODUCT_NAME} (les salariés sortis et les comptes fermés ne sont pas comptés). C’est la limite prévue par votre abonnement.</p>
        </div>
        <strong className={cap.etat==="ok" ? "text-lg" : "text-lg text-red-700"}>{cap.actives} / {cap.totale}</strong>
      </div>
      {cap.sup>0&&<p className="mt-2 text-xs text-neutral-500">{cap.base} incluses dans l’offre + {cap.sup} de capacité supplémentaire.</p>}
      {cap.etat==="limite_atteinte"&&<p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">Vous avez atteint la limite de personnes actives de votre abonnement. Pour en enregistrer une de plus : archivez une personne, ajoutez de la capacité ou changez d’offre. Aucune donnée n’est supprimée.</p>}
      {cap.etat==="over_capacity"&&<p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">Votre abonnement autorise {cap.totale} personnes actives et vous en avez actuellement {cap.actives}. Aucune nouvelle personne ne peut être activée tant que ce dépassement dure : archivez {Math.max(1,cap.actives-cap.totale)} personne(s), ajoutez de la capacité ou changez d’offre. Aucune donnée n’est supprimée.</p>}

      {capaciteGerable && <div className="mt-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Capacité supplémentaire</h3>
            <p className="mt-1 text-xs text-neutral-500">Personnes actives au-delà des {cap.base} incluses. {euros(offre.parCompteSup)} HT/mois par personne, facturé sur votre abonnement. Hausse : effet immédiat, facture proratisée. Baisse : effet à la fin de la période, sans suppression de personne.</p>
          </div>
          {capaciteFigee && <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${LIBELLE_OPERATION_CAPACITE[operationCapaciteEnCours]?.classe ?? ""}`}>{LIBELLE_OPERATION_CAPACITE[operationCapaciteEnCours]?.texte ?? "Mise à jour en cours"}</span>}
        </div>

        <p className="mt-3 text-sm">Aujourd’hui : <strong>{cap.sup}</strong> personne(s) supplémentaire(s) — {euros(cap.sup * offre.parCompteSup)} HT/mois.</p>

        {baissePlanifiee && <div className="mt-2 rounded-md bg-neutral-100 p-3 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          <p>Modification planifiée : passage à {baissePlanifiee.cible} personne(s) supplémentaire(s) le {new Date(baissePlanifiee.effetAt).toLocaleDateString("fr-FR")}. Aucune personne ne sera supprimée.</p>
          {cap.actives > cap.base + baissePlanifiee.cible && <p className="mt-1 font-medium text-amber-800 dark:text-amber-300">Votre entreprise sera au-dessus de sa capacité à cette date : aucune personne ne sera supprimée, mais toute nouvelle activation sera bloquée.</p>}
          <form action={annulerBaisseCapacitePlanifieeAction} className="mt-2">
            <ConfirmSubmitButton message="Annuler la modification planifiée ? Votre capacité supplémentaire actuelle est conservée." className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-900">Annuler la modification planifiée</ConfirmSubmitButton>
          </form>
        </div>}

        {capaciteFigee
          ? <p className="mt-3 text-xs text-neutral-500">Les ajustements de capacité sont indisponibles tant qu’une opération est en cours.</p>
          : !resumeCapacite && <div className="mt-3 space-y-3">
              <div>
                <p className="text-xs font-medium text-neutral-500">Ajouter</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {RACCOURCIS_CAPACITE.map((n) => <form key={`h${n}`} action={previsualiserCapacitePersonnesAction}>
                    <input type="hidden" name="raccourci" value={n} /><input type="hidden" name="sens" value="hausse" />
                    <BoutonEnvoi className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900" libelleEnCours="…">
                      <span aria-label={`Ajouter ${n} personne${n>1?"s":""} supplémentaire${n>1?"s":""}`}>+{n}</span>
                    </BoutonEnvoi>
                  </form>)}
                </div>
              </div>
              {cap.sup > 0 && <div>
                <p className="text-xs font-medium text-neutral-500">Réduire (effet fin de période)</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {RACCOURCIS_CAPACITE.filter((n) => n <= cap.sup).map((n) => <form key={`b${n}`} action={previsualiserCapacitePersonnesAction}>
                    <input type="hidden" name="raccourci" value={n} /><input type="hidden" name="sens" value="baisse" />
                    <BoutonEnvoi className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900" libelleEnCours="…">
                      <span aria-label={`Retirer ${n} personne${n>1?"s":""} supplémentaire${n>1?"s":""}`}>−{n}</span>
                    </BoutonEnvoi>
                  </form>)}
                </div>
              </div>}
            </div>}

        {resumeCapacite && <div role="alertdialog" aria-labelledby="capacite-confirm-titre" className="mt-3 rounded-lg border-2 border-[#0d1b2a] p-4 dark:border-neutral-200">
          <h4 id="capacite-confirm-titre" className="text-sm font-semibold">Confirmer le changement de capacité</h4>
          {resumeCapacite.sens === "hausse"
            ? <div className="mt-2 space-y-1 text-sm">
                <p>Vous ajoutez <strong>{resumeCapacite.deltaPersonnes}</strong> personne(s) supplémentaire(s) à {euros(resumeCapacite.prixUnitaireMensuelHt)} HT/mois/personne.</p>
                <p>Nouveau supplément mensuel : <strong>{euros(resumeCapacite.coutMensuelCibleHt)} HT</strong> (soit +{euros(resumeCapacite.coutMensuelDeltaHt)} HT/mois).</p>
                <p>Capacité totale : {cap.totale} → <strong>{resumeCapacite.capaciteTotaleProjetee}</strong> personnes actives.</p>
                <p className="text-xs text-neutral-500">Une facturation proratisée peut être générée immédiatement.</p>
              </div>
            : <div className="mt-2 space-y-1 text-sm">
                <p>Vous réduisez de <strong>{Math.abs(resumeCapacite.deltaPersonnes)}</strong> personne(s) supplémentaire(s).</p>
                <p>Capacité actuelle : {cap.totale} → future : <strong>{resumeCapacite.capaciteTotaleProjetee}</strong> personnes actives.</p>
                <p>Effet : fin de la période en cours{entreprise?.abonnement_echeance ? ` (le ${new Date(entreprise.abonnement_echeance).toLocaleDateString("fr-FR")})` : ""}. Aucune personne ne sera supprimée.</p>
                {resumeCapacite.depasseraCapacite && <p className="font-medium text-amber-800 dark:text-amber-300">Votre entreprise sera au-dessus de sa capacité à la date d’effet. Aucune personne ne sera supprimée, mais toute nouvelle activation sera bloquée.</p>}
              </div>}
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={appliquerCapacitePersonnesAction}>
              <input type="hidden" name="cible" value={resumeCapacite.supplementCible} />
              <BoutonEnvoi className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" libelleEnCours="Application en cours…">Confirmer</BoutonEnvoi>
            </form>
            <Link href="/abonnement#capacite" className="rounded-md border px-4 py-2 text-sm font-medium">Annuler</Link>
          </div>
        </div>}

        <p className="mt-3 text-[11px] text-neutral-500">La capacité se gère ici, pas depuis le portail Stripe. Pour annuler une baisse déjà planifiée avant son échéance, contactez-nous.</p>
      </div>}

      {cap && !capaciteGerable && souscrit && (cap.sup > 0 || cap.etat !== "ok") && <p className="mt-3 text-xs text-neutral-500">La gestion en libre-service de la capacité supplémentaire n’est pas disponible pour votre offre ou votre périodicité. <Link href={contactCommercial} className="underline">Contactez-nous</Link> pour l’ajuster.</p>}
    </section>}

    {modules.length>0&&<section className="rounded-xl border p-5">
      <div><h2 className="font-semibold">Modules</h2><p className="mt-1 text-sm text-neutral-500">Les modules optionnels s’ajoutent à n’importe quel forfait. La désactivation d’un module ne supprime jamais vos données.</p></div>
      <div className="mt-4 space-y-4 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase text-neutral-500">Inclus dans votre offre</p>
          {modulesInclus.length
            ? <ul className="mt-2 flex flex-wrap gap-2">{modulesInclus.map(m=><li key={m.module_code} className="rounded-full border border-green-300 bg-green-50 px-3 py-1 text-green-800 dark:bg-green-950/30 dark:text-green-200">{m.nom}</li>)}</ul>
            : <p className="mt-1 text-neutral-500">Aucun module inclus.</p>}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-neutral-500">Modules ajoutés</p>
          {modulesActifs.length
            ? <ul className="mt-2 space-y-1">{modulesActifs.map(m=><li key={m.module_code} className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-blue-800 dark:bg-blue-950/30 dark:text-blue-200">{m.nom}</span><span className="text-xs text-neutral-500">{m.origine==="essai"?"essai":m.origine==="offert"?"offert":m.origine==="achat"?"acheté":"actif"}{m.valide_jusqu?` · jusqu’au ${new Date(m.valide_jusqu).toLocaleDateString("fr-FR")}`:""}</span></li>)}</ul>
            : <p className="mt-1 text-neutral-500">Aucun module ajouté pour l’instant.</p>}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-neutral-500">Disponibles</p>
          <ul className="mt-2 space-y-1">{modulesDisponibles.map(m=><li key={m.module_code} className="flex flex-wrap items-center gap-2 text-neutral-600 dark:text-neutral-400"><span className="font-medium text-neutral-800 dark:text-neutral-200">{m.nom}</span><span className="text-xs">{m.statut_catalogue==="actif"?"Nous contacter":"Bientôt disponible"}</span></li>)}</ul>
          <p className="mt-2 text-xs text-neutral-500">Les tarifs des modules seront communiqués à l’ouverture de la souscription en ligne.</p>
        </div>
      </div>
    </section>}

    <section className="rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">Coût actuel de l’application</h2>
          <p className="mt-1 text-sm text-neutral-500">Estimation HT selon l’offre, les comptes facturables, les appareils actifs et le stockage utilisé.</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">{euros(coutPeriodeEstime)} <span className="text-sm font-normal text-neutral-500">HT/{annuel ? "an" : "mois"}</span></p>
          {annuel&&<p className="text-xs text-neutral-500">soit {euros(coutMensuelEstime)} HT/mois en moyenne</p>}
        </div>
      </div>
      {remiseActive && <div className="mt-4 rounded-lg border border-[#c9a24a]/40 bg-[#c9a24a]/10 p-3 text-sm">
        <p className="font-medium text-[#8a6a1f] dark:text-[#c9a24a]">Remise commerciale active · {entreprise?.remise_description}</p>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div><dt className="text-neutral-500">Prix catalogue</dt><dd className="font-semibold">{euros(abonnementAvantRemiseMensuel)} HT/mois</dd></div>
          <div><dt className="text-neutral-500">Remise</dt><dd className="font-semibold">− {euros(remiseReductionMensuelle)} HT/mois</dd></div>
          <div><dt className="text-neutral-500">Prix remisé</dt><dd className="font-semibold">{euros(abonnementApresRemiseMensuel)} HT/mois</dd></div>
        </dl>
        <p className="mt-2 text-[11px] text-neutral-500">Estimation sur l’abonnement de base et les comptes supplémentaires. Les dépassements d’appareils et de stockage, facturés séparément, n’y sont pas inclus ; le montant exact figure sur votre facture Stripe.</p>
      </div>}
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-900"><dt className="text-xs uppercase text-neutral-500">Offre {offre.nom}</dt><dd className="mt-1 font-semibold">{euros(offre.base)} HT/mois</dd><p className="text-xs text-neutral-500">{offre.comptesInclus} compte(s) inclus</p></div>
        <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-900"><dt className="text-xs uppercase text-neutral-500">Comptes de l’entreprise</dt><dd className="mt-1 font-semibold">{nbComptesFacturables} compte(s) facturable(s)</dd><p className="text-xs text-neutral-500">{prixComptes.employesSupplementaires > 0 ? `${prixComptes.employesSupplementaires} supplémentaire(s) × ${euros(prixComptes.parEmployeSup)} HT/mois` : "Aucun compte supplémentaire"}</p></div>
        <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-900"><dt className="text-xs uppercase text-neutral-500">Appareils supplémentaires</dt><dd className="mt-1 font-semibold">{euros(supplementAppareilsMensuel)} HT/mois</dd><p className="text-xs text-neutral-500">Deux appareils actifs sont inclus par salarié</p></div>
        <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-900"><dt className="text-xs uppercase text-neutral-500">Stockage supplémentaire</dt><dd className="mt-1 font-semibold">{euros(stockageMensuel.montantHt)} HT/mois</dd><p className="text-xs text-neutral-500">{stockageMensuel.depassementGo > 0 ? `${stockageMensuel.depassementGo.toLocaleString("fr-FR")} Go au-delà du quota` : "Aucun dépassement"}</p></div>
      </dl>
      <p className="mt-3 text-xs text-neutral-500">Les comptes actifs et en pause restent facturables. {annuel ? "Le prix annuel contractuel de l’offre est appliqué ; les options et dépassements restent détaillés séparément." : "Le montant définitif peut varier en cas de prorata ou de changement en cours de période."}</p>
    </section>

    <AlerteDepassementAppareils lignes={depassementsAppareils}/>

    <section className="rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="font-semibold">Stockage des documents</h2><p className="mt-1 text-sm text-neutral-500">Photos, justificatifs, plans, factures et documents privés de l’entreprise.</p></div>
        <p className="font-semibold">{stockageGo.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} Go / {offre.stockageGoInclus} Go</p>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800" role="progressbar" aria-label="Utilisation du stockage" aria-valuemin={0} aria-valuemax={offre.stockageGoInclus} aria-valuenow={Math.min(stockageGo, offre.stockageGoInclus)}>
        <div className={`h-full rounded-full ${stockageDepasse ? "bg-red-600" : stockageAlerte ? "bg-amber-500" : "bg-green-600"}`} style={{ width: `${Math.min(100, stockagePourcentage)}%` }}/>
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-neutral-500"><span>{Number(stockage?.fichiers ?? 0).toLocaleString("fr-FR")} fichier(s)</span><span>Au-delà : {TARIF_STOCKAGE_SUPPLEMENTAIRE_HT_PAR_GO.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} € HT / Go / mois</span></div>
      {stockageAlerte&&<p className={`mt-3 rounded-md p-3 text-sm ${stockageDepasse ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>{stockageDepasse ? `Le quota est dépassé de ${(stockageGo-offre.stockageGoInclus).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} Go. Le dépassement apparaîtra séparément sur la prochaine facture.` : "Vous avez utilisé au moins 80 % du stockage inclus dans votre offre."}</p>}
    </section>

    {!iaEstActive() && <section className="rounded-xl border border-[#c9a24a]/40 bg-[#c9a24a]/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Assistant IA</h2>
          <p className="mt-1 text-sm text-neutral-500">Assistant conversationnel, génération de devis, analyse de documents/photos, dictée vocale, proposition de créneaux planning.</p>
        </div>
        <span className="rounded-full bg-[#c9a24a]/10 px-3 py-1 text-xs font-semibold text-[#8a6a1f] dark:text-[#c9a24a]">IA — activation au lancement</span>
      </div>
      <p className="mt-3 text-xs text-neutral-500">Non disponible pour le moment. Quota indicatif prévu pour l’offre {offre.nom} une fois activée : {offre.operationsIAIncluses.toLocaleString("fr-FR")} opérations IA / mois.</p>
    </section>}

    {iaEstActive() && <>
    <section className="rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Consommation IA</h2><p className="mt-1 text-sm text-neutral-500">Le compteur est mensuel et les coûts internes ne sont jamais affichés aux utilisateurs standards.</p></div><strong>{consommationIA.utilise.toLocaleString("fr-FR")} / {consommationIA.quota.toLocaleString("fr-FR")}</strong></div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"><div className={`h-full ${consommationIA.seuilAlerte >= 100 ? "bg-red-600" : consommationIA.seuilAlerte >= 90 ? "bg-orange-500" : consommationIA.seuilAlerte >= 70 ? "bg-amber-500" : "bg-green-600"}`} style={{width:`${consommationIA.pourcentage}%`}}/></div>
      {consommationIA.seuilAlerte > 0 ? <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">{consommationIA.seuilAlerte === 100 ? "Quota atteint selon la politique choisie ci-dessous." : `Alerte : ${consommationIA.pourcentage} % du quota mensuel est utilisé.`}</p> : null}
      <form action={configurerPolitiqueIAAction} className="mt-4 flex flex-wrap items-end gap-3 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-900">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ia_active" defaultChecked={entreprise?.ia_active !== false}/> Autoriser l’IA</label>
        <label className="space-y-1 text-sm"><span className="block text-xs text-neutral-500">À l’épuisement du quota</span><select name="ia_politique_quota" defaultValue={entreprise?.ia_politique_quota??"blocage"} className={input}><option value="blocage">Bloquer jusqu’au mois suivant</option><option value="achat_pack">Demander l’achat d’un pack</option><option value="depassement_facture">Autoriser un dépassement facturé</option></select></label>
        <label className="space-y-1 text-sm"><span className="block text-xs text-neutral-500">Plafond de sécurité HT / mois</span><input type="number" min="0.01" max="100000" step="0.01" name="ia_plafond_cout_mensuel_ht" defaultValue={entreprise?.ia_plafond_cout_mensuel_ht??""} placeholder="Facultatif" className={input}/></label>
        <button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Enregistrer</button>
      </form>
      <p className="mt-2 text-xs text-neutral-500">Tout dépassement payant doit être activé volontairement. Les opérations déjà comprises dans l’offre restent incluses.</p>
    </section>

    <section className="rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Option IA</h2>
          <p className="mt-1 text-sm text-neutral-500">Assistant IA, génération de devis, analyse de documents/photos, dictée vocale, suggestions.</p>
        </div>
        {entreprise?.option_ia_statut==="gratuit"&&<span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-800">Incluse gratuitement</span>}
        {entreprise?.option_ia_statut==="essai"&&<span className="rounded-full bg-[#c9a24a]/10 px-3 py-1 text-xs font-semibold text-[#8a6a1f] dark:text-[#c9a24a]">Essai gratuit{entreprise.option_ia_essai_fin?` · jusqu’au ${new Date(entreprise.option_ia_essai_fin).toLocaleDateString("fr-FR")}`:""}</span>}
        {entreprise?.option_ia_statut==="actif"&&<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">Active</span>}
        {entreprise?.option_ia_statut==="annule"&&<span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">Désactivée</span>}
        {entreprise?.option_ia_statut==="indisponible"&&<span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">Indisponible</span>}
      </div>
      {entreprise?.option_ia_statut==="essai"&&<p className="mt-3 text-xs text-neutral-500">Essai offert par {BRAND_NAME}. Passé ce délai, si vous ne désactivez pas l’option, le palier choisi ci-dessous est facturé automatiquement sur votre abonnement.</p>}
      {!nouvelleGrille&&(entreprise?.option_ia_statut==="essai"||entreprise?.option_ia_statut==="actif")&&<form action={choisirPalierOptionIAAction} className="mt-4 flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-neutral-500">Palier ({entreprise.option_ia_statut==="essai"?"appliqué à la fin de l’essai":"appliqué immédiatement"})</span>
          <select name="palier" defaultValue={entreprise?.option_ia_palier??"300"} className={input}>
            <option value="100">100 appels IA / jour</option>
            <option value="300">300 appels IA / jour</option>
            <option value="illimite">Illimité</option>
          </select>
        </label>
        <button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Enregistrer le palier</button>
      </form>}
      {(entreprise?.option_ia_statut==="essai"||entreprise?.option_ia_statut==="actif")&&<form action={desactiverOptionIAAction} className="mt-3"><button className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">Désactiver l’option IA</button></form>}
      {entreprise?.option_ia_statut==="annule"&&(souscrit
        ? <form action={reactiverOptionIAAction} className="mt-4"><button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Réactiver l’option IA</button></form>
        : <p className="mt-3 text-xs text-neutral-500">Souscrivez à un abonnement ci-dessous pour pouvoir réactiver l’option IA.</p>)}
      {entreprise?.option_ia_statut==="indisponible"&&<p className="mt-3 text-xs text-neutral-500">L’essai gratuit est terminé. Souscrivez à un abonnement pour réactiver l’IA.</p>}
    </section>
    </>}

    {souscrit ? <section className="rounded-xl border p-5"><h2 className="font-semibold">Gérer l’abonnement</h2><p className="mt-1 text-sm text-neutral-500">Le portail sécurisé Stripe permet de changer de carte, télécharger les factures et gérer la résiliation.</p><div className="mt-4 flex flex-wrap gap-2"><form action={ouvrirPortailAbonnementAction}><button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Gérer mon abonnement</button></form>{entreprise?.derniere_facture_url&&<Link href={entreprise.derniere_facture_url} target="_blank" rel="noreferrer" className="rounded-md border px-4 py-2 text-sm font-medium">Voir la dernière facture</Link>}{entreprise?.derniere_facture_pdf&&<Link href={entreprise.derniere_facture_pdf} target="_blank" rel="noreferrer" className="rounded-md border px-4 py-2 text-sm font-medium">Télécharger le PDF</Link>}</div>{entreprise?.derniere_facture_at&&<p className="mt-3 text-xs text-neutral-500">Dernière facture : {entreprise.derniere_facture_statut??"—"} · {new Date(entreprise.derniere_facture_at).toLocaleString("fr-FR")}</p>}</section>
    : <section id="choisir-offre" className="space-y-4 scroll-mt-4"><div><h2 className="font-semibold">Choisir une offre</h2><p className="text-sm text-neutral-500">Essai gratuit de 30 jours. Les abonnements en ligne ouvriront prochainement.</p></div>{(!configure||!abonnementsOuverts)&&<p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">La souscription en ligne est temporairement fermée. Contactez {BRAND_NAME} pour préparer votre accès ; aucun paiement ne sera déclenché depuis cette page.</p>}<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{OFFRES.map(offre=>{const prix=prixAbonnementMensuel(offre.comptesInclus,offre);return <article key={offre.cle} className="rounded-xl border p-5"><h3 className="text-lg font-semibold">{offre.nom}</h3><p className="mt-1 min-h-20 text-sm text-neutral-500">{offre.resume}</p><p className="mt-4 text-2xl font-bold">{offre.devisObligatoire?"Sur devis":`${prix.total} €`} {!offre.devisObligatoire&&<span className="text-xs font-normal text-neutral-500">HT/mois</span>}</p>{offre.devisObligatoire||!configure||!abonnementsOuverts?<Link href={contactCommercial} className="mt-4 block rounded-md border px-3 py-2 text-center text-sm font-semibold">{offre.devisObligatoire?"Demander un devis":"Ouverture prochaine"}</Link>:<form action={demarrerAbonnementAction} className="mt-4 space-y-3"><input type="hidden" name="offre" value={offre.cle}/><input type="hidden" name="retour_erreur" value="/abonnement"/><select name="periodicite" defaultValue="mensuel" className={`${input} w-full`}><option value="mensuel">Mensuel</option><option value="annuel">Annuel · prix affiché avant validation</option></select><button className="w-full rounded-md bg-[#0d1b2a] px-3 py-2 text-sm font-semibold text-white">Démarrer l’essai</button></form>}</article>})}</div></section>}

    {souscrit && offreSuivante && <section className="rounded-xl border p-5">
      <h2 className="font-semibold">Passer à l’offre {offreSuivante.nom}</h2>
      <p className="mt-1 text-sm text-neutral-500">{offreSuivante.devisObligatoire ? "Sur devis, après échange avec notre équipe." : `${offreSuivante.comptesInclus} comptes inclus, à partir de ${euros(offreSuivante.base)} HT/mois.`}</p>
      {gainsOffreSuivante.length > 0 && <div className="mt-3">
        <p className="text-xs uppercase text-neutral-500">Vous gagneriez notamment</p>
        <ul className="mt-2 flex flex-wrap gap-2">{gainsOffreSuivante.map((g) => <li key={g} className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium dark:bg-neutral-800">{g}</li>)}</ul>
      </div>}
      <p className="mt-4 text-xs text-neutral-500">Le changement d’offre n’est pas encore en libre-service (ni depuis cette page, ni depuis le portail Stripe) : contactez-nous, nous l’appliquons manuellement.</p>
      <Link href={contactCommercial} className="mt-3 inline-block rounded-md border px-4 py-2 text-sm font-semibold">Demander le changement d’offre</Link>
    </section>}

    <section className="rounded-xl border p-5">
      <h2 className="font-semibold">Comparatif détaillé des offres</h2>
      <p className="mt-1 text-sm text-neutral-500">Différences réelles entre Mini, Pro, Business et Entreprise, par catégorie. « BETA » signifie une fonction disponible mais pas encore considérée comme stable commercialement ; « Bientôt disponible » signifie une fonction non encore activée dans le produit, quelle que soit l’offre.</p>
      <div className="mt-4 flex items-end gap-1.5 text-center text-[10px] font-semibold text-neutral-500 sm:gap-2 sm:text-xs">
        <span className="min-w-0 flex-1"></span>{OFFRES.filter((o)=>!o.devisObligatoire).map((o)=><span key={o.cle} className="w-12 shrink-0 sm:w-20">{o.nom}</span>)}
      </div>
      <div className="mt-2 space-y-2">
        {CATEGORIES_COMPARATIF.map((categorie)=><details key={categorie.cle} className="rounded-lg border border-neutral-200 dark:border-neutral-800">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">{categorie.titre}</summary>
          <div className="space-y-1.5 border-t border-neutral-200 p-3 dark:border-neutral-800">
            {categorie.lignes.map((ligne)=><div key={ligne.cle} className="flex items-center gap-1.5 text-xs sm:gap-2 sm:text-sm">
              <span className="min-w-0 flex-1 text-neutral-700 dark:text-neutral-300">{ligne.label}</span>
              {OFFRES.filter((o)=>!o.devisObligatoire).map((o)=>{
                if (!estCodeOffreTarifaire(o.cle)) return null;
                const etat = etatLigneComparatif(ligne, o.cle);
                return <span key={o.cle} className={`w-12 shrink-0 rounded-full px-1 py-1 text-center text-[9px] font-medium leading-tight sm:w-20 sm:px-2 sm:text-[11px] ${COULEUR_ETAT[etat]}`}>{LIBELLE_ETAT_COMMERCIAL[etat]}</span>;
              })}
            </div>)}
          </div>
        </details>)}
      </div>
      <p className="mt-3 text-xs text-neutral-500">L’offre Sur mesure reprend l’intégralité du palier Entreprise, complétée après cadrage — <Link href={contactCommercial} className="underline">contactez-nous</Link>.</p>
    </section>

    <section className="rounded-xl border p-5">
      <h2 className="font-semibold">Questions fréquentes</h2>
      <dl className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
        {FAQ_ABONNEMENT.map((item) => <details key={item.question} className="py-3 first:pt-0 last:pb-0">
          <summary className="cursor-pointer text-sm font-medium">{item.question}</summary>
          <dd className="mt-2 text-sm text-neutral-500">{item.reponse}</dd>
        </details>)}
      </dl>
    </section>

    <section className="rounded-xl border p-5"><h2 className="font-semibold">Factures de votre abonnement {BRAND_NAME}</h2><p className="mt-1 text-sm text-neutral-500">Uniquement les factures d’abonnement (Stripe) et les changements contractuels de votre entreprise — jamais vos factures clients.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-neutral-500"><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Référence</th><th className="py-2 pr-3">Montant TTC</th><th className="py-2 pr-3">Statut</th><th className="py-2">Document</th></tr></thead><tbody>{(facturesAbonnement??[]).map(facture=><tr key={facture.id} className="border-b"><td className="py-3 pr-3">{new Date(facture.created_at).toLocaleDateString("fr-FR")}</td><td className="py-3 pr-3">{facture.numero??"—"}</td><td className="py-3 pr-3">{Number(facture.montant_ttc).toLocaleString("fr-FR",{style:"currency",currency:String(facture.devise??"EUR")})}</td><td className="py-3 pr-3">{facture.statut}</td><td className="py-3">{facture.url_pdf?<Link href={facture.url_pdf} target="_blank" rel="noreferrer" className="underline">PDF</Link>:facture.url_facture?<Link href={facture.url_facture} target="_blank" rel="noreferrer" className="underline">Voir</Link>:"—"}</td></tr>)}</tbody></table>{!facturesAbonnement?.length?<p className="py-4 text-sm text-neutral-500">Aucune facture d’abonnement enregistrée.</p>:null}</div>{historique?.length?<details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Afficher les changements de tarif ({historique.length})</summary><ul className="mt-2 space-y-2 text-sm">{historique.map(event=><li key={event.id} className="rounded bg-neutral-50 p-2 dark:bg-neutral-900">{new Date(event.created_at).toLocaleString("fr-FR")} · {event.action}{event.motif?` — ${event.motif}`:""}</li>)}</ul></details>:null}</section>
  </div></main>;
}
