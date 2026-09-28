import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { once } from "node:events";
import { Writable } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { EcrivainZip, crc32, nomEntreeSur } from "./zip";

const dossier = mkdtempSync(join(tmpdir(), "zip-test-"));
afterAll(() => rmSync(dossier, { recursive: true, force: true }));

function outil(nom: string): boolean {
  try {
    execFileSync("which", [nom], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function construire(nom: string, remplir: (z: EcrivainZip) => Promise<void>) {
  const chemin = join(dossier, nom);
  const sortie = createWriteStream(chemin);
  const zip = new EcrivainZip(sortie, new Date("2026-09-28T10:00:00Z"));
  await remplir(zip);
  const fin = await zip.fermer();
  sortie.end();
  await once(sortie, "finish");
  return { chemin, fin };
}

async function* morceaux(total: number, taille: number) {
  for (let envoye = 0; envoye < total; envoye += taille) {
    yield Buffer.alloc(Math.min(taille, total - envoye), envoye % 251);
  }
}

describe("écrivain ZIP en flux", () => {
  it("CRC-32 : valeur de référence", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    expect(crc32(Buffer.from("6789"), crc32(Buffer.from("12345")))).toBe(0xcbf43926);
  });

  it("refuse les noms d'entrée dangereux", () => {
    for (const nom of ["", "/abs", "a/../b", "..", "a\\b", "a//b", "a/./b", "a\u0000b"]) expect(nomEntreeSur(nom)).toBe(false);
    expect(nomEntreeSur("fichiers/bucket/a0/b.pdf")).toBe(true);
  });

  it("archive lisible par Python zipfile et unzip -t : contenu, CRC, SHA-256 et empreinte d'archive exacts", async () => {
    const texte = "données « é » ; ligne\n".repeat(1000);
    const { chemin, fin } = await construire("simple.zip", async (z) => {
      const a = await z.ajouterTexte("export.json", texte);
      expect(a.sha256).toBe(createHash("sha256").update(texte).digest("hex"));
      await z.ajouter("fichiers/b/photo.jpg", morceaux(300_000, 7_000), { compresser: false });
      await expect(z.ajouterTexte("export.json", "x")).rejects.toThrow(/double/);
      await expect(z.ajouterTexte("../evasion", "x")).rejects.toThrow(/refusé/);
    });
    const octets = readFileSync(chemin);
    expect(fin.octets).toBe(octets.length);
    expect(fin.sha256).toBe(createHash("sha256").update(octets).digest("hex"));
    expect(fin.entrees).toBe(2);
    const py = execFileSync("python3", ["-c", `
import zipfile, hashlib, sys
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
print(len(z.namelist()), hashlib.sha256(z.read("export.json")).hexdigest(), len(z.read("fichiers/b/photo.jpg")))
`, chemin]).toString().trim().split(" ");
    expect(py).toEqual(["2", createHash("sha256").update(texte).digest("hex"), "300000"]);
    if (outil("unzip")) expect(execFileSync("unzip", ["-tq", chemin]).toString()).toMatch(/No errors/);
  });

  it("entrée vide et flux asynchrone", async () => {
    const { chemin } = await construire("vide.zip", async (z) => {
      await z.ajouter("vide.json", (async function* () {})());
    });
    const n = execFileSync("python3", ["-c", "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip(), len(z.read('vide.json')))", chemin]).toString().trim();
    expect(n).toBe("None 0");
  });

  it("ZIP64 : plus de 65 535 entrées (limite du format classique) restent lisibles", async () => {
    const { chemin, fin } = await construire("zip64.zip", async (z) => {
      for (let i = 0; i < 65_600; i++) await z.ajouter(`f/${i}.txt`, [Buffer.from(String(i))], { compresser: false });
    });
    expect(fin.entrees).toBe(65_600);
    const sortie = execFileSync("python3", ["-c", "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(len(z.namelist()), z.read('f/65599.txt').decode(), z.testzip())", chemin]).toString().trim();
    expect(sortie).toBe("65600 65599 None");
    if (outil("unzip")) expect(execFileSync("unzip", ["-tq", chemin]).toString()).toMatch(/No errors/);
  }, 120_000);

  it("flux : 256 Mio traversent l'écrivain sans que le tas JS ne grossisse d'autant", async () => {
    const puits = new Writable({ write(_c, _e, cb) { cb(); } });
    const z = new EcrivainZip(puits);
    const bloc = Buffer.alloc(1 << 20, 7);
    global.gc?.();
    const avant = process.memoryUsage().heapUsed;
    let max = avant;
    async function* gros() {
      for (let i = 0; i < 256; i++) {
        max = Math.max(max, process.memoryUsage().heapUsed);
        yield bloc;
      }
    }
    const e = await z.ajouter("gros.bin", gros(), { compresser: false });
    const fin = await z.fermer();
    expect(e.octets).toBe(256 << 20);
    expect(fin.octets).toBeGreaterThan(256 << 20);
    expect(max - avant).toBeLessThan(64 << 20);
  }, 60_000);

  it("un flux source en erreur fait échouer l'entrée (jamais d'archive silencieusement tronquée)", async () => {
    const sortie = createWriteStream(join(dossier, "erreur.zip"));
    const z = new EcrivainZip(sortie);
    async function* casse() {
      yield Buffer.from("début");
      throw new Error("coupure réseau");
    }
    await expect(z.ajouter("x.bin", casse())).rejects.toThrow(/coupure/);
    sortie.destroy();
  });
});
