/**
 * Coût réel d'une reconstruction (§13 du brief prototype).
 *
 * Formule, et rien d'autre :
 *
 *     coût = (durée GPU × prix horaire GPU)
 *          + (volume stocké × durée de rétention × prix stockage)
 *          + (volume sortant × prix egress)
 *
 * Deux garde-fous délibérés :
 *  1. **aucun tarif n'est codé en dur.** Les prix Scaleway/OVH changent et
 *     dépendent du contrat : ils sont fournis par l'appelant, avec leur date de
 *     relevé et leur source. Une valeur manquante lève une erreur, elle ne
 *     devient pas zéro ;
 *  2. **aucun tarif par crédits n'est calculable tant que les benchmarks ne sont
 *     pas exécutés** (§13). `convertirEnCredits` refuse de fonctionner sur des
 *     mesures simulées.
 */

export type TarifsInfrastructure = {
  fournisseur: string;
  region: string;
  /** Date de relevé des prix, format ISO. Un tarif sans date n'est pas un tarif. */
  releveLe: string | null;
  source: string | null;
  gpuCentimesParHeure: number | null;
  stockageCentimesParGoMois: number | null;
  egressCentimesParGo: number | null;
};

/**
 * Gabarit vide. Il est volontairement inutilisable : le prototype ne prétend
 * pas connaître les prix pratiqués, et aucun serveur facturé n'a été créé
 * (§14, §15).
 */
export const TARIFS_NON_RELEVES: TarifsInfrastructure = {
  fournisseur: "à choisir",
  region: "UE",
  releveLe: null,
  source: null,
  gpuCentimesParHeure: null,
  stockageCentimesParGoMois: null,
  egressCentimesParGo: null,
};

export class ErreurTarifManquant extends Error {
  readonly champs: string[];

  constructor(champs: string[]) {
    super(`Tarifs incomplets : ${champs.join(", ")}`);
    this.name = "ErreurTarifManquant";
    this.champs = champs;
  }
}

export type ConsommationReconstruction = {
  /** Durée d'occupation de la machine GPU, en secondes. */
  runtimeS: number;
  /** Volume conservé (entrées + artefacts), en Go. */
  stockageGo: number;
  /** Durée de rétention facturée, en mois. */
  retentionMois: number;
  /** Volume sortant (téléchargements client, restitution), en Go. */
  egressGo: number;
};

export type EstimationCout = {
  gpuCentimes: number;
  stockageCentimes: number;
  egressCentimes: number;
  totalCentimes: number;
  detail: string[];
};

export function verifierTarifs(tarifs: TarifsInfrastructure): string[] {
  const manques: string[] = [];
  if (tarifs.gpuCentimesParHeure === null) manques.push("gpuCentimesParHeure");
  if (tarifs.stockageCentimesParGoMois === null) manques.push("stockageCentimesParGoMois");
  if (tarifs.egressCentimesParGo === null) manques.push("egressCentimesParGo");
  if (tarifs.releveLe === null) manques.push("releveLe");
  return manques;
}

export function estimerCout(
  consommation: ConsommationReconstruction,
  tarifs: TarifsInfrastructure,
): EstimationCout {
  const manques = verifierTarifs(tarifs);
  if (manques.length > 0) throw new ErreurTarifManquant(manques);

  const heures = consommation.runtimeS / 3600;
  const gpuCentimes = heures * (tarifs.gpuCentimesParHeure as number);
  const stockageCentimes =
    consommation.stockageGo * consommation.retentionMois * (tarifs.stockageCentimesParGoMois as number);
  const egressCentimes = consommation.egressGo * (tarifs.egressCentimesParGo as number);

  return {
    gpuCentimes,
    stockageCentimes,
    egressCentimes,
    totalCentimes: gpuCentimes + stockageCentimes + egressCentimes,
    detail: [
      `GPU : ${heures.toFixed(3)} h × ${tarifs.gpuCentimesParHeure} c/h = ${gpuCentimes.toFixed(2)} c`,
      `Stockage : ${consommation.stockageGo} Go × ${consommation.retentionMois} mois × ` +
        `${tarifs.stockageCentimesParGoMois} c = ${stockageCentimes.toFixed(2)} c`,
      `Egress : ${consommation.egressGo} Go × ${tarifs.egressCentimesParGo} c = ${egressCentimes.toFixed(2)} c`,
      `Tarifs ${tarifs.fournisseur}/${tarifs.region} relevés le ${tarifs.releveLe} (${tarifs.source ?? "source non citée"})`,
    ],
  };
}

export class TarificationPrematureeError extends Error {
  constructor(raison: string) {
    super(`Tarification par crédits impossible : ${raison}`);
    this.name = "TarificationPrematureeError";
  }
}

export type ReferentielCredits = {
  /** Mesures issues d'exécutions réelles sur GPU. Faux = simulation ou fixture. */
  mesuresReelles: boolean;
  /** Nombre de reconstructions réellement mesurées. */
  echantillons: number;
  centimesParCredit: number | null;
};

/**
 * §13 — convertir un coût en crédits exige des benchmarks réels. Tant qu'ils
 * n'existent pas, cette fonction lève : c'est le seul moyen d'empêcher un
 * tarif d'être annoncé avant d'être mesuré.
 */
export function convertirEnCredits(
  estimation: EstimationCout,
  referentiel: ReferentielCredits,
): number {
  if (!referentiel.mesuresReelles) {
    throw new TarificationPrematureeError("aucune mesure réelle sur GPU (§12 non exécuté)");
  }
  if (referentiel.echantillons < 3) {
    throw new TarificationPrematureeError(
      `${referentiel.echantillons} échantillon(s) mesuré(s), 3 jeux minimum attendus (small/medium/large)`,
    );
  }
  if (referentiel.centimesParCredit === null || referentiel.centimesParCredit <= 0) {
    throw new TarificationPrematureeError("valeur du crédit non définie");
  }
  return estimation.totalCentimes / referentiel.centimesParCredit;
}
