/**
 * Garde d'un chemin Storage LU EN BASE avant tout appel avec le client service_role.
 *
 * storage-js concatène `${bucket}/${chemin}` dans l'URL de l'API ; `fetch` résout
 * ensuite les segments `..` : `E/D/../../../autre-bucket/x` sort du préfixe attendu
 * (et même du bucket) alors qu'un test `startsWith(prefixe)` le laisse passer. On
 * refuse donc tout segment vide, `.` ou `..`, toute barre oblique inverse, tout
 * caractère de contrôle et tout `%` (pas de forme encodée à interpréter).
 */
export function cheminStockageSur(chemin: unknown, prefixe?: string): chemin is string {
  if (typeof chemin !== "string" || chemin.length === 0 || chemin.length > 1024) return false;
  if (/[\\%\u0000-\u001f\u007f]/.test(chemin)) return false;
  if (chemin.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) return false;
  return prefixe === undefined || chemin.startsWith(prefixe);
}
