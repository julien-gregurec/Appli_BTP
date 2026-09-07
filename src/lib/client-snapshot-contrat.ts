// ELSATIA-GP-CLIENT-CONTRACTS-SNAPSHOT-INTEGRATION-V1
//
// Pont entre le snapshot destinataire **stocké** par Gestion Pro et le contrat
// **canonique** de l'écosystème.
//
// Constat d'audit : les deux lots ont produit deux modèles qui portent le même
// nom et ne partagent AUCUN nom de propriété.
//
//   stocké  (migration 20260908000272) : plat, français, snake_case,
//                                        `version: 1` numérique
//   contrat (@elsatia/client-contracts) : imbriqué, anglais, camelCase,
//                                        `schemaVersion: "…/1"` textuel
//
// Aucun des deux n'est « le bon » :
//
//  * le stocké est **figé en base**. La migration 272 pose une garde
//    d'immuabilité (`verrouiller_client_snapshot`) qui interdit toute
//    réécriture d'un snapshot renseigné, sur tout chemin d'écriture. Les
//    snapshots déjà capturés et backfillés ne PEUVENT plus changer de forme :
//    réécrire leur schéma exigerait de lever la garde qui fait tout l'intérêt
//    du lot. C'est donc la forme de stockage, définitivement.
//  * le contrat est la forme d'**échange** : c'est lui que Réserves, Drone et
//    tout futur consommateur liront, et lui qui porte la version de schéma, la
//    validation et le rendu autonome.
//
// D'où ce module : une conversion **totale, pure et sans perte** du stocké vers
// le contrat, et son inverse exact. Le mécanisme SQL validé n'est pas touché ;
// aucun type n'est dupliqué — `ClientSnapshot` (client-snapshot.ts) reste la
// seule déclaration de la forme stockée, `ClientDocumentRecipientSnapshot`
// (paquet) reste la seule déclaration de la forme d'échange.
//
// Règle cardinale : **aucune conversion silencieuse ne perd un champ**. Toute
// clé produite par le SQL est soit portée par le contrat, soit un champ nommé
// du résultat, soit conservée verbatim dans `horsContrat`. La table
// `CORRESPONDANCE_SNAPSHOT_SQL_V1` en est le registre, et un test la confronte
// au texte de la migration elle-même.

import {
  CLIENT_CONTRACT_VERSION,
  CLIENT_SCHEMA_VERSIONS,
  DEFAULT_COUNTRY_CODE,
  deriveClientKind,
  isClientCategory,
  isPostalAddressEmpty,
  validateDocumentRecipientSnapshot,
  type ClientCategory,
  type ClientDocumentRecipientSnapshot,
  type ClientValidationIssue,
  type ClientValidationResult,
  type PostalAddress,
  type SnapshotContact,
  type SnapshotLegalIdentity,
} from "@elsatia/client-contracts";

import type { ClientSnapshot } from "@/lib/client-snapshot";

/** Version numérique du snapshot stocké que ce pont sait lire. */
export const VERSION_SNAPSHOT_SQL_SUPPORTEE = 1;

/**
 * Provenance de l'identité figée, telle que la pose la migration 272.
 * `backfill_identite_actuelle` s'accompagne toujours de `identite_incertaine`.
 */
export type ProvenanceSnapshot =
  | "emission"
  | "backfill_identite_actuelle"
  | "herite_facture_origine";

/** Champs du snapshot stocké qu'aucun champ du contrat canonique ne peut porter. */
export type ChampsHorsContrat = {
  /** `clients.statut` — statut commercial. Volontairement hors d'une pièce comptable. */
  readonly statut: string | null;
  /** `clients.conditions_paiement` — règle commerciale GP, pas une identité. */
  readonly conditionsPaiement: string | null;
  /** `clients.societe`, conservé séparément de `nom_commercial` pour un retour exact. */
  readonly societe: string | null;
  /** `clients.nom_commercial` — colonne absente aujourd'hui, donc toujours null. */
  readonly nomCommercial: string | null;
  /**
   * `clients.pays` tel que réellement figé — le plus souvent `null`, la colonne
   * n'existant pas encore. Conservé brut parce que le contrat, lui, impose un
   * pays non nul : sans cette valeur, on ne saurait plus distinguer « pays non
   * renseigné » de « France explicitement figée ».
   */
  readonly paysFige: string | null;
};

/**
 * Identité destinataire d'un document GP, exprimée dans le contrat canonique et
 * augmentée des métadonnées de capture propres à Gestion Pro.
 */
