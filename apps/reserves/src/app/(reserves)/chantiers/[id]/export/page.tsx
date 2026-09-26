import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerShellReserves } from "@/lib/acces-reserves";
import { lireEnteteExport, lireLignesExport, listerIntervenantsExport } from "@/lib/donnees";
import {
  LIBELLES_PRIORITE, LIBELLES_STATUT, PRIORITES_RESERVE, STATUTS_RESERVE, estEnRetard,
} from "@/lib/workflow";
import {
  appliquerVue, filtresBase, FORMATS_EXPORT, LIBELLES_FORMAT, LIBELLES_VUE,
  lireOptionsExport, suffixeExport, VUES_EXPORT, type OptionsExport,
} from "@/lib/export/options";

export const metadata: Metadata = { title: "Exports du chantier" };

/** Lien PDF d'une sélection dérivée de la sélection courante. */
function lienPdf(id: string, base: OptionsExport, ecart: Partial<OptionsExport>) {
  return `/api/documents/chantier/${id}/pdf${suffixeExport({ ...base, ...ecart })}`;
}

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
  const options = lireOptionsExport(query);

  const entete = await lireEnteteExport(id);
  if (!entete) notFound();

  const [brutes, intervenants] = await Promise.all([
    lireLignesExport(id, filtresBase(options)),
    listerIntervenantsExport(id),
  ]);
  const lignes = appliquerVue(brutes, options.vue);
  const suffixe = suffixeExport(options);
  const detaille = options.format === "detaillee";

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
            Liste à imprimer
            <select name="vue" defaultValue={options.vue}>
              {VUES_EXPORT.map((v) => (
                <option key={v} value={v}>{LIBELLES_VUE[v]}</option>
              ))}
            </select>
          </label>
          <label>
            Entreprise
            <select name="entreprise" defaultValue={options.intervenantId ?? ""}>
              <option value="">Toutes les entreprises</option>
              {intervenants.map((i) => (
                <option key={i.intervenant_id} value={i.intervenant_id}>
                  {i.nom} ({i.ouvertes} ouverte{i.ouvertes > 1 ? "s" : ""} / {i.total})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="paire">
          <label>
            Format
            <select name="format" defaultValue={options.format}>
              {FORMATS_EXPORT.map((f) => (
                <option key={f} value={f}>{LIBELLES_FORMAT[f]}</option>
              ))}
            </select>
          </label>
          <label>
            Orientation
            <select name="orientation" defaultValue={options.orientation}>
              <option value="portrait">A4 portrait</option>
              <option value="paysage">A4 paysage — liste large</option>
            </select>
          </label>
        </div>
        <div className="paire">
          <label>
            Statut précis
            <select name="statut" defaultValue={options.statut ?? ""}>
              <option value="">Tous les statuts</option>
              {STATUTS_RESERVE.map((s) => <option key={s} value={s}>{LIBELLES_STATUT[s]}</option>)}
            </select>
          </label>
          <label>
            Priorité
            <select name="priorite" defaultValue={options.priorite ?? ""}>
              <option value="">Toutes les priorités</option>
              {PRIORITES_RESERVE.map((p) => <option key={p} value={p}>{LIBELLES_PRIORITE[p]}</option>)}
            </select>
          </label>
        </div>
        <label>
          Échéance au plus tard le
          <input type="date" name="echeance" defaultValue={options.echeanceAvant ?? ""} />
        </label>

        {/* Ces trois options ne concernent que la fiche détaillée : sur une liste
            synthétique, il n'y a ni photo, ni plan, ni historique à inclure. */}
        <fieldset className="options-detail" disabled={!detaille}>
          <legend className="mention">Contenu des fiches détaillées</legend>
          <label className="case">
            <input type="checkbox" name="photos" value="1" defaultChecked={options.photos} />
            Inclure les photos
          </label>
          <label className="case">
            <input type="checkbox" name="plans" value="1" defaultChecked={options.plans} />
            Inclure la miniature du plan et le repère
          </label>
          <label className="case">
            <input type="checkbox" name="historique" value="1" defaultChecked={options.historique} />
            Inclure les décisions et leurs motifs
          </label>
        </fieldset>

        <div className="actions">
          <button className="bouton secondaire" type="submit">Appliquer la sélection</button>
        </div>
      </form>

      <div className="carte">
        <h2 className="sans-marge">
          {lignes.length} réserve{lignes.length > 1 ? "s" : ""} dans ce document
        </h2>
        <p className="mention">
          {LIBELLES_VUE[options.vue]} · format {detaille ? "détaillé" : "synthétique"} ·
          A4 {options.orientation}. Le document est horodaté et porte l’organisation
          émettrice, le chantier et son auteur. Il ne contient que les réserves que vous
          êtes autorisé à consulter.
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

      {/* Les tirages qu'on redemande à chaque réunion, sans repasser par le formulaire. */}
      <div className="carte">
        <h2 className="sans-marge">Tirages courants</h2>
        <div className="actions">
          <a className="bouton secondaire" href={lienPdf(id, options, { vue: "ouvertes", format: "synthetique" })}>
            Ouvertes — synthèse
          </a>
          <a className="bouton secondaire" href={lienPdf(id, options, { vue: "retard", format: "synthetique" })}>
            En retard — synthèse
          </a>
          <a className="bouton secondaire" href={lienPdf(id, options, { vue: "attente_levee", format: "synthetique" })}>
            En attente de levée
          </a>
          <a className="bouton secondaire" href={lienPdf(id, options, { vue: "levees", format: "synthetique" })}>
            Levées
          </a>
          <a className="bouton secondaire" href={lienPdf(id, options, { vue: "ouvertes", format: "detaillee" })}>
            Ouvertes — fiches détaillées
          </a>
        </div>
      </div>

      {intervenants.length > 0 && (
        <div className="carte">
          <h2 className="sans-marge">PDF par entreprise</h2>
          <p className="mention">
            Un document par corps d’état, ne contenant que ses réserves : c’est ce qui se
            transmet à une entreprise sans lui montrer le reste du chantier. La sélection
            courante ({LIBELLES_VUE[options.vue].toLowerCase()}) s’y applique.
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
                     href={lienPdf(id, options, { intervenantId: i.intervenant_id })}>
                    PDF de cette entreprise
                  </a>
                  <Link className="bouton secondaire"
                        href={`/chantiers/${id}/export${suffixeExport({ ...options, intervenantId: i.intervenant_id })}`}>
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
                {estEnRetard(l) && <span className="etiquette refus">En retard</span>}
                <span>{l.nb_photos} photo{l.nb_photos > 1 ? "s" : ""}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
