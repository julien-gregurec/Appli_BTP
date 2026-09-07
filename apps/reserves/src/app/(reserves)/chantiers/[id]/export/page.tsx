import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerShellReserves } from "@/lib/acces-reserves";
import { lireEnteteExport, lireLignesExport, listerIntervenantsExport } from "@/lib/donnees";
import { LIBELLES_PRIORITE, LIBELLES_STATUT, STATUTS_RESERVE, PRIORITES_RESERVE } from "@/lib/workflow";

export const metadata: Metadata = { title: "Exports du chantier" };

/**
 * Console d'export. Elle ne rend PAS le document : elle compose la sélection, montre
 * exactement ce qu'elle contient, puis ouvre le PDF serveur ou la version imprimable.
 *
 * Montrer l'aperçu avant d'imprimer n'est pas cosmétique : un « PDF par entreprise »
 * envoyé au mauvais destinataire est une fuite de données de chantier. On affiche donc
 * le décompte et la liste avant de produire quoi que ce soit.
 */
export default async function PageExport({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  await exigerShellReserves();

  const lire = (cle: string) => (typeof query[cle] === "string" ? (query[cle] as string) : "");
  const intervenantId = lire("entreprise") || null;
  const statut = lire("statut") || null;
  const priorite = lire("priorite") || null;
  const echeance = lire("echeance") || null;
  const inclureLevees = lire("levees") !== "0";
  const historique = lire("historique") === "complet" ? "complet" : "synthese";
  const photos = lire("photos") !== "0";

  const entete = await lireEnteteExport(id);
  if (!entete) notFound();

  const [lignes, intervenants] = await Promise.all([
    lireLignesExport(id, {
      intervenantId, statut, priorite, echeanceAvant: echeance, inclureLevees,
    }),
    listerIntervenantsExport(id),
  ]);

  const parametres = new URLSearchParams();
  if (intervenantId) parametres.set("entreprise", intervenantId);
  if (statut) parametres.set("statut", statut);
  if (priorite) parametres.set("priorite", priorite);
  if (echeance) parametres.set("echeance", echeance);
  if (!inclureLevees) parametres.set("levees", "0");
  if (historique === "complet") parametres.set("historique", "complet");
  if (!photos) parametres.set("photos", "0");
  const suffixe = parametres.toString() ? `?${parametres.toString()}` : "";

  return (
    <>
      <h1>Exports — {entete.chantier}</h1>
      <p className="sous-titre">
        {entete.organisation} · {entete.total} réserve{entete.total > 1 ? "s" : ""} au
        chantier, dont {entete.ouvertes} ouverte{entete.ouvertes > 1 ? "s" : ""} et{" "}
        {entete.en_retard} en retard.
      </p>

      <form className="carte" method="get">
        <h2 className="sans-marge">Sélection</h2>
        <div className="paire">
          <label>
            Entreprise
            <select name="entreprise" defaultValue={intervenantId ?? ""}>
              <option value="">Toutes les entreprises</option>
              {intervenants.map((i) => (
                <option key={i.intervenant_id} value={i.intervenant_id}>
                  {i.nom} ({i.ouvertes} ouverte{i.ouvertes > 1 ? "s" : ""} / {i.total})
                </option>
              ))}
            </select>
          </label>
          <label>
            Statut
            <select name="statut" defaultValue={statut ?? ""}>
              <option value="">Tous les statuts</option>
              {STATUTS_RESERVE.map((s) => <option key={s} value={s}>{LIBELLES_STATUT[s]}</option>)}
            </select>
          </label>
        </div>
        <div className="paire">
          <label>
            Priorité
            <select name="priorite" defaultValue={priorite ?? ""}>
              <option value="">Toutes les priorités</option>
              {PRIORITES_RESERVE.map((p) => <option key={p} value={p}>{LIBELLES_PRIORITE[p]}</option>)}
            </select>
          </label>
          <label>
            Échéance au plus tard le
            <input type="date" name="echeance" defaultValue={echeance ?? ""} />
          </label>
        </div>
        <label className="case">
          <input type="checkbox" name="levees" value="1" defaultChecked={inclureLevees} />
          Inclure les réserves levées et annulées
        </label>
        <label>
          Contenu du document
          <select name="historique" defaultValue={historique}>
            <option value="synthese">Synthèse — sans historique détaillé</option>
            <option value="complet">Complet — avec l’historique de chaque réserve</option>
          </select>
        </label>
        <label className="case">
          <input type="checkbox" name="photos" value="1" defaultChecked={photos} />
          Inclure les photos
        </label>
        <div className="actions">
          <button className="bouton secondaire" type="submit">Appliquer la sélection</button>
        </div>
      </form>

      <div className="carte">
        <h2 className="sans-marge">
          {lignes.length} réserve{lignes.length > 1 ? "s" : ""} dans ce document
        </h2>
        <p className="mention">
          Le document est horodaté et porte l’organisation émettrice, le chantier et son
          auteur. Il ne contient que les réserves que vous êtes autorisé à consulter.
        </p>
        <div className="actions">
          <a className="bouton" href={`/api/documents/chantier/${id}/pdf${suffixe}`}>
            Télécharger le PDF
          </a>
          <a className="bouton secondaire" href={`/imprimer/chantier/${id}${suffixe}`} target="_blank" rel="noreferrer">
            Ouvrir la version imprimable
          </a>
        </div>
      </div>

      {intervenants.length > 0 && (
        <div className="carte">
          <h2 className="sans-marge">PDF par entreprise</h2>
          <p className="mention">
            Un document par corps d’état, ne contenant que ses réserves : c’est ce qui se
            transmet à une entreprise sans lui montrer le reste du chantier.
          </p>
          <ul className="liste">
            {intervenants.map((i) => (
              <li key={i.intervenant_id} className="carte">
                <div className="reserve-tete">
                  <span className="reserve-titre">{i.nom}</span>
                  <span className="etiquette">{i.ouvertes} ouverte{i.ouvertes > 1 ? "s" : ""} / {i.total}</span>
                </div>
                <div className="actions">
                  <a className="bouton secondaire"
                     href={`/api/documents/chantier/${id}/pdf?entreprise=${i.intervenant_id}${historique === "complet" ? "&historique=complet" : ""}`}>
                    PDF de cette entreprise
                  </a>
                  <Link className="bouton secondaire"
                        href={`/chantiers/${id}/export?entreprise=${i.intervenant_id}`}>
                    Prévisualiser
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lignes.length === 0 ? (
        <p className="vide">Aucune réserve ne correspond à cette sélection.</p>
      ) : (
        <ul className="liste">
          {lignes.map((l) => (
            <li key={l.id} className="carte">
              <div className="reserve-tete">
                <span className="reserve-num">n°{l.numero}</span>
                <span className="reserve-titre">{l.titre}</span>
              </div>
              <div className="reserve-meta">
                <span>{LIBELLES_STATUT[l.statut]}</span>
                <span>{LIBELLES_PRIORITE[l.priorite]}</span>
                <span>{l.intervenant ?? "Non attribuée"}</span>
                {l.plan && (
                  <span>
                    {l.plan}{l.plan_page !== null ? `, page ${l.plan_page}` : ""}
                  </span>
                )}
                {l.echeance && <span>Échéance {l.echeance}</span>}
                <span>{l.nb_photos} photo{l.nb_photos > 1 ? "s" : ""}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
