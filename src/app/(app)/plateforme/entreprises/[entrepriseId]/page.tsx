import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { Lien as Link } from "@/components/Lien";
import { chargerHabilitationsAnnuaire } from "@/lib/plateforme-annuaire-habilitations";
import { chargerFicheEntreprise, type FicheEntreprise, type Section } from "@/lib/plateforme-fiche-entreprise";
import { composerCout, finPrevueRemise, situationPaiement } from "@/lib/plateforme-annuaire";
import { statutAbonnement } from "@/lib/plateforme";
import { offreTarifaireParCle } from "@/lib/tarification";
import {
  MENTION_NON_DISPONIBLE,
  MENTION_VIDE,
  dateCourte,
  dateHeure,
  delaiRelatif,
  montantHT,
  texteOuVide,
} from "@/lib/plateforme-annuaire-format";
import {
  appliquerRemiseAction,
  enregistrerReglementPlateformeAction,
  entrerEntreprisePlateformeAction,
  modifierAbonnementAction,
  modifierTarifPostePlateformeAction,
  reinitialiserMotDePassePlateformeAction,
  retirerRemiseAction,
  signalerImpayePlateformeAction,
} from "@/app/actions/plateforme";
import { AbonnementCountdown } from "@/components/AbonnementCountdown";
import { RemiseConfirmButton } from "@/components/RemiseConfirmButton";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

export const dynamic = "force-dynamic";

const ONGLETS = [
  { cle: "apercu", libelle: "Vue d'ensemble" },
  { cle: "abonnement", libelle: "Abonnement et tarification" },
  { cle: "remises", libelle: "Remises" },
  { cle: "applications", libelle: "Applications et modules" },
  { cle: "utilisateurs", libelle: "Utilisateurs et comptes" },
  { cle: "facturation", libelle: "Facturation et paiements" },
  { cle: "assistance", libelle: "Assistance" },
  { cle: "communications", libelle: "Communications" },
  { cle: "historique", libelle: "Historique" },
] as const;

type CleOnglet = (typeof ONGLETS)[number]["cle"];

