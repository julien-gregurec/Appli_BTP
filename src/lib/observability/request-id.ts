// Corrélation minimale et sûre : pas de middleware global (trop invasif pour
// une base déjà volumineuse), mais un identifiant réutilisable explicitement
// dans les points d'entrée critiques (webhooks, cron, healthcheck). Reprend
// l'identifiant amont s'il existe déjà (Vercel/plateforme en pose parfois un).
export function obtenirIdCorrelation(request: Request): string {
  const entete = request.headers.get("x-request-id") || request.headers.get("x-vercel-id");
  return entete && entete.length <= 200 ? entete : crypto.randomUUID();
}
