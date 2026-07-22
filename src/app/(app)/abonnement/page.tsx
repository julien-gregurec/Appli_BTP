import Link from "next/link";
import { choisirPalierOptionIAAction, configurerPolitiqueIAAction, demarrerAbonnementAction, desactiverOptionIAAction, ouvrirPortailAbonnementAction, reactiverOptionIAAction } from "@/app/actions/abonnement";
import { AlerteDepassementAppareils } from "@/components/AlerteDepassementAppareils";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { calculerDepassementsAppareilsFacturables } from "@/lib/facturation-appareils";
import { offreParCle, OFFRES, prixAbonnementMensuel, statutAbonnement } from "@/lib/plateforme";
import { calculerFacturationStockage, OCTETS_PAR_GO, stripeBillingEstConfigure, TARIF_STOCKAGE_SUPPLEMENTAIRE_HT_PAR_GO } from "@/lib/stripe-abonnement";
import { consommationIAMensuelle } from "@/lib/ai/journal";

const input = "rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export default async function AbonnementPage({ searchParams }: { searchParams: Promise<{ error?: string; succes?: string }> }) {
  const [{ error, succes }, ctx] = await Promise.all([searchParams, getContexteEntreprise()]);
  const supabase = await createClient();
  const [{ data: entreprise }, { data: utilisationStockage }, { data: employesFacturables }, { data: postes }, { data: appareils }, consommationIA, { data: facturesAbonnement }, { data: historique }] = await Promise.all([
    supabase.from("entreprises").select("abonnement_statut,abonnement_echeance,abonnement_offre,abonnement_periodicite,abonnement_essai_fin,abonnement_annulation_prevue_at,stripe_customer_id,stripe_subscription_id,derniere_facture_url,derniere_facture_pdf,derniere_facture_statut,derniere_facture_at,option_ia_statut,option_ia_essai_fin,option_ia_palier,ia_active,ia_politique_quota,ia_plafond_cout_mensuel_ht").eq("id",ctx.entrepriseId).single(),
    supabase.rpc("utilisation_stockage_entreprise", { p_entreprise_id: ctx.entrepriseId }),
    supabase.from("employes").select("utilisateur_id,prenom,nom,poste_id,compte_application_statut").eq("entreprise_id", ctx.entrepriseId).in("compte_application_statut", ["actif", "pause"]),
    supabase.from("postes").select("id,nom,tarif_compte_mensuel").eq("entreprise_id", ctx.entrepriseId),
    supabase.from("appareils_comptes").select("utilisateur_id").eq("entreprise_id", ctx.entrepriseId).is("revoque_at", null),
    consommationIAMensuelle(supabase, ctx.entrepriseId),
    supabase.from("factures_abonnement").select("id,numero,periode_debut,periode_fin,montant_ttc,devise,statut,url_facture,url_pdf,created_at").eq("entreprise_id",ctx.entrepriseId).order("created_at",{ascending:false}).limit(24),
    supabase.from("historique_tarification").select("id,action,motif,created_at,nouveau").eq("entreprise_id",ctx.entrepriseId).order("created_at",{ascending:false}).limit(20),
  ]);
  const statut = statutAbonnement(entreprise?.abonnement_statut ?? "essai");
  const configure = stripeBillingEstConfigure();
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
  const euros = (montant: number) => montant.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

  return <main className="p-4 sm:p-8"><div className="mx-auto max-w-5xl space-y-6">
    <header><h1 className="text-xl font-semibold">Mon abonnement Liria Gestion Pro</h1><p className="text-sm text-neutral-500">Offre, moyen de paiement, échéances et factures de votre entreprise.</p></header>
    {error&&<p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {succes&&<p className="rounded-md bg-green-50 p-3 text-sm text-green-700">Votre abonnement a été mis à jour.</p>}
    <section className="grid gap-3 rounded-xl border p-5 sm:grid-cols-3">
      <div><p className="text-xs uppercase text-neutral-500">Statut</p><p className="mt-1 font-semibold" style={{color:statut.couleur}}>{statut.libelle}</p></div>
      <div><p className="text-xs uppercase text-neutral-500">Offre</p><p className="mt-1 font-semibold">{entreprise?.abonnement_offre ? entreprise.abonnement_offre[0].toUpperCase()+entreprise.abonnement_offre.slice(1) : "À choisir"}{entreprise?.abonnement_periodicite ? ` · ${entreprise.abonnement_periodicite}` : ""}</p></div>
      <div><p className="text-xs uppercase text-neutral-500">Prochaine échéance</p><p className="mt-1 font-semibold">{entreprise?.abonnement_echeance ? new Date(entreprise.abonnement_echeance).toLocaleDateString("fr-FR") : entreprise?.abonnement_essai_fin ? new Date(entreprise.abonnement_essai_fin).toLocaleDateString("fr-FR") : "—"}</p></div>
      {entreprise?.abonnement_annulation_prevue_at&&<p className="sm:col-span-3 rounded bg-amber-50 p-3 text-sm text-amber-900">Résiliation programmée le {new Date(entreprise.abonnement_annulation_prevue_at).toLocaleDateString("fr-FR")}.</p>}
    </section>

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
      {entreprise?.option_ia_statut==="essai"&&<p className="mt-3 text-xs text-neutral-500">Essai offert par Liria. Passé ce délai, si vous ne désactivez pas l’option, le palier choisi ci-dessous est facturé automatiquement sur votre abonnement.</p>}
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

    {souscrit ? <section className="rounded-xl border p-5"><h2 className="font-semibold">Gérer l’abonnement</h2><p className="mt-1 text-sm text-neutral-500">Le portail sécurisé Stripe permet de changer de carte, télécharger les factures et gérer la résiliation.</p><div className="mt-4 flex flex-wrap gap-2"><form action={ouvrirPortailAbonnementAction}><button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Gérer mon abonnement</button></form>{entreprise?.derniere_facture_url&&<Link href={entreprise.derniere_facture_url} target="_blank" rel="noreferrer" className="rounded-md border px-4 py-2 text-sm font-medium">Voir la dernière facture</Link>}{entreprise?.derniere_facture_pdf&&<Link href={entreprise.derniere_facture_pdf} target="_blank" rel="noreferrer" className="rounded-md border px-4 py-2 text-sm font-medium">Télécharger le PDF</Link>}</div>{entreprise?.derniere_facture_at&&<p className="mt-3 text-xs text-neutral-500">Dernière facture : {entreprise.derniere_facture_statut??"—"} · {new Date(entreprise.derniere_facture_at).toLocaleString("fr-FR")}</p>}</section>
    : <section className="space-y-4"><div><h2 className="font-semibold">Choisir une offre</h2><p className="text-sm text-neutral-500">Carte enregistrée à l’inscription, aucun débit pendant l’essai de 30 jours, puis prélèvement automatique au montant affiché.</p></div>{!configure&&<p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">Le paiement des abonnements est en cours de configuration par Liria. Votre accès actuel reste inchangé.</p>}<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{OFFRES.map(offre=>{const prix=prixAbonnementMensuel(offre.comptesInclus,offre);return <article key={offre.cle} className="rounded-xl border p-5"><h3 className="text-lg font-semibold">{offre.nom}</h3><p className="mt-1 min-h-20 text-sm text-neutral-500">{offre.resume}</p><p className="mt-4 text-2xl font-bold">{prix.total} € <span className="text-xs font-normal text-neutral-500">HT/mois</span></p>{offre.devisObligatoire?<Link href="mailto:contact@liria-gestion-pro.fr?subject=Offre%20sur%20mesure" className="mt-4 block rounded-md border px-3 py-2 text-center text-sm font-semibold">Demander un devis</Link>:<form action={demarrerAbonnementAction} className="mt-4 space-y-3"><input type="hidden" name="offre" value={offre.cle}/><input type="hidden" name="retour_erreur" value="/abonnement"/><select name="periodicite" defaultValue="mensuel" className={`${input} w-full`}><option value="mensuel">Mensuel</option><option value="annuel">Annuel · prix affiché avant validation</option></select><button disabled={!configure} className="w-full rounded-md bg-[#0d1b2a] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Démarrer l’essai</button></form>}</article>})}</div></section>}

    <section className="rounded-xl border p-5"><h2 className="font-semibold">Factures et historique</h2><p className="mt-1 text-sm text-neutral-500">Documents Stripe et changements contractuels enregistrés pour votre entreprise.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-neutral-500"><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Référence</th><th className="py-2 pr-3">Montant TTC</th><th className="py-2 pr-3">Statut</th><th className="py-2">Document</th></tr></thead><tbody>{(facturesAbonnement??[]).map(facture=><tr key={facture.id} className="border-b"><td className="py-3 pr-3">{new Date(facture.created_at).toLocaleDateString("fr-FR")}</td><td className="py-3 pr-3">{facture.numero??"—"}</td><td className="py-3 pr-3">{Number(facture.montant_ttc).toLocaleString("fr-FR",{style:"currency",currency:String(facture.devise??"EUR")})}</td><td className="py-3 pr-3">{facture.statut}</td><td className="py-3">{facture.url_pdf?<Link href={facture.url_pdf} target="_blank" rel="noreferrer" className="underline">PDF</Link>:facture.url_facture?<Link href={facture.url_facture} target="_blank" rel="noreferrer" className="underline">Voir</Link>:"—"}</td></tr>)}</tbody></table>{!facturesAbonnement?.length?<p className="py-4 text-sm text-neutral-500">Aucune facture d’abonnement enregistrée.</p>:null}</div>{historique?.length?<details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Afficher les changements de tarif ({historique.length})</summary><ul className="mt-2 space-y-2 text-sm">{historique.map(event=><li key={event.id} className="rounded bg-neutral-50 p-2 dark:bg-neutral-900">{new Date(event.created_at).toLocaleString("fr-FR")} · {event.action}{event.motif?` — ${event.motif}`:""}</li>)}</ul></details>:null}</section>
  </div></main>;
}
