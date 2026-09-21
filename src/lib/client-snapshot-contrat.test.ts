import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CLIENT_CATEGORIES,
  CLIENT_SCHEMA_VERSIONS,
  renderRecipientBlock,
  validateDocumentRecipientSnapshot,
} from "@elsatia/client-contracts";

import {
  CORRESPONDANCE_SNAPSHOT_SQL_V1,
  VERSION_SNAPSHOT_SQL_SUPPORTEE,
  versContratDestinataire,
  versIsoUtc,
  versSnapshotSqlV1,
  type IdentiteDestinataireGP,
} from "@/lib/client-snapshot-contrat";
import { identiteClientDocument, type ClientSnapshot } from "@/lib/client-snapshot";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260908000272_client_document_snapshot_v1.sql",
);

const TENANT = "11111111-1111-4111-8111-111111111111";
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CAPTUREE_LE = "2026-03-01T09:00:00.000Z";

function snapshotProfessionnel(surcharges: Partial<ClientSnapshot> = {}): ClientSnapshot {
  return {
    version: 1,
    client_id: CLIENT,
    provenance: "emission",
    nom_affiche: "MENUISERIE MULLER",
    reference_interne: "CLI-0042",
    type: "professionnel",
    statut: "actif",
    nom: "Muller",
    prenom: "Claire",
    societe: "MENUISERIE MULLER",
    raison_sociale: "MENUISERIE MULLER SAS",
    nom_commercial: null,
    forme_juridique: null,
    siret: "73282932000009",
    numero_tva: null,
    adresse_facturation: "12 rue des Tanneurs",
    adresse_complement: null,
    code_postal: "67000",
    ville: "Strasbourg",
    pays: null,
    telephone: "0388123456",
    email: "contact@muller.example.fr",
    conditions_paiement: "30 jours fin de mois",
    contact: { nom: "Claire Muller", fonction: "Conductrice de travaux", telephone: "0388123456", email: "claire@muller.example.fr" },
    ...surcharges,
  };
}

function snapshotParticulier(surcharges: Partial<ClientSnapshot> = {}): ClientSnapshot {
  return {
    version: 1,
    client_id: CLIENT,
    provenance: "emission",
    nom_affiche: "Jean Dupont",
    reference_interne: "CLI-0001",
    type: "particulier",
    statut: "prospect",
    nom: "Dupont",
    prenom: "Jean",
    societe: null,
    raison_sociale: null,
    nom_commercial: null,
    forme_juridique: null,
    siret: null,
    numero_tva: null,
    adresse_facturation: "8 rue du Marché",
    adresse_complement: null,
    code_postal: "67000",
    ville: "Strasbourg",
    pays: null,
    telephone: null,
    email: "jean.dupont@example.fr",
    conditions_paiement: null,
    contact: null,
    ...surcharges,
  };
}

function convertir(snapshot: ClientSnapshot, captureeLe: unknown = CAPTUREE_LE): IdentiteDestinataireGP {
  const resultat = versContratDestinataire({ snapshot, tenantId: TENANT, captureeLe });
  if (!resultat.ok) {
    throw new Error(`conversion refusée : ${resultat.issues.map((i) => `${i.path}:${i.code}`).join(", ")}`);
  }
  return resultat.value;
}

// ---------------------------------------------------------------------------
// Symétrie avec le SQL réel — le test qui empêche la dérive
// ---------------------------------------------------------------------------

