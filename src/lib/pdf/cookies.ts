/**
 * Cookies de la requête entrante, préparés pour le magasin de Chromium et liés
 * à l'URL du document imprimé.
 *
 * Contrairement à `page.setExtraHTTPHeaders({ cookie })`, qui attache l'en-tête
 * `Cookie` à TOUTES les requêtes émises par la page — y compris les URL signées
 * Supabase et l'`<img src=logo_url>` dont l'organisation contrôle la valeur —,
 * poser les cookies dans le magasin avec l'URL du document ne les émet QUE vers
 * cette origine, comme un navigateur ordinaire. Sans cela, le jeton de session
 * de l'appelant partait vers l'hôte tiers du logo (REDTEAM-V2 : exfiltration de
 * session via `entreprises.logo_url`).
 *
 * La valeur n'est pas retaillée : un cookie Supabase est du base64 et contient
 * des « = ». Seul le PREMIER caractère « = » sépare le nom de la valeur.
 */
export type CookieChromium = { name: string; value: string; url: string };

export function cookiesPourUrl(enTete: string, url: string): CookieChromium[] {
  return enTete
    .split(";")
    .map((morceau) => morceau.trim())
    .filter((morceau) => morceau !== "")
    .map((morceau) => {
      const separateur = morceau.indexOf("=");
      if (separateur <= 0) return null;
      return { name: morceau.slice(0, separateur), value: morceau.slice(separateur + 1), url };
    })
    .filter((cookie): cookie is CookieChromium => cookie !== null);
}
