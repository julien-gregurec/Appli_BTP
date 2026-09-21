// ELSATIA-GP-DOCUMENT-RESEND-OVERRIDE-V1 — autorisation de la surcharge d'adresse.
//
// Envoyer un document à une adresse autre que celle figée dessus n'est pas un
// simple geste d'expédition : c'est une décision sur la relation client, prise
// contre ce que le document atteste. Elle exige donc, EN PLUS de la permission
// d'envoyer le document (`gerer_devis` / `gerer_factures`, déjà contrôlée par
// les actions serveur), la permission de gérer les clients.
//
// `gerer_clients` est une clé de permission EXISTANTE
// (20260710000001_comptes_entreprises.sql). Créer une clé dédiée
// (« surcharger_destinataire_document ») supposerait un INSERT dans
// `public.permissions_disponibles`, donc une migration — impossible tant que le
// ledger n'est pas réconcilié. Le choix de réutiliser `gerer_clients` est donc
// à la fois défendable sur le fond et compatible avec le gel du ledger ; il
// reste réversible, et le rapport du lot le signale comme point à trancher.

/**
 * `permissions === null` signifie « accès total » dans tout Gestion Pro
 * (voir `permissionsUtilisateur`) : administrateur, dirigeant, ou mode sans
 * connexion e-mail. Cette convention est reprise telle quelle ici.
 */
export function peutSurchargerDestinataire(permissions: string[] | null): boolean {
  if (permissions === null) return true;
  return permissions.includes("gerer_clients");
}
