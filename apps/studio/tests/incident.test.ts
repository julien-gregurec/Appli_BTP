import { describe, expect, it, vi } from "vitest";
import { controleWorker, sondeProfondeAutorisee } from "../src/lib/incident";

describe("mode sûr Studio — sonde profonde et worker", () => {
  it("sonde profonde uniquement avec le secret exact", () => {
    expect(sondeProfondeAutorisee(null, "s3cret")).toBe(false);
    expect(sondeProfondeAutorisee("Bearer faux", "s3cret")).toBe(false);
    expect(sondeProfondeAutorisee("Bearer s3cret", "s3cret")).toBe(true);
    expect(sondeProfondeAutorisee("Bearer s3cret", undefined)).toBe(false);
  });

  const signal = new AbortController().signal;
  const lecture = (data: unknown, error: unknown = null) => vi.fn(async () => ({ data, error }));

  it("worker sain : aucun rendu sans battement, aucune file ancienne", async () => {
    const lire = lecture({ rendus_sans_battement: 0, rendus_en_attente_anciens: 0, analyses_en_attente_anciennes: 3 });
    expect(await controleWorker(lire).executer(signal)).toBe("ok");
    expect(lire).toHaveBeenCalledTimes(1);
  });
  it("worker bloqué (battement périmé) ou arrêté (file qui vieillit) : ko", async () => {
    expect(await controleWorker(lecture({ rendus_sans_battement: 1, rendus_en_attente_anciens: 0 })).executer(signal)).toBe("ko");
    expect(await controleWorker(lecture({ rendus_sans_battement: 0, rendus_en_attente_anciens: 4 })).executer(signal)).toBe("ko");
    expect(await controleWorker(lecture(null, { message: "permission denied" })).executer(signal)).toBe("ko");
  });
  it("sans clé service : non configuré", async () => {
    expect(await controleWorker(null).executer(signal)).toBe("non_configure");
  });
});
