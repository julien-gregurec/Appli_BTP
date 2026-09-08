"use client";

import Link from "next/link";
import { useAtelierOffline } from "./AtelierOffline";
import { LIBELLES_ETAT, LIBELLES_TYPE, peutAnnuler, peutReessayer } from "@/lib/offline/contrat";

/**
 * Bandeau d'état du travail non transmis.
 *
 * Règle qui gouverne tout cet écran : l'utilisateur ne doit JAMAIS croire qu'une réserve
 * ou une photo est enregistrée sur le serveur alors qu'elle dort sur l'appareil. Le
 * bandeau est donc visible dès qu'il reste quoi que ce soit en suspens — y compris en
 * ligne, car « en ligne » ne veut pas dire « déjà transmis ».
 */
export function IndicateurOffline() {
  const { enLigne, enSuspens, synchronisationEnCours, mutations } = useAtelierOffline();
  const conflits = mutations.filter((m) => m.etat === "conflit").length;
  const echecs = mutations.filter((m) => m.etat === "echec").length;

  if (enLigne && enSuspens === 0) return null;

  const ton = conflits > 0 || echecs > 0 ? "erreur" : "";

  return (
    <div className={`bandeau-offline ${ton}`} role="status" data-test="bandeau-offline">
      <span className={`pastille ${enLigne ? "en-ligne" : "hors-ligne"}`} aria-hidden="true" />
      <span>
        <strong>{enLigne ? "En ligne" : "Hors ligne"}</strong>
        {!enLigne && " — vos saisies sont conservées sur l’appareil."}
      </span>

      {enSuspens > 0 && (
        <span data-test="compteur-en-suspens">
          {enSuspens} action{enSuspens > 1 ? "s" : ""} non transmise{enSuspens > 1 ? "s" : ""}
          {conflits > 0 && ` · ${conflits} conflit${conflits > 1 ? "s" : ""}`}
          {echecs > 0 && ` · ${echecs} échec${echecs > 1 ? "s" : ""}`}
        </span>
      )}
      {synchronisationEnCours && <span data-test="synchro-en-cours">Synchronisation…</span>}

      {enSuspens > 0 && (
        <Link className="bouton secondaire" href="/hors-ligne">
          Voir le détail
        </Link>
      )}
    </div>
  );
}

/**
 * Liste détaillée de la file : ce qui attend, ce qui a échoué, ce qui est en conflit —
 * avec, pour chaque ligne, la cause en clair et le geste qui la débloque.
 */
export function FileOffline() {
  const {
    mutations, reessayer, annuler, oublier, enLigne, synchroniserMaintenant,
    soumettreBrouillon,
  } = useAtelierOffline();
  const visibles = mutations.filter((m) => m.etat !== "annule");

  if (visibles.length === 0) {
    return (
      <p className="vide" data-test="file-vide">
        Aucune action en attente : tout ce que vous avez saisi est enregistré sur le serveur.
      </p>
    );
  }

  return (
    <ul className="liste" data-test="file-offline">
      {visibles.map((mutation) => (
        <li key={mutation.id} className="carte" data-test="mutation" data-etat={mutation.etat}>
          <div className="reserve-tete">
            <span className="reserve-titre">{LIBELLES_TYPE[mutation.type]}</span>
            <span className={`etiquette ${mutation.etat === "conflit" || mutation.etat === "echec" ? "refus" : ""}`}>
              {LIBELLES_ETAT[mutation.etat]}
            </span>
          </div>

          {typeof mutation.payload.titre === "string" && (
            <p className="sans-marge">{mutation.payload.titre}</p>
          )}
          {typeof mutation.payload.contenu === "string" && (
            <p className="sans-marge">{mutation.payload.contenu}</p>
          )}

          <p className="mention">
            Saisi le {new Date(mutation.creeeA).toLocaleString("fr-FR")}
            {mutation.tentatives > 0 && ` · ${mutation.tentatives} tentative${mutation.tentatives > 1 ? "s" : ""}`}
          </p>

          {/* La cause est écrite en clair : « échec » sans motif n'aide personne à
              décider s'il faut réessayer, corriger, ou prévenir quelqu'un. */}
          {mutation.derniereErreur && (
            <p className="message erreur sans-marge" data-test="motif">{mutation.derniereErreur}</p>
          )}

          {mutation.etat === "conflit" && (
            <p className="mention">
              Cette action ne peut pas être appliquée telle quelle : la réserve a changé
              d’état sur le serveur. Votre saisie est conservée ici, rien n’a été écrasé.
              Ouvrez la réserve pour décider de la suite.
            </p>
          )}

          <div className="actions">
            {peutReessayer(mutation.etat) && (
              <button className="bouton secondaire" type="button"
                      data-test="reessayer" onClick={() => void reessayer(mutation.id)}>
                Réessayer
              </button>
            )}
            {mutation.etat === "brouillon" && (
              <>
                {/* Un brouillon ne part JAMAIS seul : c'est ce qui le distingue d'une
                    action en attente. Il lui faut donc un geste, et un seul. */}
                <button className="bouton" type="button" data-test="soumettre-brouillon"
                        onClick={() => void soumettreBrouillon(mutation.id)}>
                  Mettre en file d’envoi
                </button>
                <span className="mention">
                  Brouillon local — non transmis. Modifiable depuis l’écran hors ligne.
                </span>
              </>
            )}
            {peutAnnuler(mutation.etat) && (
              <button className="bouton danger" type="button"
                      data-test="annuler" onClick={() => void annuler(mutation.id)}>
                Annuler
              </button>
            )}
            {(mutation.etat === "synchronise" || mutation.etat === "annule") && (
              <button className="bouton secondaire" type="button"
                      onClick={() => void oublier(mutation.id)}>
                Retirer de la liste
              </button>
            )}
          </div>
        </li>
      ))}

      {enLigne && (
        <li>
          <button className="bouton" type="button" data-test="synchroniser"
                  onClick={() => void synchroniserMaintenant()}>
            Tout synchroniser maintenant
          </button>
        </li>
      )}
    </ul>
  );
}
