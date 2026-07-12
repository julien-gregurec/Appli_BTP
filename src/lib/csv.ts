function celluleTexte(value: unknown) {
  let texte = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(texte)) texte = `'${texte}`;
  return `"${texte.replaceAll('"', '""')}"`;
}
export function nombreCsv(value: unknown) { const nombre = Number(value ?? 0); return Number.isFinite(nombre) ? nombre.toFixed(2).replace(".", ",") : "0,00"; }
export function csv(lignes: unknown[][]) { return `\uFEFF${lignes.map((ligne) => ligne.map((valeur) => typeof valeur === "number" ? nombreCsv(valeur) : typeof valeur === "string" && /^-?\d+,\d{2}$/.test(valeur) ? valeur : celluleTexte(valeur)).join(";")).join("\r\n")}\r\n`; }
export function reponseCsv(lignes: unknown[][], nomFichier: string) { return new Response(csv(lignes), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nomFichier}"`, "Cache-Control": "private, no-store" } }); }
export function periodeDepuisUrl(url: string) { const params = new URL(url).searchParams; const maintenant = new Date(); const fin = params.get("fin") ?? maintenant.toISOString().slice(0, 10); const debut = params.get("debut") ?? `${maintenant.getFullYear()}-01-01`; if (!/^\d{4}-\d{2}-\d{2}$/.test(debut) || !/^\d{4}-\d{2}-\d{2}$/.test(fin) || debut > fin) return null; return { debut, fin }; }
