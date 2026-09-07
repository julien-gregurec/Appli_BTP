"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import {
  creerMutation, estEnSuspens, type BrouillonMutation, type Mutation,
} from "@/lib/offline/contrat";
import {
  changerEtat, enregistrerMutation, type Identite, listerMutations, supprimerMutation,
} from "@/lib/offline/base-locale";
import {
  reessayer as remettreEnFile, reprendreApresRedemarrage, synchroniser,
} from "@/lib/offline/synchronisation";
import { memoriserIdentiteLocale } from "@/lib/offline/identite-locale";
import { reseauJoignable } from "@/lib/offline/reseau";

/**
 * Atelier hors-ligne : l'état local de l'appareil, offert à toute la coquille.
 *
 * Il porte trois choses, et rien d'autre : l'identité qui cloisonne la base locale,
 * l'état réel du réseau, et la file de mutations. Les règles de la file sont dans
 * `contrat.ts` ; le stockage est dans `base-locale.ts` ; l'envoi est dans
 * `synchronisation.ts`. Ce composant les branche sur React.
 */

type EtatAtelier = {
  identite: Identite | null;
  enLigne: boolean;
  pret: boolean;
  mutations: Mutation[];
  enSuspens: number;
  synchronisationEnCours: boolean;
  soumettre: (brouillon: BrouillonMutation, photo?: Blob | null) => Promise<Mutation>;
  enregistrerBrouillon: (brouillon: BrouillonMutation, photo?: Blob | null) => Promise<Mutation>;
  soumettreBrouillon: (id: string) => Promise<void>;
  reessayer: (id: string) => Promise<void>;
  annuler: (id: string) => Promise<void>;
  oublier: (id: string) => Promise<void>;
  synchroniserMaintenant: () => Promise<void>;
  rafraichir: () => Promise<void>;
};

const Contexte = createContext<EtatAtelier | null>(null);

export function useAtelierOffline(): EtatAtelier {
  const contexte = useContext(Contexte);
  if (!contexte) throw new Error("useAtelierOffline hors de <AtelierOffline>");
  return contexte;
}

