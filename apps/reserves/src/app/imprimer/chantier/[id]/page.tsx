import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigerShellReserves } from "@/lib/acces-reserves";
import {
  BUCKET_PHOTOS, lireEnteteExport, lireHistoriqueExport, lireLignesExport,
  lirePhotosExport, listerIntervenantsExport, signerFichiers,
} from "@/lib/donnees";
import { LIBELLES_PRIORITE, LIBELLES_STATUT } from "@/lib/workflow";

export const metadata: Metadata = {
  title: "Document Réserves",
  robots: { index: false, follow: false },
};

const LIBELLES_ACTION: Record<string, string> = {
  creation: "Création", assignation: "Attribution", reassignation: "Transfert",
  acceptation: "Responsabilité acceptée", refus_responsabilite: "Responsabilité refusée",
  commentaire: "Message", photo_ajoutee: "Photo ajoutée", demande_levee: "Levée demandée",
  levee_validee: "Levée validée", levee_refusee: "Levée refusée", reouverture: "Réouverture",
  annulation: "Annulation", modification: "Modification",
};

function dateCourte(valeur: string | null) {
  return valeur ? new Date(valeur).toLocaleDateString("fr-FR") : "—";
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

  const lire = (cle: string) => (typeof query[cle] === "string" ? (query[cle] as string) : null);
  const intervenantId = lire("entreprise");
  const statut = lire("statut");
  const priorite = lire("priorite");
  const echeanceAvant = lire("echeance");
  const inclureLevees = lire("levees") !== "0";
  const avecHistorique = lire("historique") === "complet";
  const avecPhotos = lire("photos") !== "0";

  const entete = await lireEnteteExport(id);
  if (!entete) notFound();

  const [lignes, intervenants] = await Promise.all([
    lireLignesExport(id, { intervenantId, statut, priorite, echeanceAvant, inclureLevees }),
    listerIntervenantsExport(id),
  ]);

  // L'historique n'est chargé que si le document le demande : le PDF « synthèse » ne fait
  // pas transiter des lignes qu'il n'imprimera pas.
  const historique = avecHistorique ? await lireHistoriqueExport(id, intervenantId) : [];
  const photos = avecPhotos ? await lirePhotosExport(id, intervenantId) : [];
  const liensPhotos = await signerFichiers(BUCKET_PHOTOS, photos.map((p) => p.storage_path));

  const entreprise = intervenantId
    ? intervenants.find((i) => i.intervenant_id === intervenantId)?.nom ?? "Entreprise"
    : null;

  const edite = new Date();
  const filtres = [
    entreprise ? `entreprise : ${entreprise}` : null,
    statut ? `statut : ${LIBELLES_STATUT[statut as keyof typeof LIBELLES_STATUT] ?? statut}` : null,
    priorite ? `priorité : ${LIBELLES_PRIORITE[priorite as keyof typeof LIBELLES_PRIORITE] ?? priorite}` : null,
    echeanceAvant ? `échéance au plus tard le ${dateCourte(echeanceAvant)}` : null,
    inclureLevees ? null : "réserves levées et annulées exclues",
  ].filter(Boolean) as string[];

  const photosParReserve = new Map<string, typeof photos>();
  for (const photo of photos) {
    const liste = photosParReserve.get(photo.reserve_id) ?? [];
    liste.push(photo);
    photosParReserve.set(photo.reserve_id, liste);
  }
  const historiqueParReserve = new Map<string, typeof historique>();
  for (const ligne of historique) {
    const liste = historiqueParReserve.get(ligne.reserve_id) ?? [];
    liste.push(ligne);
    historiqueParReserve.set(ligne.reserve_id, liste);
  }

  return (
    <>
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

      <div className="synthese">
        <span><b>{lignes.length}</b>réserve{lignes.length > 1 ? "s" : ""} éditée{lignes.length > 1 ? "s" : ""}</span>
        <span><b>{entete.total}</b>au chantier</span>
        <span><b>{entete.ouvertes}</b>ouverte{entete.ouvertes > 1 ? "s" : ""}</span>
        <span><b>{entete.levees}</b>levée{entete.levees > 1 ? "s" : ""}</span>
        <span><b>{entete.en_retard}</b>en retard</span>
      </div>

      {filtres.length > 0 && (
        <p style={{ margin: "0 0 12px", color: "#444" }}>
          Sélection : {filtres.join(" · ")}.
        </p>
      )}

      {!intervenantId && intervenants.length > 0 && (
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
      ) : (
        lignes.map((l) => {
          const photosReserve = photosParReserve.get(l.id) ?? [];
          const historiqueReserve = historiqueParReserve.get(l.id) ?? [];
          return (
            <div key={l.id} className="fiche">
              <div className="fiche-tete">
                <span className="fiche-num">n°{l.numero}</span>
                <span><strong>{l.titre}</strong></span>
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
                    + `${l.position_x !== null
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

              {avecPhotos && photosReserve.length > 0 && (
                <div className="photos">
                  {photosReserve.map((photo) => {
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

              {avecHistorique && historiqueReserve.length > 0 && (
                <table style={{ marginTop: 6 }}>
                  <thead>
                    <tr><th>Date</th><th>Action</th><th>Auteur</th><th>Commentaire</th></tr>
                  </thead>
                  <tbody>
                    {historiqueReserve.map((h, index) => (
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
      )}

      <p className="pied">
        Document généré par ELSATIA Réserves pour {entete.organisation}, le{" "}
        {edite.toLocaleDateString("fr-FR")} à {edite.toLocaleTimeString("fr-FR")}.
        {avecHistorique ? " Historique complet inclus." : " Synthèse sans historique détaillé."}
        {" "}Les réserves listées sont exactement celles que l’auteur du document est
        autorisé à consulter.
      </p>
    </>
  );
}
