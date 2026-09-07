// Le transport Brevo vit désormais dans `packages/email`, partagé avec ELSATIA Réserves
// (et disponible pour les autres applications du socle). Ce module reste le point
// d'entrée historique de Gestion Pro : réexport pur, aucune logique dupliquée, aucun
// second jeu de secrets.
export {
  brevoEstConfigure,
  envoyerEmailBrevo,
  echapperHtml,
  gabaritEmailElsatia,
  type PieceJointeBrevo,
} from "@elsatia/email";
