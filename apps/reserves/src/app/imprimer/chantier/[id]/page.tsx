import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigerShellReserves } from "@/lib/acces-reserves";
import {
  BUCKET_PHOTOS, BUCKET_PLANS, lireEnteteExport, lireHistoriqueExport, lireLignesExport,
  lirePhotosExport, listerIntervenantsExport, listerPlansComplets, signerFichiers,
  type LigneExport,
} from "@/lib/donnees";
import { LIBELLES_PRIORITE, LIBELLES_STATUT, estEnRetard } from "@/lib/workflow";
import {
  appliquerVue, decrireSelection, filtresBase, lireOptionsExport, LIBELLES_VUE,
} from "@/lib/export/options";

export const metadata: Metadata = {
  title: "Document Réserves",
  robots: { index: false, follow: false },
};

/** Nombre de photos imprimées par réserve. Au-delà, le document devient inutilisable
 *  sur papier et le fichier grossit sans rien apprendre : les clichés restants sont
 *  annoncés en toutes lettres plutôt que silencieusement omis. */
const PHOTOS_PAR_RESERVE = 4;

const LIBELLES_ACTION: Record<string, string> = {
  creation: "Création", assignation: "Attribution", reassignation: "Transfert",
  acceptation: "Responsabilité acceptée", refus_responsabilite: "Responsabilité refusée",
  commentaire: "Message", photo_ajoutee: "Photo ajoutée", demande_levee: "Levée demandée",
  levee_validee: "Levée validée", levee_refusee: "Levée refusée", reouverture: "Réouverture",
  annulation: "Annulation", modification: "Modification",
};

/** Actions qui expliquent l'ISSUE d'une réserve : ce sont elles qu'on lit en réunion. */
const ACTIONS_DECISIVES = new Set([
  "levee_validee", "levee_refusee", "refus_responsabilite", "reouverture", "annulation",
]);

function dateCourte(valeur: string | null) {
  return valeur ? new Date(valeur).toLocaleDateString("fr-FR") : "—";
}

/** Localisation courte, telle qu'on la lit sur un chantier : niveau, zone, page. */
function zoneDe(l: LigneExport): string {
  const morceaux = [l.plan_niveau, l.plan_zone].filter(Boolean) as string[];
  if (morceaux.length === 0 && l.plan) morceaux.push(l.plan);
  if (l.plan_page !== null) morceaux.push(`p.${l.plan_page}`);
  return morceaux.join(" / ") || "—";
}

/**
 * Document imprimable d'un chantier — c'est LE rendu du PDF.
 *
 * La page est rendue par le pipeline normal de Next.js, sous la session de l'appelant :
 * les mêmes RPC, les mêmes RLS, les mêmes filtres qu'à l'écran. Chromium ne fait ensuite
 * que l'imprimer (voir `/api/documents/chantier/[id]/pdf`). Conséquence directe : il
 * n'existe aucun chemin par lequel le PDF exposerait une donnée que l'écran refuserait,
 * et l'« export par entreprise » est réellement un export restreint — les autres réserves
 * ne sont même pas chargées.
 *
 * Deux formats, parce qu'un chantier a deux usages du papier :
 *   — SYNTHÉTIQUE : une ligne par réserve, pour pointer une liste en réunion ;
 *   — DÉTAILLÉE   : une fiche par réserve, pour la traiter sur le terrain.
 */