describe("symétrie avec la migration 20260908000272", () => {
  /**
   * Extrait du texte de la migration l'ensemble exact des clés que le SQL peut
   * produire : la liste blanche `v_champs`, les clés ajoutées par
   * `jsonb_build_object` dans `construire_client_snapshot`, plus les deux clés
   * posées après coup (`identite_incertaine` par le backfill, `herite_de` par
   * l'héritage d'avoir).
   */
  function clesProduitesParLeSql(): ReadonlySet<string> {
    const sql = readFileSync(MIGRATION, "utf8");

    const listeBlanche = /v_champs text\[\] := array\[([\s\S]*?)\];/.exec(sql);
    expect(listeBlanche).not.toBeNull();
    const cles = new Set(
      [...(listeBlanche?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string),
    );

    const construction = /return v_snapshot \|\| jsonb_build_object\(([\s\S]*?)\n  \);/.exec(sql);
    expect(construction).not.toBeNull();
    for (const m of (construction?.[1] ?? "").matchAll(/'([a-z_]+)',/g)) cles.add(m[1] as string);

    cles.add("identite_incertaine");
    cles.add("herite_de");
    return cles;
  }

  it("le registre de correspondance couvre exactement les clés produites par le SQL", () => {
    const produites = clesProduitesParLeSql();
    const enregistrees = new Set(Object.keys(CORRESPONDANCE_SNAPSHOT_SQL_V1));

    const oubliees = [...produites].filter((cle) => !enregistrees.has(cle)).sort();
    const inventees = [...enregistrees].filter((cle) => !produites.has(cle)).sort();

    expect(oubliees).toEqual([]);
    expect(inventees).toEqual([]);
  });

  it("le SQL produit bien les 26 clés attendues", () => {
    expect(clesProduitesParLeSql().size).toBe(26);
  });

  it("aucune clé n'est perdue : chacune est portée par le contrat, nommée, ou conservée verbatim", () => {
    // Snapshot maximal : backfill ET héritage d'avoir, pour que les deux clés
    // conditionnelles du SQL soient présentes en même temps que les 24 autres.
    const identite = convertir(
      snapshotProfessionnel({
        provenance: "herite_facture_origine",
        identite_incertaine: true,
        pays: "FR",
        nom_commercial: "Muller Agencement",
        forme_juridique: "SAS",
        numero_tva: "FR44732829320",
        adresse_complement: "Bâtiment C",
        herite_de: { facture_id: "ffffffff-ffff-4fff-8fff-ffffffffffff", numero: "FA-2026-0031" },
      }),
    );
    const reconstruit = versSnapshotSqlV1(identite) as unknown as Record<string, unknown>;

    for (const cle of Object.keys(CORRESPONDANCE_SNAPSHOT_SQL_V1)) {
      expect(reconstruit).toHaveProperty(cle);
    }
  });

  it("la version numérique stockée et la version de schéma du contrat se correspondent", () => {
    const identite = convertir(snapshotProfessionnel());
    expect(identite.contrat.schemaVersion).toBe(CLIENT_SCHEMA_VERSIONS.documentRecipientSnapshot);
    expect(versSnapshotSqlV1(identite).version).toBe(VERSION_SNAPSHOT_SQL_SUPPORTEE);
  });

  it("le CHECK SQL de clients.type couvre exactement les catégories du contrat", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260710000004_clients_chantiers.sql"),
      "utf8",
    );
    const check = /type text not null default 'particulier'[\s\S]{0,200}?check \(type in \(([^)]+)\)\)/.exec(sql);
    expect(check).not.toBeNull();
    const valeurs = [...(check?.[1] ?? "").matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
    expect(valeurs).toEqual([...CLIENT_CATEGORIES].sort());
  });
});

// ---------------------------------------------------------------------------
// Aller-retour
// ---------------------------------------------------------------------------

