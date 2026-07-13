import { createHash } from "node:crypto";

export function sha256(data: ArrayBuffer | Uint8Array | Buffer): string {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  return createHash("sha256").update(bytes).digest("hex");
}

export function empreinteValide(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

export function verifierEmpreinte(data: ArrayBuffer | Uint8Array | Buffer, attendue: string): boolean {
  return empreinteValide(attendue) && sha256(data) === attendue;
}