export function AtelierOffline({
  entrepriseId, utilisateurId, children,
}: {
  entrepriseId: string | null;
  utilisateurId: string | null;
  children: ReactNode;
}) {
  const identite = useMemo<Identite | null>(
    () => (entrepriseId && utilisateurId ? { entrepriseId, utilisateurId } : null),
    [entrepriseId, utilisateurId],
  );

  // `navigator.onLine` n'existe pas au rendu serveur ; on part d'« en ligne » pour ne
  // pas afficher un bandeau hors-ligne pendant l'hydratation d'une session connectée.
  const [enLigne, setEnLigne] = useState(true);
  const [mutations, setMutations] = useState<Mutation[]>([]);
  const [fileChargee, setFileChargee] = useState(false);
  const [synchronisationEnCours, setSynchronisationEnCours] = useState(false);
  const derniereIdentite = useRef<string | null>(null);

  const rafraichir = useCallback(async () => {
    if (!identite) return;
    try {
      setMutations(await listerMutations(identite));
    } catch {
      // IndexedDB indisponible (navigation privée, quota, stockage bloqué) : la coquille
      // doit continuer à fonctionner EN LIGNE. On ne casse pas l'application pour ça.
      setMutations([]);
    }
  }, [identite]);

  const synchroniserMaintenant = useCallback(async () => {
    if (!identite) return;
    // La sonde évite d'user les tentatives d'une mutation contre un réseau qui n'existe
    // pas : chaque échec inutile rapproche la file de son plafond de tentatives.
    const joignable = await reseauJoignable();
    setEnLigne(joignable);
    if (!joignable) return;
    setSynchronisationEnCours(true);
    try {
      await synchroniser(identite);
    } finally {
      setSynchronisationEnCours(false);
      await rafraichir();
    }
  }, [identite, rafraichir]);

  // Démarrage : réparer la file, puis tenter un envoi.
  useEffect(() => {
    // Sans identité, il n'y a ni base locale à ouvrir ni file à réparer : l'état « prêt »
    // est alors dérivé du rendu (voir `pret` plus bas), pas posé depuis un effet.
    if (!identite) return;
    const cle = `${identite.entrepriseId}:${identite.utilisateurId}`;
    if (derniereIdentite.current === cle) return;
    derniereIdentite.current = cle;

    // La coquille hors-ligne doit savoir quelle base ouvrir sans pouvoir interroger
    // personne : on note l'identité courante (deux uuid, rien d'autre).
    memoriserIdentiteLocale(identite);

    let vivant = true;
    (async () => {
      try {
        // Une mutation restée « en cours » signale un arrêt brutal pendant l'envoi.
        await reprendreApresRedemarrage(identite);
      } catch { /* base illisible : on continue en ligne */ }
      if (!vivant) return;
      await rafraichir();
      setFileChargee(true);
      await synchroniserMaintenant();
    })();
    return () => { vivant = false; };
  }, [identite, rafraichir, synchroniserMaintenant]);

  // Réseau : l'événement `online` est le déclencheur naturel de la reprise.
  useEffect(() => {
    // La sonde est asynchrone : l'état n'est donc jamais posé pendant l'effet lui-même,
    // ce qui éviterait un rendu en cascade. `navigator.onLine === false` tranche vite,
    // `true` demande confirmation.
    let vivant = true;
    void (navigator.onLine ? reseauJoignable() : Promise.resolve(false))
      .then((joignable) => { if (vivant) setEnLigne(joignable); });
    const retour = () => { void synchroniserMaintenant(); };
    const perte = () => setEnLigne(false);
    window.addEventListener("online", retour);
    window.addEventListener("offline", perte);
    return () => {
      vivant = false;
      window.removeEventListener("online", retour);
      window.removeEventListener("offline", perte);
    };
  }, [synchroniserMaintenant]);

  const enregistrerBrouillon = useCallback(async (
    brouillon: BrouillonMutation, photo?: Blob | null,
  ) => {
    if (!identite) throw new Error("Aucune identité locale : impossible d’enregistrer.");
    const mutation = creerMutation(brouillon, { etat: "brouillon" });
    await enregistrerMutation(identite, mutation, photo ?? null);
    await rafraichir();
    return mutation;
  }, [identite, rafraichir]);

  const soumettre = useCallback(async (
    brouillon: BrouillonMutation, photo?: Blob | null,
  ) => {
    if (!identite) throw new Error("Aucune identité locale : impossible d’enregistrer.");
    const mutation = creerMutation(brouillon, { etat: "en_attente" });
    await enregistrerMutation(identite, mutation, photo ?? null);
    await rafraichir();
    void synchroniserMaintenant();
    return mutation;
  }, [identite, rafraichir, synchroniserMaintenant]);

  const soumettreBrouillon = useCallback(async (id: string) => {
    if (!identite) return;
    await changerEtat(identite, id, "en_attente");
    await rafraichir();
    void synchroniserMaintenant();
  }, [identite, rafraichir, synchroniserMaintenant]);

  const reessayer = useCallback(async (id: string) => {
    if (!identite) return;
    await remettreEnFile(identite, id);
    await rafraichir();
    void synchroniserMaintenant();
  }, [identite, rafraichir, synchroniserMaintenant]);

  const annuler = useCallback(async (id: string) => {
    if (!identite) return;
    await changerEtat(identite, id, "annule");
    await rafraichir();
  }, [identite, rafraichir]);

  const oublier = useCallback(async (id: string) => {
    if (!identite) return;
    await supprimerMutation(identite, id);
    await rafraichir();
  }, [identite, rafraichir]);

  const pret = identite === null || fileChargee;

  const valeur = useMemo<EtatAtelier>(() => ({
    identite, enLigne, pret, mutations,
    enSuspens: mutations.filter((m) => estEnSuspens(m.etat)).length,
    synchronisationEnCours,
    soumettre, enregistrerBrouillon, soumettreBrouillon,
    reessayer, annuler, oublier, synchroniserMaintenant, rafraichir,
  }), [
    identite, enLigne, pret, mutations, synchronisationEnCours,
    soumettre, enregistrerBrouillon, soumettreBrouillon,
    reessayer, annuler, oublier, synchroniserMaintenant, rafraichir,
  ]);

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}
