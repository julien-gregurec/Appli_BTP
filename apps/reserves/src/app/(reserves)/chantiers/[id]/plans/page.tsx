import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { exigerShellReserves, peutGererChantiers } from "@/lib/acces-reserves";
import { lireChantier, listerPlansComplets, signerFichiers, BUCKET_PLANS } from "@/lib/donnees";
import { ajouterPlanAction, supprimerPlanAction } from "@/app/actions";
import { ACCEPT_PLAN, formaterOctets } from "@/lib/images";

export const metadata: Metadata = { title: "Plans du chantier" };

export default async function PagePlans({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const contexte = await exigerShellReserves();
  if (!peutGererChantiers(contexte.roleReserves)) redirect(`/chantiers/${id}`);

  const chantier = await lireChantier(id);
  if (!chantier) notFound();
  const plans = await listerPlansComplets(id);
  const liens = await signerFichiers(
    BUCKET_PLANS,
    plans.map((p) => p.storage_path).filter((c): c is string => Boolean(c)),
  );
  const erreur = typeof query.error === "string" ? query.error : null;

  return (
    <>
      <p className="sous-titre" style={{ marginBottom: 4 }}>
        <Link href={`/chantiers/${id}`}>← {chantier.nom}</Link>
      </p>
      <h1>Plans</h1>
      <p className="sous-titre">
        Un plan situe les réserves par niveau et par zone. Les images permettent le
        repérage tactile ; un PDF reste consultable mais ne porte pas de pastille.
      </p>
      {erreur && <div className="message erreur">{erreur}</div>}

      {plans.length === 0 ? (
        <p className="vide">Aucun plan sur ce chantier.</p>
      ) : (
        <ul className="liste">
          {plans.map((plan) => (
            <li key={plan.id} className="carte">
              <div className="reserve-tete">
                <span className="reserve-titre">{plan.nom}</span>
                {plan.niveau && <span className="etiquette">{plan.niveau}</span>}
                {plan.zone && <span className="etiquette">{plan.zone}</span>}
              </div>
              <div className="reserve-meta">
                <span>{plan.nom_fichier ?? "Document"}</span>
                <span>{formaterOctets(plan.taille_octets)}</span>
                {!plan.storage_path && <span className="etiquette refus">Document manquant</span>}
              </div>
              <div className="actions">
                {plan.storage_path && liens.get(plan.storage_path) && (
                  <a className="bouton secondaire" href={liens.get(plan.storage_path)} target="_blank" rel="noreferrer">
                    Ouvrir
                  </a>
                )}
                {plan.mime_type?.startsWith("image/") && (
                  <Link className="bouton secondaire" href={`/chantiers/${id}?plan=${plan.id}`}>
                    Voir le repérage
                  </Link>
                )}
                <form action={supprimerPlanAction}>
                  <input type="hidden" name="chantier_id" value={id} />
                  <input type="hidden" name="plan_id" value={plan.id} />
                  <button className="bouton danger" type="submit">Retirer</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2>Ajouter un plan</h2>
      <form className="carte" action={ajouterPlanAction}>
        <input type="hidden" name="chantier_id" value={id} />
        <label>Nom du plan<input name="nom" required maxLength={180} placeholder="Plan d’étage" /></label>
        <div className="paire">
          <label>Niveau<input name="niveau" maxLength={80} placeholder="R+1" /></label>
          <label>Zone<input name="zone" maxLength={120} placeholder="Aile Est" /></label>
        </div>
        <label>
          Document
          <input name="document" type="file" accept={ACCEPT_PLAN} required />
        </label>
        <p className="mention">
          Image (JPEG, PNG, WEBP) ou PDF, 25 Mo au maximum. Le fichier reste privé :
          il n’est accessible qu’aux personnes habilitées sur ce chantier.
        </p>
        <div className="actions">
          <button className="bouton" type="submit">Déposer le plan</button>
        </div>
      </form>
    </>
  );
}
