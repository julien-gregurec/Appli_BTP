/**
 * Double en mémoire des RPC `consommer_rate_limit` / `consulter_rate_limit`
 * (mêmes fenêtres fixes alignées sur l'epoch, même sémantique autorise /
 * restant / reessayer_apres, même journal à maximum + 1). L'horloge est pilotée
 * par le test pour simuler des fenêtres de 10 minutes à 24 heures.
 */
export function creerRateLimitMemoire(horlogeInitialeSecondes = 1_800_000_000) {
  let horloge = horlogeInitialeSecondes;
  const compteurs = new Map<string, number>();
  const journal: Array<{ cle: string; identifiant_hash: string; compteur: number; maximum: number }> = [];
  const appels: Array<{ nom: string; cle: string }> = [];
  let panne = false;

  const rpc = async (nom: string, p: Record<string, unknown>) => {
    const cle = String(p.p_cle);
    const hash = String(p.p_identifiant_hash);
    const fenetreSecondes = Number(p.p_fenetre_secondes);
    const maximum = Number(p.p_maximum);
    appels.push({ nom, cle });
    if (panne) return { data: null, error: { message: "panne simulée" } };
    if (!/^[0-9a-f]{64}$/.test(hash)) return { data: null, error: { message: "Paramètres de rate limit invalides" } };
    const debut = Math.floor(horloge / fenetreSecondes) * fenetreSecondes;
    const id = `${cle}|${hash}|${debut}`;
    const reessayer_apres = Math.max(1, Math.ceil(debut + fenetreSecondes - horloge));
    if (nom === "consulter_rate_limit") {
      const compteur = compteurs.get(id) ?? 0;
      return { data: [{ autorise: compteur < maximum, restant: Math.max(0, maximum - compteur), reessayer_apres }], error: null };
    }
    if (nom === "consommer_rate_limit") {
      const compteur = (compteurs.get(id) ?? 0) + 1;
      compteurs.set(id, compteur);
      if (compteur === maximum + 1) journal.push({ cle, identifiant_hash: hash, compteur, maximum });
      return { data: [{ autorise: compteur <= maximum, restant: Math.max(0, maximum - compteur), reessayer_apres }], error: null };
    }
    return { data: null, error: { message: `RPC inconnue ${nom}` } };
  };

  return {
    client: { rpc },
    journal,
    appels,
    compteurs,
    avancer(secondes: number) { horloge += secondes; },
    tomberEnPanne(valeur = true) { panne = valeur; },
  };
}