describe("aller-retour stocké → contrat → stocké", () => {
  it("restitue à l'identique un professionnel complet", () => {
    const source = snapshotProfessionnel();
    expect(versSnapshotSqlV1(convertir(source))).toEqual(source);
  });

  it("restitue à l'identique un particulier sans contact ni identité légale", () => {
    const source = snapshotParticulier();
    expect(versSnapshotSqlV1(convertir(source))).toEqual(source);
  });

  it("restitue à l'identique un snapshot backfillé", () => {
    const source = snapshotProfessionnel({
      provenance: "backfill_identite_actuelle",
      identite_incertaine: true,
    });
    expect(versSnapshotSqlV1(convertir(source))).toEqual(source);
  });

  it("restitue à l'identique un avoir héritant de sa facture d'origine", () => {
    const source = snapshotProfessionnel({
      provenance: "herite_facture_origine",
      herite_de: { facture_id: "ffffffff-ffff-4fff-8fff-ffffffffffff", numero: "FA-2026-0031" },
    });
    expect(versSnapshotSqlV1(convertir(source))).toEqual(source);
  });

  it("distingue nom_commercial et societe au retour", () => {
    const source = snapshotProfessionnel({ nom_commercial: "Muller Agencement", societe: "MENUISERIE MULLER" });
    const identite = convertir(source);
    expect(identite.contrat.tradeName).toBe("Muller Agencement");
    expect(versSnapshotSqlV1(identite)).toEqual(source);
  });
});

// ---------------------------------------------------------------------------
// Noms de champs, types, nullables
// ---------------------------------------------------------------------------

describe("noms de champs et types", () => {
  it("mappe chaque champ d'identité sur son homologue du contrat", () => {
    const { contrat } = convertir(snapshotProfessionnel());
    expect(contrat.sourceClientId).toBe(CLIENT);
    expect(contrat.tenantId).toBe(TENANT);
    expect(contrat.reference).toBe("CLI-0042");
    expect(contrat.category).toBe("professionnel");
    expect(contrat.kind).toBe("company");
    expect(contrat.displayName).toBe("MENUISERIE MULLER");
    expect(contrat.legalName).toBe("MENUISERIE MULLER SAS");
    expect(contrat.tradeName).toBe("MENUISERIE MULLER");
    expect(contrat.lastName).toBe("Muller");
    expect(contrat.firstName).toBe("Claire");
    expect(contrat.email).toBe("contact@muller.example.fr");
    expect(contrat.phone).toBe("0388123456");
    expect(contrat.legal?.siret).toBe("73282932000009");
  });

  it("produit un contrat qui passe le validateur du paquet", () => {
    expect(validateDocumentRecipientSnapshot(convertir(snapshotProfessionnel()).contrat).ok).toBe(true);
    expect(validateDocumentRecipientSnapshot(convertir(snapshotParticulier()).contrat).ok).toBe(true);
  });

  it("rend null — et non une chaîne vide — pour un champ absent", () => {
    const { contrat } = convertir(snapshotParticulier());
    expect(contrat.legalName).toBeNull();
    expect(contrat.tradeName).toBeNull();
    expect(contrat.phone).toBeNull();
    expect(contrat.civility).toBeNull();
    expect(contrat.sourceClientUpdatedAt).toBeNull();
  });

  it("normalise l'horodatage PostgreSQL en ISO 8601 UTC accepté par le contrat", () => {
    // PostgREST rend un timestamptz sous cette forme ; le validateur du contrat
    // exige un Z et au plus trois décimales.
    expect(versIsoUtc("2026-03-01T10:00:04.123456+01:00")).toBe("2026-03-01T09:00:04.123Z");
    const identite = convertir(snapshotProfessionnel(), "2026-03-01T10:00:04.123456+01:00");
    expect(validateDocumentRecipientSnapshot(identite.contrat).ok).toBe(true);
  });

  it("refuse un horodatage de capture absent ou illisible", () => {
    for (const valeur of [null, undefined, "", "pas une date"]) {
      const resultat = versContratDestinataire({ snapshot: snapshotProfessionnel(), tenantId: TENANT, captureeLe: valeur });
      expect(resultat.ok).toBe(false);
    }
  });

  it("refuse une version de snapshot stocké inconnue plutôt que de deviner", () => {
    const resultat = versContratDestinataire({
      snapshot: snapshotProfessionnel({ version: 2 }),
      tenantId: TENANT,
      captureeLe: CAPTUREE_LE,
    });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.issues.map((i) => i.code)).toContain("unsupported_schema_version");
  });

  it("refuse un type de client hors des catégories du contrat", () => {
    const resultat = versContratDestinataire({
      snapshot: snapshotProfessionnel({ type: "association" }),
      tenantId: TENANT,
      captureeLe: CAPTUREE_LE,
    });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.issues.map((i) => i.code)).toContain("invalid_enum");
  });

  it("refuse un snapshot absent", () => {
    expect(versContratDestinataire({ snapshot: null, tenantId: TENANT, captureeLe: CAPTUREE_LE }).ok).toBe(false);
  });

  it("refuse un locataire qui n'est pas un UUID", () => {
    // Le locataire vient de la ligne du document, pas du JSON figé : le laisser
    // passer sans contrôle rendrait le contrat invérifiable une fois détaché.
    const resultat = versContratDestinataire({
      snapshot: snapshotProfessionnel(),
      tenantId: "entreprise-42",
      captureeLe: CAPTUREE_LE,
    });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.issues.map((i) => i.path)).toContain("tenantId");
  });

  it("refuse un client_id figé qui n'est pas un UUID", () => {
    const resultat = versContratDestinataire({
      snapshot: snapshotProfessionnel({ client_id: "CLI-0042" }),
      tenantId: TENANT,
      captureeLe: CAPTUREE_LE,
    });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.issues.map((i) => i.path)).toContain("sourceClientId");
  });
});

