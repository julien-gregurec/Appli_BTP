import type { Metadata } from "next";
import Link from "next/link";
import { exigerShellReserves } from "@/lib/acces-reserves";
import { lirePreferences } from "@/lib/donnees";
import { definirPreferenceAction } from "@/app/actions";

export const metadata: Metadata = { title: "Préférences de notification" };

export default async function PagePreferences({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const contexte = await exigerShellReserves();
  const erreur = typeof query.error === "string" ? query.error : null;
  const preferences = contexte.entrepriseId ? await lirePreferences(contexte.entrepriseId) : [];

  return (
    <>
      <h1>Préférences de notification</h1>
      <p className="sous-titre">
        Vous réglez ici les <strong>e-mails</strong>, catégorie par catégorie, pour{" "}
        {contexte.entrepriseNom}. Les notifications restent toujours consultables dans
        l’application : couper un e-mail est un confort, se rendre aveugle n’en est pas un.
      </p>
      {erreur && <div className="message erreur">{erreur}</div>}

      {preferences.length === 0 ? (
        <p className="vide">Aucune organisation active.</p>
      ) : (
        <ul className="liste">
          {preferences.map((p) => (
            <li key={p.categorie} className="carte">
              <form action={definirPreferenceAction}>
                <input type="hidden" name="entreprise_id" value={contexte.entrepriseId ?? ""} />
                <input type="hidden" name="categorie" value={p.categorie} />
                <div className="reserve-tete">
                  <span className="reserve-titre">{p.libelle}</span>
                  {p.contient_critique && <span className="etiquette attente">Contient des alertes importantes</span>}
                </div>
                <label className="case">
                  <input type="checkbox" name="email" defaultChecked={p.email} />
                  Recevoir un e-mail pour cette catégorie
                </label>
                <div className="actions">
                  <button className="bouton secondaire" type="submit">Enregistrer</button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}

      <p className="mention">
        <Link href="/notifications">Voir mes notifications</Link>
      </p>
    </>
  );
}
