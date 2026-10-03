// Services push des navigateurs (Chrome/Edge/Opera/Samsung → FCM, Firefox → Mozilla
// autopush, Edge historique → WNS, Safari → Apple). L'endpoint est fourni par le
// navigateur mais transite par le client : sans cette liste, le serveur postait en
// HTTPS vers n'importe quel hôte choisi par l'utilisateur (SSRF aveugle).
const HOTES_EXACTS = new Set(["fcm.googleapis.com", "android.googleapis.com", "web.push.apple.com"]);
const SUFFIXES = [".push.services.mozilla.com", ".notify.windows.com", ".push.apple.com"];

export function endpointPushAutorise(endpoint: unknown): boolean {
  if (typeof endpoint !== "string" || endpoint.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const hote = url.hostname.toLowerCase();
  return HOTES_EXACTS.has(hote) || SUFFIXES.some((suffixe) => hote.endsWith(suffixe));
}
