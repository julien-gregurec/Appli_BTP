import { describe, expect, it, vi } from "vitest";
import { deposerObjet, estObjetDejaPresent } from "./depot-photo";

/**
 * Ce que protègent ces tests : une photo de constat déjà téléversée, dont l'accusé s'est
 * perdu, doit finir par être ACQUITTÉE. En V5, elle ne l'était jamais — le renvoi butait
 * sur les policies Storage, qui n'accordent pas l'écrasement, et la file abandonnait au
 * bout de cinq tentatives. La preuve était dans le bucket, et perdue pour l'application.
 */

const FICHIER = new File([new Uint8Array([0xff, 0xd8, 0xff])], "constat.jpg", {
  type: "image/jpeg",
});

function client(erreur: unknown) {
  const upload = vi.fn().mockResolvedValue({ error: erreur });
  return {
    upload,
    supabase: { storage: { from: () => ({ upload }) } },
  };
}

describe("reconnaissance d'un objet déjà déposé", () => {
  it("reconnaît le refus de Storage sous ses différentes formes", () => {
    for (const erreur of [
      { statusCode: "409" },
      { statusCode: 409 },
      { message: "The resource already exists" },
      { message: "Duplicate", statusCode: "400" },
      { error: "Duplicate" },
    ]) {
      expect(estObjetDejaPresent(erreur), JSON.stringify(erreur)).toBe(true);
    }
  });

  it("ne confond pas un vrai refus avec un doublon", () => {
    // Le cas décisif : « new row violates row-level security policy » est le message
    // qu'un écrasement provoquait. Il ne doit JAMAIS passer pour un succès — sinon
    // l'application confirmerait une photo qui n'est pas dans le bucket, et la preuve
    // exigée à la levée serait satisfaite par du vide.
    for (const erreur of [
      { message: "new row violates row-level security policy", statusCode: "403" },
      { message: "Payload too large", statusCode: "413" },
      { message: "Bucket not found", statusCode: "404" },
      null, undefined, "erreur", 42,
    ]) {
      expect(estObjetDejaPresent(erreur), JSON.stringify(erreur)).toBe(false);
    }
  });
});

describe("dépôt", () => {
  it("ne demande JAMAIS l'écrasement", async () => {
    // Les policies Storage n'accordent que `select` et `insert`, et c'est voulu : un
    // fichier déposé ne doit pouvoir être ni écrasé ni effacé depuis l'application.
    const { supabase, upload } = client(null);
    expect(await deposerObjet(supabase, "reserves-photos", "a/b.jpg", FICHIER)).toBeNull();
    expect(upload).toHaveBeenCalledWith(
      "a/b.jpg", FICHIER, { contentType: "image/jpeg", upsert: false },
    );
  });

  it("traite un objet déjà présent comme un succès", async () => {
    const { supabase } = client({ statusCode: "409", message: "The resource already exists" });
    expect(await deposerObjet(supabase, "reserves-photos", "a/b.jpg", FICHIER)).toBeNull();
  });

  it("remonte une vraie erreur telle quelle", async () => {
    const refus = { message: "Payload too large", statusCode: "413" };
    const { supabase } = client(refus);
    expect(await deposerObjet(supabase, "reserves-photos", "a/b.jpg", FICHIER)).toBe(refus);
  });
});