export default async function PageImprimerChantier({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const contexte = await exigerShellReserves();
  const options = lireOptionsExport(query);
  const detaille = options.format === "detaillee";

  const entete = await lireEnteteExport(id);
  if (!entete) notFound();

  const [brutes, intervenants] = await Promise.all([
    lireLignesExport(id, filtresBase(options)),
    listerIntervenantsExport(id),
  ]);
  // Restriction métier appliquée APRÈS la base : elle ne peut que retirer des lignes.
  const lignes = appliquerVue(brutes, options.vue);
  const retenues = new Set(lignes.map((l) => l.id));

  // Rien de coûteux n'est chargé pour un document qui ne l'imprimera pas.
  const [historique, photos, plans] = await Promise.all([
    detaille && options.historique ? lireHistoriqueExport(id, options.intervenantId) : [],
    detaille && options.photos ? lirePhotosExport(id, options.intervenantId) : [],
    detaille && options.plans ? listerPlansComplets(id) : [],
  ]);

  const photosRetenues = photos.filter((p) => retenues.has(p.reserve_id));
  const liensPhotos = await signerFichiers(
    BUCKET_PHOTOS, photosRetenues.map((p) => p.storage_path),
  );
  // Seuls les plans IMAGE ont une miniature : un PDF de plan ne se rasterise pas ici, et
  // prétendre le contraire donnerait un cadre vide au milieu de la fiche.
  const plansImage = plans.filter(
    (p) => p.storage_path && p.mime_type?.startsWith("image/"),
  );
  const liensPlans = await signerFichiers(
    BUCKET_PLANS, plansImage.map((p) => p.storage_path as string),
  );
  const planParNom = new Map(plansImage.map((p) => [p.nom, p]));

  const entreprise = options.intervenantId
    ? intervenants.find((i) => i.intervenant_id === options.intervenantId)?.nom ?? "Entreprise"
    : null;

  const edite = new Date();
  const filtres = decrireSelection(options, entreprise);
  const enRetardImprimees = lignes.filter((l) => estEnRetard(l)).length;

  const photosParReserve = new Map<string, typeof photosRetenues>();
  for (const photo of photosRetenues) {
    const liste = photosParReserve.get(photo.reserve_id) ?? [];
    liste.push(photo);
    photosParReserve.set(photo.reserve_id, liste);
  }
  const historiqueParReserve = new Map<string, typeof historique>();
  for (const ligne of historique) {
    if (!retenues.has(ligne.reserve_id)) continue;
    const liste = historiqueParReserve.get(ligne.reserve_id) ?? [];
    liste.push(ligne);
    historiqueParReserve.set(ligne.reserve_id, liste);
  }

  return (
    <>
      {/* L'orientation est portée par le document lui-même : l'impression navigateur
          (Ctrl+P) obtient donc le même format que le PDF serveur. */}
      <style>{`@page { size: A4 ${options.orientation === "paysage" ? "landscape" : "portrait"}; margin: 12mm 10mm; }`}</style>

      <div className="entete">
        <div>
          <h1>{entreprise ? `Réserves — ${entreprise}` : "Liste des réserves"}</h1>
          <p style={{ margin: "2px 0 0" }}>
            <strong>{entete.chantier}</strong>
            {entete.reference ? ` · ${entete.reference}` : ""}
          </p>
          <p style={{ margin: 0, color: "#444" }}>
            {[entete.adresse, [entete.code_postal, entete.ville].filter(Boolean).join(" ")]
              .filter(Boolean).join(", ") || "Adresse non renseignée"}
          </p>
        </div>
        {/* Horodatage complet, exigé sur tout export : qui édite, pour quelle
            organisation, à quel instant. */}
        <div className="entete-droite">
          <div><strong>{entete.organisation}</strong></div>
          {entete.organisation_siret && <div>SIRET {entete.organisation_siret}</div>}
          <div>Édité le {edite.toLocaleDateString("fr-FR")} à {edite.toLocaleTimeString("fr-FR")}</div>
          <div>Par {contexte.prenom ?? contexte.email ?? "un utilisateur ELSATIA"}</div>
          <div>ELSATIA Réserves</div>
        </div>
      </div>

      {/* Les compteurs du CHANTIER, invariants, puis ce que ce tirage-ci contient : sans
          cette distinction, une liste filtrée se lit comme l'état du chantier entier. */}
      <div className="synthese">
        <span><b>{entete.total}</b>au chantier</span>
        <span><b>{entete.ouvertes}</b>ouverte{entete.ouvertes > 1 ? "s" : ""}</span>
        <span><b>{entete.levees}</b>levée{entete.levees > 1 ? "s" : ""}</span>
        <span><b>{entete.en_retard}</b>en retard</span>
        <span className="synthese-tirage">
          <b>{lignes.length}</b>dans ce document
          {enRetardImprimees > 0 ? `, dont ${enRetardImprimees} en retard` : ""}
        </span>
      </div>

      <p className="selection">
        {LIBELLES_VUE[options.vue]} · format {detaille ? "détaillé" : "synthétique"}
        {filtres.length > 0 ? ` · Sélection : ${filtres.join(" · ")}` : ""}
      </p>

      {!options.intervenantId && intervenants.length > 0 && (
        <>
          <h2>Entreprises intervenantes</h2>
          <table>
            <thead>
              <tr><th>Entreprise</th><th>Corps d’état</th><th>État</th><th>Réserves</th><th>Ouvertes</th><th>Levées</th></tr>
            </thead>
            <tbody>
              {intervenants.map((i) => (
                <tr key={i.intervenant_id}>
                  <td>{i.nom}</td>
                  <td>{i.corps_etat ?? "—"}</td>
                  <td>{i.statut === "active" ? "A rejoint" : i.statut === "revoquee" ? "Révoquée" : "Invitée"}</td>
                  <td>{i.total}</td><td>{i.ouvertes}</td><td>{i.levees}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2>Réserves</h2>
      {lignes.length === 0 ? (
        <p className="vide">Aucune réserve ne correspond à cette sélection.</p>
      ) : detaille ? (
        lignes.map((l) => {
          const photosReserve = photosParReserve.get(l.id) ?? [];
          const imprimees = photosReserve.slice(0, PHOTOS_PAR_RESERVE);
          const restantes = photosReserve.length - imprimees.length;
          const historiqueReserve = historiqueParReserve.get(l.id) ?? [];
          // On ne réimprime pas la chronologie complète : les dates clés sont déjà en
          // tête de fiche. Ce qui manque au lecteur, ce sont les DÉCISIONS et leur motif.
          const decisives = historiqueReserve.filter(
            (h) => ACTIONS_DECISIVES.has(h.action) || (h.commentaire ?? "") !== "",
          );
          const plan = l.plan ? planParNom.get(l.plan) : undefined;
          const lienPlan = plan?.storage_path ? liensPlans.get(plan.storage_path) : undefined;
          const repere = l.position_x !== null && l.position_y !== null;
          return (
            <div key={l.id} className="fiche">
              <div className="fiche-tete">
                <span className="fiche-num">n°{l.numero}</span>
                <span><strong>{l.titre}</strong></span>
                {estEnRetard(l) && <span className="marque-retard">EN RETARD</span>}
              </div>
              {l.description && <p style={{ margin: "4px 0 0" }}>{l.description}</p>}
              <p className="fiche-meta">
                {LIBELLES_STATUT[l.statut]} · {LIBELLES_PRIORITE[l.priorite]} ·{" "}
                {l.intervenant ?? "Non attribuée"}
                {l.intervenant_corps_etat ? ` (${l.intervenant_corps_etat})` : ""}
                {l.echeance ? ` · Échéance ${dateCourte(l.echeance)}` : ""}
                {l.photo_obligatoire_levee ? " · Photo exigée à la levée" : ""}
              </p>
              <p className="fiche-meta">
                Localisation :{" "}
                {l.plan
                  ? `${l.plan}${l.plan_niveau ? ` — ${l.plan_niveau}` : ""}`
                    + `${l.plan_zone ? ` / ${l.plan_zone}` : ""}`
                    + `${l.plan_page !== null ? `, page ${l.plan_page}` : ""}`
                    + `${repere
                        ? ` (repère ${Number(l.position_x).toFixed(3)} ; ${Number(l.position_y).toFixed(3)})`
                        : ""}`
                  : "non repérée sur plan"}
              </p>
              <p className="fiche-meta">
                Constatée le {dateCourte(l.created_at)}
                {l.assignee_at ? ` · Attribuée le ${dateCourte(l.assignee_at)}` : ""}
                {l.acceptee_at ? ` · Acceptée le ${dateCourte(l.acceptee_at)}` : ""}
                {l.levee_demandee_at ? ` · Levée demandée le ${dateCourte(l.levee_demandee_at)}` : ""}
                {l.levee_at ? ` · Levée le ${dateCourte(l.levee_at)}` : ""}
              </p>

              {(imprimees.length > 0 || (options.plans && lienPlan && repere)) && (
                <div className="photos">
                  {/* Miniature du plan avec le repère : sur le terrain, « où » compte
                      autant que « quoi ». Elle reste petite pour ne pas noyer la fiche. */}
                  {options.plans && lienPlan && repere && (
                    <figure className="repere-plan">
                      <div className="repere-cadre">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={lienPlan} alt={`Plan ${l.plan}`} />
                        <span
                          className="repere-marqueur"
                          style={{
                            left: `${Number(l.position_x) * 100}%`,
                            top: `${Number(l.position_y) * 100}%`,
                          }}
                        >
                          {l.numero}
                        </span>
                      </div>
                      <figcaption>
                        Repérage — {l.plan}
                        {l.plan_page !== null ? `, page ${l.plan_page}` : ""}
                      </figcaption>
                    </figure>
                  )}
                  {imprimees.map((photo) => {
                    const url = liensPhotos.get(photo.storage_path);
                    if (!url) return null;
                    return (
                      <figure key={photo.photo_id}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={photo.legende ?? `Réserve n°${l.numero}`} />
                        <figcaption>
                          {photo.usage === "constat" ? "Constat"
                            : photo.usage === "travaux" ? "Travaux"
                            : photo.usage === "levee" ? "Levée"
                            : photo.usage === "preuve_refus" ? "Preuve de refus" : "Échange"}
                          {photo.legende ? ` — ${photo.legende}` : ""}
                        </figcaption>
                      </figure>
                    );
                  })}
                </div>
              )}
              {restantes > 0 && (
                <p className="fiche-meta">
                  {restantes} photo{restantes > 1 ? "s" : ""} supplémentaire
                  {restantes > 1 ? "s" : ""} non imprimée{restantes > 1 ? "s" : ""} —
                  consultables dans l’application.
                </p>
              )}

              {options.historique && decisives.length > 0 && (
                <table style={{ marginTop: 6 }}>
                  <thead>
                    <tr><th>Date</th><th>Action</th><th>Auteur</th><th>Commentaire</th></tr>
                  </thead>
                  <tbody>
                    {decisives.map((h, index) => (
                      <tr key={`${h.reserve_id}-${index}`}>
                        <td>{new Date(h.created_at).toLocaleString("fr-FR")}</td>
                        <td>{LIBELLES_ACTION[h.action] ?? h.action}</td>
                        <td>{[h.auteur, h.auteur_organisation].filter(Boolean).join(" — ") || "—"}</td>
                        <td>{h.commentaire ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })
      ) : (
        /* Format synthétique : tout ce qu'on pointe en réunion, et rien d'autre. */
        <table className="table-synthese">
          <thead>
            <tr>
              <th className="col-num">N°</th>
              <th>Titre</th>
              <th className="col-zone">Zone</th>
              <th className="col-ent">Entreprise</th>
              <th className="col-etat">Statut</th>
              <th className="col-prio">Priorité</th>
              <th className="col-date">Constat</th>
              <th className="col-date">Échéance</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.id} className={estEnRetard(l) ? "ligne-retard" : undefined}>
                <td className="col-num">{l.numero}</td>
                <td>{l.titre}</td>
                <td>{zoneDe(l)}</td>
                <td>{l.intervenant ?? "Non attribuée"}</td>
                <td>{LIBELLES_STATUT[l.statut]}</td>
                <td>{LIBELLES_PRIORITE[l.priorite]}</td>
                <td>{dateCourte(l.created_at)}</td>
                <td>
                  {dateCourte(l.echeance)}
                  {estEnRetard(l) ? " ⚠" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="pied">
        Document généré par ELSATIA Réserves pour {entete.organisation}, le{" "}
        {edite.toLocaleDateString("fr-FR")} à {edite.toLocaleTimeString("fr-FR")}.
        {detaille
          ? (options.historique ? " Décisions et motifs inclus." : " Sans historique.")
          : " Liste synthétique."}
        {" "}Les réserves listées sont exactement celles que l’auteur du document est
        autorisé à consulter.
      </p>
    </>
  );
}
