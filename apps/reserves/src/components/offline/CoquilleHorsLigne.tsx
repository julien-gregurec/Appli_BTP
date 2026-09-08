"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Marque } from "@/components/Marque";
import {
  type ChantierCache, listerChantiersCache, listerMutations, listerReservesCache,
  type ReserveCache,
} from "@/lib/offline/base-locale";
import { lireIdentiteLocale } from "@/lib/offline/identite-locale";
import {
  estEnSuspens, LIBELLES_ETAT, LIBELLES_TYPE, type Mutation,
} from "@/lib/offline/contrat";
import { CaptureOffline } from "./CaptureOffline";
import { reprendreApresRedemarrage, synchroniser } from "@/lib/offline/synchronisation";
import { reseauJoignable } from "@/lib/offline/reseau";

/**
 * Ce que l'appareil sait, sans réseau.
 *
 * Trois sections, dans l'ordre où elles importent sur un chantier : ce qui n'est pas
 * encore parti, ce qu'on peut consulter, et ce qui manque. La troisième est la plus
 * importante : dire clairement ce qui n'est PAS disponible évite qu'un conducteur de
 * travaux conclue d'une liste vide que le chantier n'a pas de réserve.
 */
export function CoquilleHorsLigne() {
  const [chargement, setChargement] = useState(true);
  const [identifie, setIdentifie] = useState(false);
  const [chantiers, setChantiers] = useState<ChantierCache[]>([]);
  const [reserves, setReserves] = useState<ReserveCache[]>([]);
  const [mutations, setMutations] = useState<Mutation[]>([]);
  const [enLigne, setEnLigne] = useState(true);
  const [identite, setIdentite] = useState<ReturnType<typeof lireIdentiteLocale>>(null);

  const relire = useCallback(async () => {
    const courante = lireIdentiteLocale();
    if (!courante) return;
    try {
      const [c, r, m] = await Promise.all([
        listerChantiersCache(courante),
        listerReservesCache(courante),
        listerMutations(courante),
      ]);
      setChantiers(c); setReserves(r);
      setMutations(m.filter((x) => x.etat !== "annule"));
    } catch { /* base illisible */ }
  }, []);

  useEffect(() => {
    // Servie par le service worker, cette page ne peut pas se fier à `navigator.onLine`
    // (qui vaut alors « true » alors que rien n'est joignable) : elle sonde le serveur.
    void reseauJoignable().then(setEnLigne);
    const majReseau = () => { void reseauJoignable().then(setEnLigne); };
    window.addEventListener("online", majReseau);
    window.addEventListener("offline", majReseau);

    (async () => {
      const courante = lireIdentiteLocale();
      if (!courante) { setChargement(false); return; }
      setIdentite(courante);
      setIdentifie(true);

      // Réparation d'abord. Cette coquille n'est pas sous <AtelierOffline> : elle est
      // servie par le service worker, hors de la coquille applicative. C'est donc ICI
      // qu'il faut relever les mutations laissées « en cours » par un envoi interrompu —
      // fermeture d'onglet, rechargement, batterie vide. Sans cela, elles resteraient
      // affichées « Envoi en cours » indéfiniment, ce qui est exactement le mensonge que
      // ce lot cherche à rendre impossible.
      try { await reprendreApresRedemarrage(courante); } catch { /* base illisible */ }

      await relire();
      setChargement(false);
      // Le réseau peut être revenu pendant que la coquille se chargeait : on tente
      // l'envoi sans attendre que l'utilisateur revienne sur une page en ligne.
      if (await reseauJoignable()) {
        try { await synchroniser(courante); await relire(); } catch { /* réessai plus tard */ }
      }
    })();

    return () => {
      window.removeEventListener("online", majReseau);
      window.removeEventListener("offline", majReseau);
    };
  }, [relire]);

  const enSuspens = mutations.filter((m) => estEnSuspens(m.etat));
  const resteAEnvoyer = mutations.some((m) => m.etat === "en_attente" || m.etat === "echec");

  /**
   * Reprise périodique tant que la coquille est ouverte.
   *
   * Sans elle, l'envoi ne serait tenté qu'au chargement de la page : un utilisateur qui
   * laisse l'écran ouvert en attendant le retour du réseau verrait sa file rester en
   * « en attente » indéfiniment, alors que la connexion est revenue. C'est aussi ce qui
   * permet de repartir après une tentative bloquée par le verrou inter-onglets.
   */
  useEffect(() => {
    if (!identite || !resteAEnvoyer) return;
    let vivant = true;
    const minuterie = setInterval(async () => {
      if (!vivant || !(await reseauJoignable())) return;
      try {
        await synchroniser(identite);
        if (vivant) await relire();
      } catch { /* on retentera au tour suivant */ }
    }, 5_000);
    return () => { vivant = false; clearInterval(minuterie); };
  }, [identite, resteAEnvoyer, relire]);

  return (
    <main className="page-publique" data-test="coquille-hors-ligne">
      <div className="carte-auth" style={{ maxWidth: 720 }}>
        <Marque />
        <h1>{enLigne ? "Travail local" : "Hors ligne"}</h1>
        <p className="sous-titre" data-test="etat-reseau">
          {enLigne
            ? "Le réseau est revenu. Vos saisies vont repartir automatiquement."
            : "Aucun réseau. Voici ce que cet appareil a en mémoire, et ce qui reste à envoyer."}
        </p>

        {chargement && <p className="mention">Lecture de la mémoire de l’appareil…</p>}

        {!chargement && !identifie && (
          <p className="message" data-test="aucune-identite">
            Aucune session n’est ouverte sur cet appareil. Reconnectez-vous pour retrouver
            vos chantiers : rien n’est conservé après une déconnexion.
          </p>
        )}

        {!chargement && identifie && (
          <>
            {identite && (
              <CaptureOffline
                identite={identite}
                chantiers={chantiers}
                reserves={reserves}
                surEnregistrement={relire}
              />
            )}

            {/* 1. Ce qui n'est pas parti — la seule chose qui puisse être perdue. */}
            <h2>À envoyer</h2>
            {enSuspens.length === 0 ? (
              <p className="vide" data-test="rien-a-envoyer">
                Rien en attente : tout ce que vous avez saisi est enregistré sur le serveur.
              </p>
            ) : (
              <ul className="liste" data-test="file-hors-ligne">
                {enSuspens.map((mutation) => (
                  <li key={mutation.id} className="carte" data-etat={mutation.etat}>
                    <div className="reserve-tete">
                      <span className="reserve-titre">{LIBELLES_TYPE[mutation.type]}</span>
                      <span className="etiquette">{LIBELLES_ETAT[mutation.etat]}</span>
                    </div>
                    {typeof mutation.payload.titre === "string" && <p>{mutation.payload.titre}</p>}
                    {typeof mutation.payload.contenu === "string" && <p>{mutation.payload.contenu}</p>}
                    <p className="mention">
                      Saisi le {new Date(mutation.creeeA).toLocaleString("fr-FR")}
                    </p>
                    {mutation.derniereErreur && (
                      <p className="message erreur sans-marge">{mutation.derniereErreur}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* 2. Ce qui reste consultable. */}
            <h2>Consultable hors ligne</h2>
            {chantiers.length === 0 && reserves.length === 0 ? (
              <p className="vide" data-test="rien-en-cache">
                Aucun chantier n’a encore été ouvert sur cet appareil. Connectez-vous une
                fois au réseau pour les rendre consultables hors ligne.
              </p>
            ) : (
              <>
                <ul className="liste" data-test="chantiers-hors-ligne">
                  {chantiers.map((chantier) => (
                    <li key={chantier.id} className="carte">
                      <strong>{chantier.nom}</strong>
                      {chantier.reference && <span className="mention"> · {chantier.reference}</span>}
                      <p className="mention">
                        {reserves.filter((r) => r.chantierId === chantier.id).length} réserve(s)
                        en mémoire · relevé du{" "}
                        {new Date(chantier.majA).toLocaleString("fr-FR")}
                      </p>
                    </li>
                  ))}
                </ul>
                <ul className="liste" data-test="reserves-hors-ligne">
                  {reserves.map((reserve) => (
                    <li key={reserve.id} className="carte">
                      <div className="reserve-tete">
                        <span className="reserve-num">n°{reserve.numero}</span>
                        <span className="reserve-titre">{reserve.titre}</span>
                      </div>
                      <div className="reserve-meta">
                        <span>{reserve.statut}</span>
                        <span>{reserve.priorite}</span>
                        {reserve.intervenant && <span>{reserve.intervenant}</span>}
                        {reserve.echeance && <span>Échéance {reserve.echeance}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* 3. Ce qui n'est PAS disponible : le dire évite une conclusion fausse. */}
            <h2>Ce qui exige le réseau</h2>
            <p className="mention" data-test="limites-hors-ligne">
              Les photos déjà envoyées, les plans, les documents PDF, l’annuaire des
              entreprises et les invitations ne sont pas consultables hors ligne. Cette
              liste ne remplace pas le chantier : elle montre uniquement ce qui a été
              ouvert sur cet appareil.
            </p>

            <p className="mention">
              <Link href="/dashboard">Revenir au tableau de bord</Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