// ---------------------------------------------------------------------------
// Particulier / professionnel, adresse, contact
// ---------------------------------------------------------------------------

describe("particulier et professionnel", () => {
  it("n'attache aucune identité légale à un particulier", () => {
    expect(convertir(snapshotParticulier()).contrat.legal).toBeNull();
  });

  it("n'invente pas de SIREN depuis le SIRET figé", () => {
    // Le SIRET porte pourtant le SIREN : le dériver imprimerait demain une
    // mention absente du document d'hier.
    expect(convertir(snapshotProfessionnel()).contrat.legal?.siren).toBeNull();
  });

  it("rend legal null quand un professionnel n'a aucun identifiant légal figé", () => {
    const sans = snapshotProfessionnel({ siret: null, numero_tva: null, forme_juridique: null });
    expect(convertir(sans).contrat.legal).toBeNull();
  });
});

describe("adresse", () => {
  it("compose un bloc postal nu, avec le pays par défaut de l'écosystème", () => {
    const { contrat } = convertir(snapshotProfessionnel());
    expect(contrat.billingAddress).toEqual({
      line1: "12 rue des Tanneurs",
      line2: null,
      postalCode: "67000",
      city: "Strasbourg",
      region: null,
      country: "FR",
    });
  });

  it("respecte un pays explicitement figé", () => {
    expect(convertir(snapshotProfessionnel({ pays: "BE" })).contrat.billingAddress?.country).toBe("BE");
  });

  it("rend null quand aucune adresse n'a été figée", () => {
    const sans = snapshotProfessionnel({
      adresse_facturation: null,
      adresse_complement: null,
      code_postal: null,
      ville: null,
    });
    expect(convertir(sans).contrat.billingAddress).toBeNull();
  });
});