const champ = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export default async function FicheEntreprisePage({
  params,
  searchParams,
}: {
  params: Promise<{ entrepriseId: string }>;
  searchParams: Promise<{ onglet?: string; retour?: string }>;
}) {
  const habilitations = await chargerHabilitationsAnnuaire();
  if (!habilitations.peutConsulter) notFound();

  const { entrepriseId } = await params;
  const { onglet: ongletBrut, retour } = await searchParams;
  const onglet: CleOnglet = ONGLETS.some((o) => o.cle === ongletBrut) ? (ongletBrut as CleOnglet) : "apercu";

  const fiche = await chargerFicheEntreprise(entrepriseId);
  if (!fiche) notFound();

  const maintenant = new Date();
  const cout = composerCout(fiche.ligne);
  const paiement = situationPaiement(fiche.ligne, maintenant);
  // Le retour ramène à la page, au tri et aux filtres d'où l'on vient (§8).
  const lienRetour = retour ? `/plateforme/entreprises?${retour}` : "/plateforme/entreprises";

  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href={lienRetour} className="text-sm text-neutral-500 hover:underline">
              ← Retour à l&apos;annuaire
            </Link>
            <h1 className="mt-1 text-xl font-semibold">{fiche.ligne.nom}</h1>
            <p className="text-sm text-neutral-500">
              {texteOuVide(fiche.ligne.raison_sociale)}
              {fiche.ligne.siret && <> · SIRET <span className="font-mono">{fiche.ligne.siret}</span></>}
              {fiche.ligne.ville && <> · {fiche.ligne.ville}</>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/plateforme/entreprises/${entrepriseId}/applications`}
              className="rounded-md border border-[#c9a24a] px-3 py-2 text-sm font-semibold text-[#8a6a1f]"
            >
              Gérer les applications
            </Link>
          </div>
        </div>

        <nav aria-label="Sections de la fiche" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex min-w-max gap-1 border-b border-neutral-200 dark:border-neutral-800">
            {ONGLETS.map((item) => {
              const masque = !habilitations.peutVoirFacturation &&
                (item.cle === "abonnement" || item.cle === "remises" || item.cle === "facturation");
              if (masque) return null;
              const actif = item.cle === onglet;
              return (
                <li key={item.cle}>
                  <Link
                    href={`/plateforme/entreprises/${entrepriseId}?onglet=${item.cle}${retour ? `&retour=${encodeURIComponent(retour)}` : ""}`}
                    aria-current={actif ? "page" : undefined}
                    className={`inline-block whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                      actif ? "border-neutral-900 font-semibold dark:border-white" : "border-transparent text-neutral-600 dark:text-neutral-400"
                    }`}
                  >
                    {item.libelle}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {onglet === "apercu" && (
          <section className="space-y-4">
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Donnee libelle="Statut d'abonnement" valeur={statutAbonnement(fiche.ligne.abonnement_statut).libelle} />
              <Donnee libelle="Situation de paiement" valeur={`${paiement.icone} ${paiement.libelle}`} />
              <Donnee libelle="Inscription" valeur={dateCourte(fiche.ligne.created_at)} />
              <Donnee libelle="Dernière activité" valeur={dateCourte(fiche.ligne.derniere_activite)} />
              <Donnee libelle="Contact principal" valeur={texteOuVide(fiche.ligne.proprietaire_nom)} />
              <Donnee libelle="E-mail principal" valeur={texteOuVide(fiche.ligne.proprietaire_email)} />
              <Donnee libelle="Référence client" valeur={texteOuVide(fiche.ligne.reference_interne ?? fiche.ligne.code_adhesion)} />
              <Donnee libelle="Comptes actifs" valeur={String(fiche.ligne.nb_comptes_actifs)} />
              {habilitations.peutVoirFacturation && (
                <>
                  <Donnee libelle="Forfait" valeur={fiche.ligne.abonnement_offre ? offreTarifaireParCle(fiche.ligne.abonnement_offre).nom : MENTION_VIDE} />
                  <Donnee libelle="Prix souscrit HT" valeur={montantHT(cout.totalRecurrentHT)} />
                  <Donnee libelle="Prochaine échéance" valeur={dateCourte(fiche.ligne.abonnement_echeance)} />
                  <Donnee libelle="Impayé HT" valeur={montantHT(cout.impayeHT)} />
                </>
              )}
            </dl>

            {fiche.ligne.suspension_prevue_at && (
              <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                <strong>Impayé signalé.</strong> Suspension programmée le {dateHeure(fiche.ligne.suspension_prevue_at)}
                {" "}({delaiRelatif(fiche.ligne.suspension_prevue_at, maintenant)}).
              </p>
            )}

            <SectionApplicationsResumee fiche={fiche} />
          </section>
        )}

        {onglet === "abonnement" && habilitations.peutVoirFacturation && (
          <section className="space-y-4">
            <Bloc titre="Ce que recouvre chaque montant">
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Donnee libelle="Abonnement HT — tarif public" valeur={montantHT(cout.tarifPublicHT)} note="Tarif catalogue du forfait, pour la périodicité souscrite." />
                <Donnee libelle="Prix souscrit HT" valeur={montantHT(cout.prixSouscritHT)} note="Prix réellement contractualisé, avant remise." />
                <Donnee libelle="Total HT récurrent" valeur={montantHT(cout.totalRecurrentHT)} note="Prix souscrit après remise déclarée." />
                <Donnee libelle="Périodicité" valeur={cout.periodicite === "annuel" ? "Annuelle" : cout.periodicite === "mensuel" ? "Mensuelle" : MENTION_NON_DISPONIBLE} />
                <Donnee libelle="Revenu mensuel équivalent HT" valeur={montantHT(cout.revenuMensuelEquivalentHT)} note="Total récurrent ramené au mois." />
                <Donnee libelle="Prochaine facture HT" valeur={montantHT(cout.prochaineFactureHT)} note="Non répliquée en base : elle est calculée par Stripe à l'émission." />
              </dl>
              {cout.indisponible.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-neutral-500">
                  {cout.indisponible.map((raison) => (
                    <li key={raison}>· {raison}</li>
                  ))}
                </ul>
              )}
            </Bloc>

            <SectionOuRaison titre="Abonnement contractuel" section={fiche.abonnement}>
              {(abonnement) => (
                <>
                  <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Donnee libelle="Code offre" valeur={texteOuVide(abonnement.code_offre)} />
                    <Donnee libelle="Statut" valeur={texteOuVide(abonnement.statut)} />
                    <Donnee libelle="Période en cours" valeur={`${dateCourte(abonnement.debut_periode)} → ${dateCourte(abonnement.fin_periode)}`} />
                  </dl>
                  <h4 className="mt-4 text-sm font-semibold">Options souscrites</h4>
                  {abonnement.options.length === 0 ? (
                    <p className="text-sm text-neutral-500">Aucune option souscrite.</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm">
                      {abonnement.options.map((option) => (
                        <li key={`${option.option_id}-${option.debut_at}`} className="flex justify-between gap-3">
                          <span>{option.option_id} × {option.quantite}</span>
                          <span className="tabular-nums">{montantHT(option.prix_unitaire_contractuel_ht)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </SectionOuRaison>

            <Bloc titre="Statut, échéance et note d'abonnement">
              <form action={modifierAbonnementAction.bind(null, entrepriseId)} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-1 text-xs text-neutral-500">
                  <span className="block">Statut</span>
                  <select name="statut" defaultValue={fiche.ligne.abonnement_statut} className={`${champ} w-full`}>
                    <option value="essai">Essai</option>
                    <option value="actif">Actif</option>
                    <option value="suspendu">Suspendu</option>
                    <option value="annule">Annulé</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs text-neutral-500">
                  <span className="block">Échéance</span>
                  <input type="date" name="echeance" defaultValue={fiche.ligne.abonnement_echeance ?? ""} className={`${champ} w-full`} />
                </label>
                <label className="space-y-1 text-xs text-neutral-500 sm:col-span-2">
                  <span className="block">Note interne</span>
                  <input name="note" defaultValue="" placeholder="tarif négocié, contact, contexte…" className={`${champ} w-full`} />
                </label>
                <div className="sm:col-span-2 lg:col-span-4">
                  <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-neutral-900">
                    Enregistrer
                  </button>
                  <p className="mt-2 text-xs text-neutral-500">
                    Une suspension décidée ici doit reposer sur une règle contractuelle : elle coupe l&apos;accès des
                    salariés de l&apos;entreprise. L&apos;action est journalisée.
                  </p>
                </div>
              </form>
            </Bloc>

            <SectionOuRaison titre="Tarifs par poste" section={fiche.tarifsPostes}>
              {(tarifs) =>
                tarifs.length === 0 ? (
                  <p className="text-sm text-neutral-500">Aucun poste tarifé.</p>
                ) : (
                  <div className="space-y-3">
                    {tarifs.map((poste) => (
                      <form
                        key={poste.poste_id}
                        action={modifierTarifPostePlateformeAction.bind(null, poste.poste_id)}
                        className="grid items-end gap-2 text-sm sm:grid-cols-[1fr_130px_150px_auto]"
                      >
                        <div>
                          <strong>{poste.nom}</strong>
                          <p className="text-xs text-neutral-500">{poste.nb_comptes_facturables} compte(s) facturable(s)</p>
                        </div>
                        <label className="text-xs text-neutral-500">
                          Offre
                          <input name="code_offre" defaultValue={poste.code_offre} className={`${champ} mt-1 w-full`} />
                        </label>
                        <label className="text-xs text-neutral-500">
                          € HT / compte / mois
                          <input name="tarif" type="number" min="0" step="0.01" defaultValue={poste.tarif_compte_mensuel} className={`${champ} mt-1 w-full`} />
                        </label>
                        <button className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">Enregistrer</button>
                      </form>
                    ))}
                  </div>
                )
              }
            </SectionOuRaison>
          </section>
        )}

        {onglet === "remises" && habilitations.peutVoirFacturation && (
          <section className="space-y-4">
            <Bloc titre="Remise en cours">
              {cout.remise ? (
                <>
                  <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Donnee libelle="Type" valeur={cout.remise.type} />
                    <Donnee libelle="Valeur" valeur={cout.remise.type === "pourcentage" ? `${cout.remise.valeur} %` : montantHT(cout.remise.valeur)} />
                    <Donnee libelle="Description" valeur={texteOuVide(cout.remise.description)} />
                    <Donnee libelle="Début" valeur={dateCourte(cout.remise.debut)} />
                    <Donnee libelle="Fin prévue" valeur={cout.remise.permanente ? "Permanente" : dateCourte(finPrevueRemise(fiche.ligne))} />
                    <Donnee libelle="Périmètre" valeur="Totalité de la facture d'abonnement" note="Le coupon Stripe s'applique au prorata sur l'ensemble de la facture." />
                  </dl>
                  <p className="mt-3 text-xs text-neutral-500">
                    Le motif interne est conservé en base et n&apos;est jamais montré au client. Cette remise ne modifie
                    pas le prix public affiché sur le site.
                  </p>
                  {habilitations.peutGererRemises ? (
                    <form action={retirerRemiseAction.bind(null, entrepriseId)} className="mt-3">
                      <input type="hidden" name="intention_id" value={randomUUID()} />
                      <ConfirmSubmitButton
                        className="rounded border border-red-200 px-3 py-2 text-xs text-red-700 hover:bg-red-50"
                        message={`Retirer la remise « ${cout.remise.description ?? "en cours"} » de ${fiche.ligne.nom} ? L'entreprise repassera au prix souscrit de ${montantHT(cout.prixSouscritHT)} HT.`}
                      >
                        Révoquer la remise
                      </ConfirmSubmitButton>
                    </form>
                  ) : (
                    <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">{raisonRemiseFermee(habilitations)}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-neutral-500">Aucune remise active.</p>
              )}
            </Bloc>

            {!cout.remise && (
              <Bloc titre="Appliquer une remise">
                {habilitations.peutGererRemises ? (
                  <form action={appliquerRemiseAction.bind(null, entrepriseId)} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <input type="hidden" name="intention_id" value={randomUUID()} />
                    <label className="space-y-1 text-xs text-neutral-500">
                      <span className="block">Type</span>
                      <select name="type" defaultValue="pourcentage" className={`${champ} w-full`}>
                        <option value="pourcentage">Pourcentage</option>
                        <option value="montant">Montant (€ HT)</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-xs text-neutral-500">
                      <span className="block">Valeur</span>
                      <input name="valeur" type="number" min="0" step="0.01" required className={`${champ} w-full`} />
                    </label>
                    <label className="space-y-1 text-xs text-neutral-500">
                      <span className="block">Durée</span>
                      <select name="duree" defaultValue="repeating" className={`${champ} w-full`}>
                        <option value="once">Une seule échéance</option>
                        <option value="repeating">Pendant N mois</option>
                        <option value="forever">Permanente</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-xs text-neutral-500">
                      <span className="block">Nombre de mois</span>
                      <input name="duree_mois" type="number" min="1" placeholder="ex. 2" className={`${champ} w-full`} />
                    </label>
                    <label className="space-y-1 text-xs text-neutral-500 sm:col-span-2 lg:col-span-4">
                      <span className="block">Motif interne (obligatoire, jamais montré au client)</span>
                      <input name="motif_interne" required minLength={5} placeholder="Ex. client pilote, geste commercial, contrat négocié…" className={`${champ} w-full`} />
                    </label>
                    <div className="sm:col-span-2 lg:col-span-4">
                      <RemiseConfirmButton
                        entrepriseNom={fiche.ligne.nom}
                        prixCatalogueMensuel={cout.prixSouscritHT ?? cout.tarifPublicHT ?? 0}
                        className="rounded border px-3 py-2 text-sm font-semibold"
                      />
                      <p className="mt-2 text-xs text-neutral-500">
                        L&apos;aperçu du prochain prélèvement est affiché à la confirmation. L&apos;opération est
                        journalisée avec son auteur et son motif, et exécutée par le moteur de remise canonique
                        (opérations `plateforme_operations_remise` + coupon Stripe) : cet écran n&apos;en recalcule rien.
                      </p>
                    </div>
                  </form>
                ) : (
                  <p className="text-sm text-amber-700 dark:text-amber-300">{raisonRemiseFermee(habilitations)}</p>
                )}
              </Bloc>
            )}
          </section>
        )}

        {onglet === "applications" && (
          <section className="space-y-4">
            <SectionOuRaison titre="Applications ELSATIA" section={fiche.applications}>
              {(applications) =>
                applications.length === 0 ? (
                  <p className="text-sm text-neutral-500">Aucune application ouverte à cette entreprise.</p>
                ) : (
                  <ul className="divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
                    {applications.map((application) => (
                      <li key={application.application_code} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span>
                          <strong>{application.nom}</strong>
                          <span className="ml-2 text-xs text-neutral-500">{application.statut_produit}</span>
                        </span>
                        <span className="text-xs text-neutral-500">
                          {application.autorise ? "Autorisée" : "Refusée"}
                          {application.valide_jusqu_au && ` · jusqu'au ${dateCourte(application.valide_jusqu_au)}`}
                          {application.source && ` · ${application.source}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )
              }
            </SectionOuRaison>

            <SectionOuRaison titre="Modules Gestion Pro actifs" section={fiche.modules}>
              {(modules) =>
                modules.length === 0 ? (
                  <p className="text-sm text-neutral-500">Aucun module optionnel actif.</p>
                ) : (
                  <ul className="divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
                    {modules.map((module) => (
                      <li key={module.module_code} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span className="font-mono text-xs">{module.module_code}</span>
                        <span className="text-xs text-neutral-500">
                          origine {module.origine}
                          {module.valide_jusqu && ` · expire le ${dateCourte(module.valide_jusqu)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )
              }
            </SectionOuRaison>
          </section>
        )}

        {onglet === "utilisateurs" && (
          <SectionOuRaison titre="Postes, comptes et habilitations" section={fiche.postes}>
            {(postes) => (
              <>
                <dl className="mb-4 grid gap-3 sm:grid-cols-3">
                  <Donnee libelle="Salariés enregistrés" valeur={String(fiche.ligne.nb_salaries)} />
                  <Donnee libelle="Comptes actifs" valeur={String(fiche.ligne.nb_comptes_actifs)} />
                  <Donnee
                    libelle="Comptes inclus au forfait"
                    valeur={fiche.ligne.abonnement_offre ? String(offreTarifaireParCle(fiche.ligne.abonnement_offre).comptesInclus) : MENTION_NON_DISPONIBLE}
                  />
                </dl>
                {postes.length === 0 ? (
                  <p className="text-sm text-neutral-500">Aucun poste défini.</p>
                ) : (
                  <ul className="divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
                    {postes.map((poste) => (
                      <li key={poste.poste_id} className="py-2">
                        <div className="flex items-center justify-between gap-3">
                          <strong>{poste.poste_nom}</strong>
                          <span className="text-xs text-neutral-500">{poste.nb_employes} employé(s)</span>
                        </div>
                        <p className="mt-1 text-xs text-neutral-500">{poste.permissions.length} permission(s)</p>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </SectionOuRaison>
        )}

        {onglet === "facturation" && habilitations.peutVoirFacturation && (
          <SectionOuRaison titre="Factures d'abonnement" section={fiche.factures}>
            {(factures) =>
              factures.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  Aucune facture d&apos;abonnement enregistrée. Ce n&apos;est pas une preuve d&apos;absence
                  d&apos;impayé : seules les factures répliquées depuis Stripe apparaissent ici.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-neutral-500">
                      <tr>
                        <th scope="col" className="py-2 pr-4 font-medium">Numéro</th>
                        <th scope="col" className="py-2 pr-4 font-medium">Période</th>
                        <th scope="col" className="py-2 pr-4 text-right font-medium">HT</th>
                        <th scope="col" className="py-2 pr-4 font-medium">Statut</th>
                        <th scope="col" className="py-2 font-medium">Réglée le</th>
                      </tr>
                    </thead>
                    <tbody>
                      {factures.map((facture) => (
                        <tr key={facture.id} className="border-t border-neutral-100 dark:border-neutral-800">
                          <td className="py-2 pr-4 font-mono text-xs">{texteOuVide(facture.numero)}</td>
                          <td className="py-2 pr-4">{dateCourte(facture.periode_debut)} → {dateCourte(facture.periode_fin)}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{montantHT(facture.montant_ht)}</td>
                          <td className="py-2 pr-4">{facture.statut}</td>
                          <td className="py-2">{dateCourte(facture.payee_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </SectionOuRaison>
        )}

        {onglet === "facturation" && habilitations.peutVoirFacturation && (
          <Bloc titre="Retard et impayé">
            {fiche.ligne.suspension_prevue_at ? (
              <div className="space-y-3">
                <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                  <strong>
                    Règlement non reçu — suspension automatique dans{" "}
                    <AbonnementCountdown echeance={fiche.ligne.suspension_prevue_at} />
                  </strong>
                  <span className="mt-1 block text-xs">Échéance : {dateHeure(fiche.ligne.suspension_prevue_at)}</span>
                </p>
                <form action={enregistrerReglementPlateformeAction.bind(null, entrepriseId)} className="flex flex-wrap items-end gap-2">
                  <label className="min-w-[240px] flex-1 text-xs text-neutral-500">
                    Référence du règlement
                    <input name="note" required className={`${champ} mt-1 w-full`} />
                  </label>
                  <button className="rounded-md bg-green-700 px-3 py-2 text-sm font-semibold text-white">
                    Règlement reçu
                  </button>
                </form>
              </div>
            ) : (
              <form action={signalerImpayePlateformeAction.bind(null, entrepriseId)} className="flex flex-wrap items-end gap-2">
                <label className="min-w-[240px] flex-1 text-xs text-neutral-500">
                  Message destiné à l&apos;administrateur de l&apos;entreprise
                  <input name="message" defaultValue="Règlement mensuel non reçu" className={`${champ} mt-1 w-full`} />
                </label>
                <button className="rounded-md border border-amber-700 px-3 py-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Signaler l&apos;impayé · délai 10 jours
                </button>
                <p className="w-full text-xs text-neutral-500">
                  Le signalement déclenche une suspension programmée. Il engage la relation client : il ne doit être
                  posé qu&apos;après vérification de l&apos;état réel du règlement, jamais sur la foi d&apos;un
                  « Paiement inconnu ».
                </p>
              </form>
            )}
          </Bloc>
        )}

        {onglet === "assistance" && (
          <SectionOuRaison titre="Sessions d'assistance" section={fiche.assistance}>
            {(sessions) => (
              <>
                <p className="mb-3 text-sm text-neutral-500">
                  L&apos;entrée dans l&apos;espace client se fait depuis le tableau de bord plateforme, avec motif
                  obligatoire. Entrée et sortie sont journalisées ; le compte plateforme n&apos;est pas ajouté aux
                  salariés facturables.
                </p>
                {sessions.length === 0 ? (
                  <p className="text-sm text-neutral-500">Aucune session d&apos;assistance enregistrée.</p>
                ) : (
                  <ul className="divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
                    {sessions.map((session) => (
                      <li key={session.id} className="flex flex-wrap justify-between gap-2 py-2">
                        <span>{texteOuVide(session.motif)}</span>
                        <span className="text-xs text-neutral-500">{dateHeure(session.date)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </SectionOuRaison>
        )}

        {onglet === "assistance" && habilitations.peutIntervenirTenant && (
          <>
            <Bloc titre="Accéder à l'espace client">
              <form action={entrerEntreprisePlateformeAction.bind(null, entrepriseId)} className="flex flex-wrap items-end gap-2">
                <label className="min-w-[260px] flex-1 text-xs text-neutral-500">
                  Motif obligatoire de l&apos;intervention
                  <input name="motif" required minLength={5} placeholder="Ex. assistance au paramétrage demandée par le client" className={`${champ} mt-1 w-full`} />
                </label>
                <button className="rounded-md bg-blue-900 px-3 py-2 text-sm font-semibold text-white">
                  Accéder comme administrateur
                </button>
                <p className="w-full text-xs text-neutral-500">
                  L&apos;entrée et la sortie sont journalisées. Ce compte plateforme n&apos;est pas ajouté aux
                  salariés facturables.
                </p>
              </form>
            </Bloc>

            <Bloc titre="Réinitialiser le mot de passe d'un salarié">
              <form action={reinitialiserMotDePassePlateformeAction.bind(null, entrepriseId)} className="flex flex-wrap items-end gap-2">
                <label className="min-w-[220px] flex-1 text-xs text-neutral-500">
                  E-mail du salarié
                  <input name="email" type="email" required className={`${champ} mt-1 w-full`} />
                </label>
                <label className="min-w-[240px] flex-1 text-xs text-neutral-500">
                  Motif obligatoire
                  <input name="motif" required minLength={5} placeholder="Ex. salarié n'a plus accès à sa boîte mail" className={`${champ} mt-1 w-full`} />
                </label>
                <button className="rounded-md border border-neutral-400 px-3 py-2 text-sm font-semibold dark:border-neutral-600">
                  Envoyer un lien de réinitialisation
                </button>
              </form>
            </Bloc>
          </>
        )}

        {onglet === "communications" && (
          <Bloc titre="Communications">
            <p className="text-sm text-neutral-500">
              La seule voie sortante disponible aujourd&apos;hui est le fil de support, accessible depuis{" "}
              <Link href="/plateforme/support" className="underline">l&apos;espace Support</Link>.
            </p>
            <ul className="mt-3 space-y-2">
              {fiche.sectionsNonModelisees.map((section) => (
                <li key={section.titre} className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  <strong>{section.titre} — non disponible.</strong> {section.raison}
                </li>
              ))}
            </ul>
          </Bloc>
        )}

        {onglet === "historique" && (
          <SectionOuRaison titre="Historique des actions plateforme" section={fiche.historique}>
            {(evenements) =>
              evenements.length === 0 ? (
                <p className="text-sm text-neutral-500">Aucune action journalisée sur cette entreprise.</p>
              ) : (
                <ul className="divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
                  {evenements.map((evenement) => (
                    <li key={evenement.id} className="py-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <strong>{evenement.action}</strong>
                        <span className="text-xs text-neutral-500">{dateHeure(evenement.quand)}</span>
                      </div>
                      <p className="text-xs text-neutral-500">
                        {texteOuVide(evenement.acteur)}
                        {evenement.details && evenement.details !== "{}" && ` · ${evenement.details}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )
            }
          </SectionOuRaison>
        )}
      </div>
    </main>
  );
}

function raisonRemiseFermee(habilitations: Awaited<ReturnType<typeof chargerHabilitationsAnnuaire>>): string {
  if (habilitations.modeDemonstration) {
    return "Mode démonstration : les remises engagent un montant réel et sont fermées hors session authentifiée.";
  }
  if (!habilitations.sessionForte) {
    return "Une remise exige une session en authentification forte (AAL2). Réauthentifiez-vous avec votre second facteur, puis rechargez cette page.";
  }
  return "Votre rôle plateforme ne permet pas d'accorder de remise. Cette commande est réservée aux rôles « Accès total » et « Facturation ».";
}

function Donnee({ libelle, valeur, note }: { libelle: string; valeur: string; note?: string }) {
  return (
    <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <dt className="text-xs uppercase text-neutral-500">{libelle}</dt>
      <dd className="mt-1 font-medium">{valeur}</dd>
      {note && <p className="mt-1 text-[11px] text-neutral-500">{note}</p>}
    </div>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="mb-3 font-semibold">{titre}</h2>
      {children}
    </section>
  );
}

/**
 * Affiche une section, ou la raison précise de son absence. Ne jamais rendre
 * une section vide quand la lecture a échoué : « rien » et « illisible » se
 * lisent autrement.
 */
function SectionOuRaison<T>({
  titre,
  section,
  children,
}: {
  titre: string;
  section: Section<T>;
  children: (donnees: T) => React.ReactNode;
}) {
  return (
    <Bloc titre={titre}>
      {section.disponible ? (
        children(section.donnees)
      ) : (
        <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>{MENTION_NON_DISPONIBLE}.</strong> {section.raison}
        </p>
      )}
    </Bloc>
  );
}

function SectionApplicationsResumee({ fiche }: { fiche: FicheEntreprise }) {
  if (!fiche.applications.disponible) return null;
  const autorisees = fiche.applications.donnees.filter((application) => application.autorise);
  return (
    <Bloc titre="Applications actives">
      {autorisees.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucune application autorisée.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {autorisees.map((application) => (
            <li key={application.application_code} className="rounded-full bg-neutral-100 px-3 py-1 text-xs dark:bg-neutral-800">
              {application.nom}
            </li>
          ))}
        </ul>
      )}
    </Bloc>
  );
}
