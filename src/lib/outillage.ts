export const OUTIL_CATEGORIES: Record<string,string> = { electroportatif:"Électroportatif", manuel:"Outil manuel", mesure:"Mesure", securite:"Sécurité", levage:"Levage", autre:"Autre" };
export const OUTIL_STATUTS: Record<string,{label:string;couleur:string}> = {
  disponible:{label:"Disponible",couleur:"#16a34a"}, affecte:{label:"Affecté",couleur:"#2563eb"},
  maintenance:{label:"Maintenance",couleur:"#d97706"}, hors_service:{label:"Hors service",couleur:"#6b7280"}, perdu:{label:"Perdu",couleur:"#dc2626"},
};
export const OUTIL_ETATS: Record<string,string> = { neuf:"Neuf", bon:"Bon", usage:"Usagé", abime:"Abîmé", hors_service:"Hors service" };
export const MOUVEMENT_OUTIL_LABELS: Record<string,string> = { affectation:"Affectation", retour:"Retour", maintenance:"Départ en maintenance", remise_service:"Remise en service", hors_service:"Mise hors service", perte:"Déclaration de perte" };