describe("contact", () => {
  it("traduit le contact figé sans perdre de champ", () => {
    expect(convertir(snapshotProfessionnel()).contrat.contact).toEqual({
      displayName: "Claire Muller",
      jobTitle: "Conductrice de travaux",
      email: "claire@muller.example.fr",
      phone: "0388123456",
    });
  });

  it("rend null pour un contact absent ou entièrement vide", () => {
    expect(convertir(snapshotParticulier()).contrat.contact).toBeNull();
    const vide = snapshotProfessionnel({ contact: { nom: null, fonction: null, telephone: null, email: null } });
    expect(convertir(vide).contrat.contact).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Champs hors contrat — la preuve d'absence de perte silencieuse
// ---------------------------------------------------------------------------

describe("champs hors contrat", () => {
  it("conserve verbatim ce que le contrat de destinataire ne porte pas", () => {
    const identite = convertir(snapshotProfessionnel());
    expect(identite.horsContrat).toEqual({
      statut: "actif",
      conditionsPaiement: "30 jours fin de mois",
      societe: "MENUISERIE MULLER",
      nomCommercial: null,
      paysFige: null,
    });
  });

  it("n'expose ni statut commercial ni conditions de paiement dans le contrat", () => {
    const { contrat } = convertir(snapshotProfessionnel());
    const cles = Object.keys(contrat);
    expect(cles).not.toContain("statut");
    expect(cles).not.toContain("status");
    expect(cles).not.toContain("conditionsPaiement");
  });

  it("transporte un statut client que le CHECK SQL ne connaît pas, sans le rejeter", () => {
    // `archive` existe dans CLIENT_STATUSES côté contrat mais pas dans le CHECK
    // de clients.statut. Comme le statut ne franchit pas le contrat, l'écart ne
    // bloque rien : la valeur voyage verbatim.
    expect(convertir(snapshotProfessionnel({ statut: "archive" })).horsContrat.statut).toBe("archive");
  });

  it("remonte la provenance et l'incertitude d'un document backfillé", () => {
    const identite = convertir(
      snapshotProfessionnel({ provenance: "backfill_identite_actuelle", identite_incertaine: true }),
    );
    expect(identite.provenance).toBe("backfill_identite_actuelle");
    expect(identite.identiteIncertaine).toBe(true);
  });

  it("remonte l'héritage d'un avoir", () => {
    const identite = convertir(
      snapshotProfessionnel({
        provenance: "herite_facture_origine",
        herite_de: { facture_id: "ffffffff-ffff-4fff-8fff-ffffffffffff", numero: "FA-2026-0031" },
      }),
    );
    expect(identite.heriteDe).toEqual({ factureId: "ffffffff-ffff-4fff-8fff-ffffffffffff", numero: "FA-2026-0031" });
  });
});

describe("compatibilité ascendante avec les colonnes client à venir", () => {
  // `nom_commercial`, `forme_juridique`, `numero_tva`, `adresse_complement` et
  // `pays` sont DÉJÀ dans la liste blanche de la migration 272, alors que les
  // colonnes correspondantes n'existent pas encore dans public.clients : elles
  // sont donc figées à null aujourd'hui. Le lot qui les créera
  // (docs/migrations-proposees/client-legal-fields-v1.sql.proposed, en attente
  // de la réconciliation du ledger) n'aura AUCUNE ligne de ce pont à changer.
  const cinqChamps = snapshotProfessionnel({
    nom_commercial: "Muller Agencement",
    forme_juridique: "SAS",
    numero_tva: "FR44732829320",
    adresse_complement: "Bâtiment C",
    pays: "FR",
  });

  it("porte les cinq champs dès que la base les renseignera, sans modification du pont", () => {
    const { contrat } = convertir(cinqChamps);
    expect(contrat.tradeName).toBe("Muller Agencement");
    expect(contrat.legal?.legalForm).toBe("SAS");
    expect(contrat.legal?.vatNumber).toBe("FR44732829320");
    expect(contrat.billingAddress?.line2).toBe("Bâtiment C");
    expect(contrat.billingAddress?.country).toBe("FR");
  });

  it("les rend tous null tant que les colonnes n'existent pas, sans échouer", () => {
    const { contrat } = convertir(snapshotProfessionnel());
    expect(contrat.legal?.legalForm).toBeNull();
    expect(contrat.legal?.vatNumber).toBeNull();
    expect(contrat.billingAddress?.line2).toBeNull();
    expect(validateDocumentRecipientSnapshot(contrat).ok).toBe(true);
  });

  it("reste réversible une fois les cinq champs renseignés", () => {
    expect(versSnapshotSqlV1(convertir(cinqChamps))).toEqual(cinqChamps);
  });
});

// ---------------------------------------------------------------------------
// Consommation sans relecture de public.clients
// ---------------------------------------------------------------------------

/**
 * Fiche client piégée : toute lecture d'une de ses propriétés lève. Passée aux
 * consommateurs à la place de la jointure `clients`, elle transforme « le code
 * ne devrait pas relire la fiche » en fait vérifié mécaniquement.
 */
function ficheInterdite(): never {
  return new Proxy(
    {},
    {
      get(_cible, propriete) {
        throw new Error(`public.clients relu après émission (propriété « ${String(propriete)} »)`);
      },
    },
  ) as never;
}

describe("PDF, e-mail et export consomment le contrat sans relire public.clients", () => {
  const snapshot = snapshotProfessionnel();

  it("le rendu PDF se compose entièrement depuis le snapshot", () => {
    const identite = identiteClientDocument({ snapshot, fiche: ficheInterdite(), captureeLe: CAPTUREE_LE });
    expect(identite.entete.nom_affiche).toBe("MENUISERIE MULLER");
    expect(identite.entete.adresse_facturation).toBe("12 rue des Tanneurs");
    expect(identite.entete.siret).toBe("73282932000009");
    expect(identite.origine).toBe("figee");
  });

  it("le bloc destinataire du contrat se rend sans aucune fiche client", () => {
    const { contrat } = convertir(snapshot);
    expect(renderRecipientBlock(contrat)).toEqual([
      "MENUISERIE MULLER",
      "À l'attention de Claire Muller (Conductrice de travaux)",
      "12 rue des Tanneurs",
      "67000 Strasbourg",
      "SIRET : 73282932000009",
    ]);
  });

  it("l'e-mail repart vers l'adresse figée, pas vers l'adresse courante", () => {
    const identite = identiteClientDocument({ snapshot, fiche: ficheInterdite(), captureeLe: CAPTUREE_LE });
    expect(identite.email).toBe("claire@muller.example.fr");
    expect(convertir(snapshot).contrat.contact?.email).toBe("claire@muller.example.fr");
  });

  it("l'export comptable se construit depuis le contrat seul", () => {
    const { contrat } = convertir(snapshot);
    const ligne = [contrat.reference, contrat.displayName, contrat.legal?.siret ?? "", contrat.billingAddress?.city ?? ""];
    expect(ligne).toEqual(["CLI-0042", "MENUISERIE MULLER", "73282932000009", "Strasbourg"]);
  });

  it("les deux chemins de rendu s'accordent sur ce qui est imprimé", () => {
    // Le chemin GP historique (`identiteClientDocument`) et le chemin canonique
    // doivent afficher le même destinataire : c'est ce qui autorise à migrer
    // l'un vers l'autre sans changer un seul document.
    const viaGp = identiteClientDocument({ snapshot, fiche: ficheInterdite(), captureeLe: CAPTUREE_LE }).entete;
    const { contrat } = convertir(snapshot);
    expect(viaGp.nom_affiche).toBe(contrat.displayName);
    expect(viaGp.adresse_facturation).toBe(contrat.billingAddress?.line1);
    expect(viaGp.code_postal).toBe(contrat.billingAddress?.postalCode);
    expect(viaGp.ville).toBe(contrat.billingAddress?.city);
    expect(viaGp.siret).toBe(contrat.legal?.siret);
  });

  it("s'accordent aussi sur un particulier backfillé", () => {
    const backfille = snapshotParticulier({ provenance: "backfill_identite_actuelle", identite_incertaine: true });
    const viaGp = identiteClientDocument({ snapshot: backfille, fiche: ficheInterdite(), captureeLe: CAPTUREE_LE });
    const identite = convertir(backfille);
    expect(viaGp.entete.nom_affiche).toBe(identite.contrat.displayName);
    expect(viaGp.origine).toBe("figee_reconstituee");
    expect(identite.identiteIncertaine).toBe(true);
  });
});