export type IdentiteDestinataireGP = {
  readonly contrat: ClientDocumentRecipientSnapshot;
  readonly provenance: ProvenanceSnapshot | null;
  /** `true` : identité reconstituée par le backfill, non observée à l'émission. */
  readonly identiteIncertaine: boolean;
  /** Avoir ayant hérité du destinataire de sa facture d'origine. */
  readonly heriteDe: { readonly factureId: string | null; readonly numero: string | null } | null;
  readonly horsContrat: ChampsHorsContrat;
};

type CibleCorrespondance = "contrat" | "gp" | "horsContrat";

/**
 * Registre de correspondance clé SQL → destination. Exhaustif par construction :
 * `client-snapshot-contrat.test.ts` extrait la liste des clés du texte de la
 * migration 272 et vérifie que ce registre la couvre exactement, dans les deux
 * sens. Ajouter une colonne à la liste blanche SQL sans l'ajouter ici fait
 * échouer le test — c'est le garde-fou contre la dérive silencieuse.
 */
export const CORRESPONDANCE_SNAPSHOT_SQL_V1: Readonly<
  Record<string, { readonly cible: CibleCorrespondance; readonly chemin: string }>
> = {
  version: { cible: "contrat", chemin: "schemaVersion" },
  client_id: { cible: "contrat", chemin: "sourceClientId" },
  nom_affiche: { cible: "contrat", chemin: "displayName" },
  reference_interne: { cible: "contrat", chemin: "reference" },
  type: { cible: "contrat", chemin: "category" },
  nom: { cible: "contrat", chemin: "lastName" },
  prenom: { cible: "contrat", chemin: "firstName" },
  raison_sociale: { cible: "contrat", chemin: "legalName" },
  forme_juridique: { cible: "contrat", chemin: "legal.legalForm" },
  siret: { cible: "contrat", chemin: "legal.siret" },
  numero_tva: { cible: "contrat", chemin: "legal.vatNumber" },
  adresse_facturation: { cible: "contrat", chemin: "billingAddress.line1" },
  adresse_complement: { cible: "contrat", chemin: "billingAddress.line2" },
  code_postal: { cible: "contrat", chemin: "billingAddress.postalCode" },
  ville: { cible: "contrat", chemin: "billingAddress.city" },
  // Alimente `billingAddress.country` (avec repli sur le pays par défaut) tout
  // en étant conservé brut, seule façon de revenir à la valeur stockée.
  pays: { cible: "horsContrat", chemin: "paysFige" },
  telephone: { cible: "contrat", chemin: "phone" },
  email: { cible: "contrat", chemin: "email" },
  contact: { cible: "contrat", chemin: "contact" },
  provenance: { cible: "gp", chemin: "provenance" },
  identite_incertaine: { cible: "gp", chemin: "identiteIncertaine" },
  herite_de: { cible: "gp", chemin: "heriteDe" },
  statut: { cible: "horsContrat", chemin: "statut" },
  conditions_paiement: { cible: "horsContrat", chemin: "conditionsPaiement" },
  societe: { cible: "horsContrat", chemin: "societe" },
  nom_commercial: { cible: "horsContrat", chemin: "nomCommercial" },
};

function texte(valeur: unknown): string | null {
  if (typeof valeur !== "string") return null;
  const nettoye = valeur.trim();
  return nettoye.length === 0 ? null : nettoye;
}

/**
 * Ramène un horodatage PostgreSQL à la forme exigée par le contrat.
 *
 * Nécessaire, et pas cosmétique : PostgREST rend un `timestamptz` sous la forme
 * `2026-09-08T20:26:04.123456+00:00`, que le validateur du contrat refuse (il
 * exige un `Z` et au plus trois décimales). Sans cette normalisation, tout
 * snapshot réel échouerait la validation alors que sa donnée est correcte.
 */
