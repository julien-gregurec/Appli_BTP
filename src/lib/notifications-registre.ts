// Inventaire des types de notifications réellement générés côté base (voir les appels à
// notifier_permission() et les triggers trg_notifications_* dans les migrations Supabase).
// `permission` : null = toujours proposable (concerne l'utilisateur lui-même) ; sinon, le
// type n'a de sens que pour un poste qui a ce droit, donc pas affiché sinon.
export const TYPES_NOTIFICATIONS: { cle: string; libelle: string; permission: string | null }[] = [
  { cle: "pointage_a_verifier", libelle: "Pointage à vérifier", permission: "valider_pointages" },
  { cle: "pointage_oublie", libelle: "Pointage oublié déclaré", permission: "valider_pointages" },
  { cle: "conge_a_traiter", libelle: "Nouvelle demande de congé", permission: "gerer_conges" },
  { cle: "decision_conge", libelle: "Décision sur ma demande de congé", permission: null },
  { cle: "note_frais_a_verifier", libelle: "Note de frais à vérifier", permission: "verifier_notes_frais" },
  { cle: "decision_note_frais", libelle: "Décision sur ma note de frais", permission: null },
  { cle: "planning_modifie", libelle: "Changement de mon planning", permission: null },
  { cle: "sortie_zone_chantier", libelle: "Sortie de la zone de chantier", permission: "valider_pointages" },
];

export function typesNotificationsDisponibles(permissions: string[] | null): typeof TYPES_NOTIFICATIONS {
  return TYPES_NOTIFICATIONS.filter((t) => t.permission === null || permissions === null || permissions.includes(t.permission));
}
