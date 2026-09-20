import { describe, expect, it } from "vitest";
import { listerFichiersEntreprise, purgerStorageEntreprise, purgeStorageReussie, BUCKETS_RGPD } from "./storage";

type Entree = { name: string; id: string | null };

// Simule le strict nécessaire de l'API Storage Supabase (list/remove) avec un
// petit système de fichiers en mémoire, pour ne pas dépendre d'un vrai projet
// Supabase dans les tests unitaires. Deux conventions de chemin réellement
// utilisées dans le code sont représentées : "{entrepriseId}/..." et
// "companies/{entrepriseId}/exports/..." (notes-frais-exports).
function creerAdminSimule(fs: Record<string, Record<string, Entree[]>>) {
  const supprimes: Record<string, string[]> = {};
  return {
    admin: {
      storage: {
        from(bucket: string) {
          return {
            async list(prefix: string, opts?: { limit?: number; offset?: number }) {
              const entrees = fs[bucket]?.[prefix] ?? [];
              const offset = opts?.offset ?? 0;
              const limit = opts?.limit ?? entrees.length;
              return { data: entrees.slice(offset, offset + limit), error: null };
            },
            async remove(paths: string[]) {
              supprimes[bucket] = [...(supprimes[bucket] ?? []), ...paths];
              for (const chemin of paths) {
                const dernierSlash = chemin.lastIndexOf("/");
                const prefixe = dernierSlash === -1 ? "" : chemin.slice(0, dernierSlash);
                const nom = chemin.slice(dernierSlash + 1);
                if (fs[bucket]?.[prefixe]) {
                  fs[bucket][prefixe] = fs[bucket][prefixe].filter((e) => e.name !== nom);
                }
              }
              return { data: paths.map((name) => ({ name })), error: null };
            },
          };
        },
      },
    } as unknown as Parameters<typeof listerFichiersEntreprise>[0],
    supprimes,
  };
}

const ENTREPRISE_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ENTREPRISE_B = "bbbbbbbb-0000-0000-0000-000000000002";

function fsFixture() {
  return {
    "documents-employes": {
      "": [
        { name: ENTREPRISE_A, id: null },
        { name: ENTREPRISE_B, id: null },
      ],
      [ENTREPRISE_A]: [{ name: "emp1", id: null }],
      [`${ENTREPRISE_A}/emp1`]: [{ name: "photo.png", id: "1" }, { name: "signature.png", id: "2" }],
      [ENTREPRISE_B]: [{ name: "emp2", id: null }],
      [`${ENTREPRISE_B}/emp2`]: [{ name: "photo.png", id: "3" }],
    },
    "notes-frais-exports": {
      "": [{ name: "companies", id: null }],
      companies: [
        { name: ENTREPRISE_A, id: null },
        { name: ENTREPRISE_B, id: null },
      ],
      [`companies/${ENTREPRISE_A}`]: [{ name: "exports", id: null }],
      [`companies/${ENTREPRISE_A}/exports`]: [{ name: "export-1.zip", id: "4" }],
      [`companies/${ENTREPRISE_B}`]: [{ name: "exports", id: null }],
      [`companies/${ENTREPRISE_B}/exports`]: [{ name: "export-2.zip", id: "5" }],
    },
  };
}

describe("purge Storage RGPD", () => {
  it("retrouve les fichiers d'une entreprise quelle que soit la profondeur de son dossier", async () => {
    const { admin } = creerAdminSimule(fsFixture());
    const inventaire = await listerFichiersEntreprise(admin, ENTREPRISE_A);

    const documentsEmployes = inventaire.find((r) => r.bucket === "documents-employes")!;
    expect(documentsEmployes.chemins.sort()).toEqual([`${ENTREPRISE_A}/emp1/photo.png`, `${ENTREPRISE_A}/emp1/signature.png`].sort());

    const exportsNotesFrais = inventaire.find((r) => r.bucket === "notes-frais-exports")!;
    expect(exportsNotesFrais.chemins).toEqual([`companies/${ENTREPRISE_A}/exports/export-1.zip`]);
  });

  it("ne touche jamais aux fichiers d'une autre entreprise (étanchéité cross-tenant)", async () => {
    const { admin, supprimes } = creerAdminSimule(fsFixture());
    await purgerStorageEntreprise(admin, ENTREPRISE_A);

    expect(supprimes["documents-employes"]).not.toContain(`${ENTREPRISE_B}/emp2/photo.png`);
    expect(supprimes["notes-frais-exports"]).not.toContain(`companies/${ENTREPRISE_B}/exports/export-2.zip`);
  });

  it("supprime tous les fichiers trouvés et rapporte un succès par bucket", async () => {
    const { admin, supprimes } = creerAdminSimule(fsFixture());
    const resultats = await purgerStorageEntreprise(admin, ENTREPRISE_A);

    expect(purgeStorageReussie(resultats)).toBe(true);
    expect(supprimes["documents-employes"].sort()).toEqual([`${ENTREPRISE_A}/emp1/photo.png`, `${ENTREPRISE_A}/emp1/signature.png`].sort());
    const bucketDocsEmployes = resultats.find((r) => r.bucket === "documents-employes")!;
    expect(bucketDocsEmployes.supprimes).toBe(2);
  });

  it("est idempotente : rejouer la purge après succès ne trouve plus rien à supprimer", async () => {
    const fs = fsFixture();
    const { admin } = creerAdminSimule(fs);

    const premierPassage = await purgerStorageEntreprise(admin, ENTREPRISE_A);
    expect(premierPassage.find((r) => r.bucket === "documents-employes")!.supprimes).toBe(2);

    const deuxiemePassage = await purgerStorageEntreprise(admin, ENTREPRISE_A);
    expect(deuxiemePassage.find((r) => r.bucket === "documents-employes")!.supprimes).toBe(0);
    expect(purgeStorageReussie(deuxiemePassage)).toBe(true);
  });

  it("couvre bien les 12 buckets connus", () => {
    expect(BUCKETS_RGPD).toHaveLength(12);
  });
});
