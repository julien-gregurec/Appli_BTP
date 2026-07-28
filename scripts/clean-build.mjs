import { rmSync } from "node:fs";
import { resolve } from "node:path";

for (const chemin of [".next", "tsconfig.tsbuildinfo"]) {
  rmSync(resolve(process.cwd(), chemin), { recursive: true, force: true });
}

console.log("Caches de compilation supprimés.");
