// Écrivain ZIP en flux, sans dépendance, avec ZIP64 : aucune entrée n'est chargée entière en
// mémoire (lecture → CRC-32 / SHA-256 → deflate → fichier), et l'archive n'est pas plafonnée à
// 65 535 entrées ni à 4 Gio (limites du format ZIP classique, que `fflate` n'étend pas).
//
// Format : en-tête local + données + descripteur de données (bit 3), UTF-8 (bit 11), répertoire
// central ; champs ZIP64 dans le répertoire central et enregistrements de fin ZIP64 seulement
// lorsqu'une taille, un décalage ou le nombre d'entrées l'exige (archive classique sinon).
import { createHash } from "node:crypto";
import { once } from "node:events";
import { Readable } from "node:stream";
import type { Writable } from "node:stream";
import zlib from "node:zlib";

const LIMITE_32 = 0xffffffff;
const LIMITE_16 = 0xffff;

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 incrémental (zlib.crc32 natif si disponible, Node ≥ 22.2). */
export function crc32(donnees: Uint8Array, precedent = 0): number {
  const natif = (zlib as unknown as { crc32?: (d: Uint8Array, v?: number) => number }).crc32;
  if (natif) return natif(donnees, precedent) >>> 0;
  let c = (precedent ^ 0xffffffff) >>> 0;
  for (let i = 0; i < donnees.length; i++) c = TABLE_CRC[(c ^ donnees[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface EntreeEcrite {
  nom: string;
  octets: number;
  compresses: number;
  crc: number;
  sha256: string;
}

interface EntreeCentrale extends EntreeEcrite {
  methode: 0 | 8;
  decalage: number;
}

function dateDos(d: Date): { heure: number; jour: number } {
  const annee = Math.max(1980, d.getUTCFullYear());
  return {
    heure: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    jour: ((annee - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

/** Nom d'entrée sûr : relatif, sans « .. », sans séparateur Windows ni caractère de contrôle. */
export function nomEntreeSur(nom: string): boolean {
  if (!nom || nom.length > 1024 || nom.startsWith("/") || nom.includes("\\")) return false;
  if (/[\u0000-\u001f]/.test(nom)) return false;
  return nom.split("/").every((p) => p !== "" && p !== "." && p !== "..");
}

export class EcrivainZip {
  private position = 0;
  private readonly entrees: EntreeCentrale[] = [];
  private readonly noms = new Set<string>();
  private readonly empreinte = createHash("sha256");
  private readonly dos: { heure: number; jour: number };
  private ferme = false;

  constructor(private readonly sortie: Writable, date = new Date()) {
    this.dos = dateDos(date);
  }

  get taille() {
    return this.position;
  }

  get nombreEntrees() {
    return this.entrees.length;
  }

  private async ecrire(tampon: Buffer) {
    if (tampon.length === 0) return;
    this.empreinte.update(tampon);
    this.position += tampon.length;
    if (!this.sortie.write(tampon)) await once(this.sortie, "drain");
  }

  /** Ajoute une entrée à partir d'un flux ; renvoie sa taille, son CRC et son SHA-256 (contenu). */
  async ajouter(nom: string, source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>, options: { compresser?: boolean } = {}): Promise<EntreeEcrite> {
    if (this.ferme) throw new Error("Archive déjà fermée");
    if (!nomEntreeSur(nom)) throw new Error("Nom d'entrée d'archive refusé");
    if (this.noms.has(nom)) throw new Error("Entrée d'archive en double");
    this.noms.add(nom);
    const methode: 0 | 8 = options.compresser === false ? 0 : 8;
    const nomOctets = Buffer.from(nom, "utf8");
    const decalage = this.position;

    const entete = Buffer.alloc(30);
    entete.writeUInt32LE(0x04034b50, 0);
    entete.writeUInt16LE(45, 4); // version nécessaire : 4.5 (ZIP64 possible)
    entete.writeUInt16LE(0x0808, 6); // bit 3 : descripteur de données ; bit 11 : UTF-8
    entete.writeUInt16LE(methode, 8);
    entete.writeUInt16LE(this.dos.heure, 10);
    entete.writeUInt16LE(this.dos.jour, 12);
    // CRC et tailles à 0 : ils suivent dans le descripteur.
    entete.writeUInt16LE(nomOctets.length, 26);
    entete.writeUInt16LE(0, 28);
    await this.ecrire(Buffer.concat([entete, nomOctets]));

    let crc = 0;
    let octets = 0;
    const sha = createHash("sha256");
    async function* observe() {
      for await (const morceau of source as AsyncIterable<Uint8Array>) {
        const b = Buffer.isBuffer(morceau) ? morceau : Buffer.from(morceau.buffer, morceau.byteOffset, morceau.byteLength);
        if (b.length === 0) continue;
        crc = crc32(b, crc);
        octets += b.length;
        sha.update(b);
        yield b;
      }
    }

    let compresses = 0;
    if (methode === 8) {
      const deflate = zlib.createDeflateRaw({ level: 6 });
      const entree = Readable.from(observe());
      entree.on("error", (e) => deflate.destroy(e));
      entree.pipe(deflate);
      for await (const bloc of deflate as AsyncIterable<Buffer>) {
        await this.ecrire(bloc);
        compresses += bloc.length;
      }
    } else {
      for await (const b of observe()) {
        await this.ecrire(b);
        compresses += b.length;
      }
    }

    const zip64 = octets >= LIMITE_32 || compresses >= LIMITE_32;
    const descripteur = Buffer.alloc(zip64 ? 24 : 16);
    descripteur.writeUInt32LE(0x08074b50, 0);
    descripteur.writeUInt32LE(crc >>> 0, 4);
    if (zip64) {
      descripteur.writeBigUInt64LE(BigInt(compresses), 8);
      descripteur.writeBigUInt64LE(BigInt(octets), 16);
    } else {
      descripteur.writeUInt32LE(compresses, 8);
      descripteur.writeUInt32LE(octets, 12);
    }
    await this.ecrire(descripteur);

    const entreeEcrite: EntreeEcrite = { nom, octets, compresses, crc: crc >>> 0, sha256: sha.digest("hex") };
    this.entrees.push({ ...entreeEcrite, methode, decalage });
    return entreeEcrite;
  }

  async ajouterTexte(nom: string, texte: string, options: { compresser?: boolean } = {}) {
    return this.ajouter(nom, [Buffer.from(texte, "utf8")], options);
  }

  /** Écrit le répertoire central et la fin d'archive ; renvoie la taille et le SHA-256 de l'archive. */
  async fermer(): Promise<{ octets: number; sha256: string; entrees: number }> {
    if (this.ferme) throw new Error("Archive déjà fermée");
    this.ferme = true;
    const debutCentral = this.position;
    for (const e of this.entrees) {
      const nom = Buffer.from(e.nom, "utf8");
      const extras: Buffer[] = [];
      const tailleU = e.octets >= LIMITE_32;
      const tailleC = e.compresses >= LIMITE_32;
      const dec = e.decalage >= LIMITE_32;
      if (tailleU || tailleC || dec) {
        const champs: bigint[] = [];
        if (tailleU) champs.push(BigInt(e.octets));
        if (tailleC) champs.push(BigInt(e.compresses));
        if (dec) champs.push(BigInt(e.decalage));
        const x = Buffer.alloc(4 + champs.length * 8);
        x.writeUInt16LE(0x0001, 0);
        x.writeUInt16LE(champs.length * 8, 2);
        champs.forEach((v, i) => x.writeBigUInt64LE(v, 4 + i * 8));
        extras.push(x);
      }
      const extra = Buffer.concat(extras);
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0);
      c.writeUInt16LE((3 << 8) | 45, 4); // créé par : Unix, 4.5
      c.writeUInt16LE(45, 6);
      c.writeUInt16LE(0x0808, 8);
      c.writeUInt16LE(e.methode, 10);
      c.writeUInt16LE(this.dos.heure, 12);
      c.writeUInt16LE(this.dos.jour, 14);
      c.writeUInt32LE(e.crc, 16);
      c.writeUInt32LE(tailleC ? LIMITE_32 : e.compresses, 20);
      c.writeUInt32LE(tailleU ? LIMITE_32 : e.octets, 24);
      c.writeUInt16LE(nom.length, 28);
      c.writeUInt16LE(extra.length, 30);
      c.writeUInt16LE(0, 32);
      c.writeUInt16LE(0, 34);
      c.writeUInt16LE(0, 36);
      c.writeUInt32LE((0o100644 << 16) >>> 0, 38); // fichier ordinaire rw-r--r--
      c.writeUInt32LE(dec ? LIMITE_32 : e.decalage, 42);
      await this.ecrire(Buffer.concat([c, nom, extra]));
    }
    const tailleCentral = this.position - debutCentral;
    const n = this.entrees.length;
    const zip64 = n >= LIMITE_16 || debutCentral >= LIMITE_32 || tailleCentral >= LIMITE_32;
    if (zip64) {
      const debutFin64 = this.position;
      const f = Buffer.alloc(56);
      f.writeUInt32LE(0x06064b50, 0);
      f.writeBigUInt64LE(BigInt(44), 4);
      f.writeUInt16LE((3 << 8) | 45, 12);
      f.writeUInt16LE(45, 14);
      f.writeUInt32LE(0, 16);
      f.writeUInt32LE(0, 20);
      f.writeBigUInt64LE(BigInt(n), 24);
      f.writeBigUInt64LE(BigInt(n), 32);
      f.writeBigUInt64LE(BigInt(tailleCentral), 40);
      f.writeBigUInt64LE(BigInt(debutCentral), 48);
      const loc = Buffer.alloc(20);
      loc.writeUInt32LE(0x07064b50, 0);
      loc.writeUInt32LE(0, 4);
      loc.writeBigUInt64LE(BigInt(debutFin64), 8);
      loc.writeUInt32LE(1, 16);
      await this.ecrire(Buffer.concat([f, loc]));
    }
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0);
    fin.writeUInt16LE(Math.min(n, LIMITE_16), 8);
    fin.writeUInt16LE(Math.min(n, LIMITE_16), 10);
    fin.writeUInt32LE(Math.min(tailleCentral, LIMITE_32), 12);
    fin.writeUInt32LE(Math.min(debutCentral, LIMITE_32), 16);
    await this.ecrire(fin);
    return { octets: this.position, sha256: this.empreinte.digest("hex"), entrees: n };
  }
}