export function versIsoUtc(valeur: unknown): string | null {
  if (typeof valeur !== "string" && !(valeur instanceof Date)) return null;
  const date = valeur instanceof Date ? valeur : new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function categorieDepuisType(valeur: unknown): ClientCategory | null {
  return isClientCategory(valeur) ? valeur : null;
}

function contactDepuisSql(contact: ClientSnapshot["contact"]): SnapshotContact | null {
  if (contact === null || contact === undefined) return null;
  const nom = texte(contact.nom);
  const fonction = texte(contact.fonction);
  const email = texte(contact.email);
  const telephone = texte(contact.telephone);
  if (nom === null && fonction === null && email === null && telephone === null) return null;
  return { displayName: nom ?? "", jobTitle: fonction, email, phone: telephone };
}

function adresseDepuisSql(snapshot: ClientSnapshot): PostalAddress | null {
  const adresse: PostalAddress = {
    line1: texte(snapshot.adresse_facturation),
    line2: texte(snapshot.adresse_complement),
    postalCode: texte(snapshot.code_postal),
    city: texte(snapshot.ville),
    // `clients` n'a pas de colonne de région : l'information n'a jamais été
    // saisie, donc jamais imprimée. Rendre null est exact, pas approximatif.
    region: null,
    // `pays` est dans la liste blanche mais la colonne n'existe pas encore :
    // la valeur est donc null en pratique. Le contrat impose un pays non nul ;
    // on retient le défaut de l'écosystème, qui est aussi le seul pays que
    // Gestion Pro sache facturer aujourd'hui.
    country: texte(snapshot.pays) ?? DEFAULT_COUNTRY_CODE,
  };
  return isPostalAddressEmpty(adresse) ? null : adresse;
}

function identiteLegaleDepuisSql(
  snapshot: ClientSnapshot,
  categorie: ClientCategory,
): SnapshotLegalIdentity | null {
  if (deriveClientKind(categorie) === "individual") return null;

  const legal: SnapshotLegalIdentity = {
    legalForm: texte(snapshot.forme_juridique),
    // `clients` n'a pas de colonne SIREN. Il serait dérivable du SIRET, mais un
    // snapshot documentaire ne doit rien porter qui n'ait pas été observé à
    // l'émission : imprimer demain un SIREN qui ne figurait pas sur le document
    // d'hier serait exactement la dérive que ce lot combat.
    siren: null,
    siret: texte(snapshot.siret),
    vatNumber: texte(snapshot.numero_tva),
    registrationNumber: null,
    registrationCity: null,
    shareCapital: null,
  };

  const vide =
    legal.legalForm === null && legal.siret === null && legal.vatNumber === null;
  return vide ? null : legal;
}

/**
 * Convertit un snapshot stocké en identité destinataire canonique.
 *
 * `tenantId` et `capturedAt` ne figurent pas dans le JSON stocké : ils sont
 * portés par la ligne du document (`entreprise_id`, `client_snapshot_at`) et
 * doivent donc être fournis par l'appelant. C'est volontaire côté SQL — le
 * locataire y est une **contrainte de capture** (`construire_client_snapshot`
 * ne lit le client que s'il appartient à `p_entreprise_id`), pas une donnée
 * recopiée. Le contrat, lui, doit le porter pour être vérifiable une fois
 * détaché de sa ligne.
 */
export function versContratDestinataire(params: {
  snapshot: unknown;
  tenantId: string;
  captureeLe: unknown;
}): ClientValidationResult<IdentiteDestinataireGP> {
  const anomalies: ClientValidationIssue[] = [];

  if (typeof params.snapshot !== "object" || params.snapshot === null || Array.isArray(params.snapshot)) {
    return {
      ok: false,
      issues: [{ path: "", code: "invalid_type", message: "snapshot destinataire absent ou mal formé" }],
    };
  }

  const snapshot = params.snapshot as ClientSnapshot;

  // Version : refus explicite plutôt que lecture optimiste. Un snapshot de
  // version inconnue est un snapshot dont on ignore la sémantique des champs.
  if (snapshot.version !== undefined && snapshot.version !== VERSION_SNAPSHOT_SQL_SUPPORTEE) {
    anomalies.push({
      path: "version",
      code: "unsupported_schema_version",
      message: `version de snapshot stocké non supportée : ${String(snapshot.version)}`,
    });
  }

  const capturedAt = versIsoUtc(params.captureeLe);
  if (capturedAt === null) {
    anomalies.push({
      path: "capturedAt",
      code: "required",
      message: "client_snapshot_at est obligatoire pour exposer le contrat canonique",
    });
  }

  const categorie = categorieDepuisType(snapshot.type);
  if (categorie === null) {
    anomalies.push({
      path: "category",
      code: "invalid_enum",
      message: `type de client inconnu dans le snapshot stocké : ${String(snapshot.type)}`,
    });
  }

  if (anomalies.length > 0) return { ok: false, issues: anomalies };

  const categorieRetenue = categorie as ClientCategory;
  const provenance = texte(snapshot.provenance) as ProvenanceSnapshot | null;

  const contrat: ClientDocumentRecipientSnapshot = {
    schemaVersion: CLIENT_SCHEMA_VERSIONS.documentRecipientSnapshot,
    contractVersion: CLIENT_CONTRACT_VERSION,
    capturedAt: capturedAt as string,
    sourceApp: "gestion_pro",
    tenantId: params.tenantId as ClientDocumentRecipientSnapshot["tenantId"],
    sourceClientId: (texte(snapshot.client_id) ?? null) as ClientDocumentRecipientSnapshot["sourceClientId"],
    // `clients.updated_at` n'est pas dans la liste blanche de la migration 272 :
    // l'âge de la fiche au moment de la capture n'a pas été observé. Null est
    // la seule réponse honnête.
    sourceClientUpdatedAt: null,
    reference: texte(snapshot.reference_interne),
    category: categorieRetenue,
    kind: deriveClientKind(categorieRetenue),
    // Nom figé **tel qu'imprimé**, jamais recalculé : le contrat ne recompose un
    // nom d'affichage que sur une fiche vivante, pas sur un snapshot. Un
    // document émis avant l'arbitrage particulier/professionnel doit continuer
    // d'afficher ce qu'il affichait.
    displayName: texte(snapshot.nom_affiche) ?? "(sans nom)",
    legalName: texte(snapshot.raison_sociale),
    // Arbitrage du doublon relevé par l'audit : `raison_sociale` = dénomination
    // légale, `societe` = nom commercial. `nom_commercial` prime dès que la
    // colonne existera ; les deux valeurs brutes restent dans `horsContrat`
    // pour que le retour vers le SQL soit exact.
    tradeName: texte(snapshot.nom_commercial) ?? texte(snapshot.societe),
    // `clients` n'a pas de colonne de civilité.
    civility: null,
    firstName: texte(snapshot.prenom),
    lastName: texte(snapshot.nom),
    email: texte(snapshot.email),
    phone: texte(snapshot.telephone),
    legal: identiteLegaleDepuisSql(snapshot, categorieRetenue),
    billingAddress: adresseDepuisSql(snapshot),
    contact: contactDepuisSql(snapshot.contact),
  };

  const validation = validateDocumentRecipientSnapshot(contrat);
  if (!validation.ok) return validation;

  return {
    ok: true,
    value: {
      contrat,
      provenance,
      identiteIncertaine: snapshot.identite_incertaine === true,
      heriteDe:
        snapshot.herite_de === null || snapshot.herite_de === undefined
          ? null
          : { factureId: texte(snapshot.herite_de.facture_id), numero: texte(snapshot.herite_de.numero) },
      horsContrat: {
        statut: texte(snapshot.statut),
        conditionsPaiement: texte(snapshot.conditions_paiement),
        societe: texte(snapshot.societe),
        nomCommercial: texte(snapshot.nom_commercial),
        paysFige: texte(snapshot.pays),
      },
    },
  };
}

/**
 * Reconstruit la forme stockée depuis l'identité canonique.
 *
 * N'écrit rien et n'est **pas** destinée à la production — la capture reste le
 * fait du déclencheur base, seul point que rien ne contourne. Elle existe pour
 * que la symétrie des deux formes soit démontrable par aller-retour : c'est le
 * test qui prouve qu'aucun champ n'est perdu en chemin.
 */
export function versSnapshotSqlV1(identite: IdentiteDestinataireGP): ClientSnapshot {
  const { contrat, horsContrat } = identite;
  const adresse = contrat.billingAddress;

  // `identite_incertaine` et `herite_de` ne sont posés par le SQL que dans leur
  // cas déclencheur (backfill, avoir hérité) : les émettre systématiquement à
  // `false` / `null` inventerait deux clés que la base ne stocke pas.
  const marqueurs: Pick<ClientSnapshot, "identite_incertaine" | "herite_de"> = {
    ...(identite.identiteIncertaine ? { identite_incertaine: true } : {}),
    ...(identite.heriteDe === null
      ? {}
      : { herite_de: { facture_id: identite.heriteDe.factureId, numero: identite.heriteDe.numero } }),
  };

  return {
    ...marqueurs,
    version: VERSION_SNAPSHOT_SQL_SUPPORTEE,
    client_id: contrat.sourceClientId,
    provenance: identite.provenance,
    nom_affiche: contrat.displayName,
    reference_interne: contrat.reference,
    type: contrat.category,
    statut: horsContrat.statut,
    nom: contrat.lastName,
    prenom: contrat.firstName,
    societe: horsContrat.societe,
    raison_sociale: contrat.legalName,
    nom_commercial: horsContrat.nomCommercial,
    forme_juridique: contrat.legal?.legalForm ?? null,
    siret: contrat.legal?.siret ?? null,
    numero_tva: contrat.legal?.vatNumber ?? null,
    adresse_facturation: adresse?.line1 ?? null,
    adresse_complement: adresse?.line2 ?? null,
    code_postal: adresse?.postalCode ?? null,
    ville: adresse?.city ?? null,
    pays: horsContrat.paysFige,
    telephone: contrat.phone,
    email: contrat.email,
    conditions_paiement: horsContrat.conditionsPaiement,
    contact:
      contrat.contact === null
        ? null
        : {
            nom: contrat.contact.displayName === "" ? null : contrat.contact.displayName,
            fonction: contrat.contact.jobTitle,
            telephone: contrat.contact.phone,
            email: contrat.contact.email,
          },
  };
}
