# Suivi des besoins métier — Liria Gestion Pro

Mise à jour : 14 juillet 2026. Ce document distingue ce qui est utilisable, ce qui reste progressif et ce qui dépend d’un service externe.

| Besoin | État | Réalisation / reste |
|---|---|---|
| Créer un client ou un chantier depuis un nouveau devis | ✅ Fait | Mini-formulaire client intégré, puis ouverture automatique du mini-formulaire chantier. Le bouton Nouveau chantier reste visible, explique qu’un client est requis, rattache le chantier au client et le sélectionne sans quitter le devis. |
| Planning simple date + heures + tâche | ✅ Fait | Semaine visuelle lundi-dimanche, sans horaires début/fin. |
| Plusieurs ouvriers sur une tâche | ✅ Fait | Sélection multiple, carte groupée, total heures-équipe, suppression groupée. |
| Équipe permanente par chantier | ✅ Code prêt · migration 77 | Ouvrier, chef d’équipe, chef de chantier ou conducteur de travaux, avec rôle et dates. Visible depuis le chantier, la fiche salarié, la carte BTP et Mes travaux. |
| Partager le planning semaine | ✅ Fait | Liens email et WhatsApp avec contenu de la semaine. |
| PDF devis et factures | ✅ Fait | Pages A4 et bouton Télécharger PDF / impression. |
| Email devis/facture/commande avec copies | 🟡 Fonctionnel assisté | Fenêtre destinataire + CC + objet + message + PDF à joindre ; ouvre la messagerie configurée et met le statut à Envoyé. Les commandes fournisseur ont désormais leur propre bon PDF. L’envoi serveur avec pièce jointe nécessite un domaine et une clé SMTP/Resend. |
| Synchronisation automatique des statuts | ✅ Fait | Paiements → partiel/payé, devis/facture → envoyé lors de l’email, devis/facture/chantier synchronisés. Les décisions métier (accepté/refusé/annulé) restent volontaires. |
| Prestations préenregistrées | ✅ Fait | Catalogue administrable, insertion dans une ligne de devis, sauvegarde rapide d’une ligne manuelle. |
| Accès selon les postes | ✅ Fait | Les modules sans droit Consulter sont absents du menu/dashboard et leurs URLs redirigent. Les droits Consulter, Gérer, Personnel et Chiffres sont séparés. `voir_indicateurs_financiers` contrôle les totaux sensibles. L’administrateur dispose d’un aperçu en lecture seule par poste, en format téléphone ou ordinateur, sans usurper un compte salarié. La liste Employés indique l’accès, le poste et le détail des droits. |
| Droits communs à tout le personnel | ✅ Fait | Planning, consultation du pointage, arrivée/départ en son propre nom et notes de frais personnelles sont inclus dans tous les postes existants et futurs. Ces droits socle ne peuvent pas être décochés par erreur dans l’administration. |
| Rattacher un employé à une entreprise | ✅ Fait | Numéro personnel `BTP-…`, fiche et poste préparés avant invitation, contrôle de l’email puis rattachement automatique du compte. Le code entreprise général reste un recours. |
| Ancienneté et sortie d’un salarié | ✅ Fait | Ancienneté calculée depuis la date d’entrée et affichée dans la liste et la fiche. La date de sortie n’apparaît que pour le statut Sorti ; elle devient obligatoire et arrête le calcul de l’ancienneté. |
| Compte et accès propres à chaque collaborateur | ✅ Fait | Invitation personnelle partageable, inscription/confirmation SSR, numéro prérempli, poste Consulter/Gérer, PWA installable, session persistante et mot de passe oublié. |
| Carte professionnelle BTP de l’ouvrier | ✅ Fait | Import privé PDF/photo sur la fiche employé, numéro et expiration facultatifs, présentation plein écran et téléchargement lors d’un contrôle. |
| Pointage arrivée/départ avec localisation | ✅ Fait | Chantier et GPS obligatoires, date/heure automatiques, pause et heures calculées. Le droit `saisir_son_pointage` et la liaison du compte limitent toute personne à sa propre fiche, y compris un responsable ; `gerer_pointage` donne seulement la consultation/validation d’équipe. Le pointage personnel est aussi disponible sur l’accueil. |
| Notes de frais salarié vers comptable | ✅ Fait | Photo/PDF privé, montant, catégorie, chantier optionnel et statut. Le salarié connecté ne voit et ne dépose que ses propres notes. Voir/traiter celles de l’équipe exige à la fois le droit de gestion comptable et l’accès aux chiffres de l’entreprise. Le module personnel est fermé en prototype sans identité. |
| Actions strictement au nom propre | ✅ Fait sur les flux personnels | Pointage et notes de frais dérivent la fiche liée au compte côté interface, serveur et RLS. Les commandes n’acceptent aucun salarié choisi et enregistrent automatiquement le compte auteur. Les droits de gestion d’équipe restent séparés. |
| Installation ou invitation collaborateur | ✅ Fait | PWA installable, invitation personnelle BTP ou code entreprise, puis activation de la fiche et accès selon le poste. |
| Vidéos de formation et publicité | ✅ Fait | Guide Full HD 8 min 23 et publicité 59 s, voix française, son normalisé, sous-titres, présentatrice et interfaces animées. |
| Import listes fournisseur Excel/PDF | ✅ Fait | XLSX/CSV/PDF, détection de colonnes, import atomique catalogue. Les PDF image sans texte doivent être passés en OCR ou exportés en Excel. |
| Import inventaire Excel/PDF | ✅ Fait | Même import en mode Inventaire, écarts convertis en mouvements d’ajustement traçables. |
| Nuanciers / teintes produits | ✅ Fait | Teintes, référence fabricant, couleur visuelle, sélection sur les mouvements. |
| Scan entrée/sortie stock | ✅ Fait | Scanner caméra mobile multi-format avec caméra arrière, détection automatique, vibration et lampe si disponible. Douchette et saisie manuelle restent disponibles en repli. |
| Inventaire et déclaration fin d’année | ✅ Socle fait | Inventaires datés, quantités théoriques/comptées, validation atomique et valeur d’achat estimée ; exports comptables CSV disponibles. |
| Véhicule assigné à un ouvrier | ✅ Fait | Affectation sur la fiche véhicule et ouvrier visible directement dans la liste Flotte, en cartes sur mobile comme dans le tableau ordinateur. |
| Factures/coûts et travaux par véhicule | ✅ Fait | Dépense liée au véhicule, total, historique des affectations et résumé des travaux récents de l’ouvrier assigné. |
| Outil assigné à un ouvrier/chantier | ✅ Fait | Affectation/retour/maintenance historisés. |
| Factures/coûts par outil | ✅ Fait | Dépense liée à l’outil, total, historique et présence du scan. |
| Dépense synchronisée actif/ouvrier/chantier | ✅ Fait | Une facture peut viser chantier + ouvrier + véhicule ou outil ; l’ouvrier de l’actif est repris automatiquement. |
| Listes intelligentes marques/modèles | ✅ Fait | Véhicules : suggestions locales + modèles vPIC officiels ; outillage : marques BTP et gammes usuelles. La saisie libre reste toujours autorisée. |
| Scanner/importer une facture papier | ✅ Fait | PDF/photo depuis fichier ou appareil photo, stockage privé, aperçu/téléchargement depuis la dépense. |
| Import véhicules et outillage Excel/PDF | ✅ Fait | Import XLSX/CSV/PDF depuis les listes Flotte et Outillage, détection des colonnes usuelles, doublons véhicules mis à jour et doublons outils ignorés. |
| Photos chantier par les équipes | ✅ Fait | Prise de photo directe depuis le téléphone, classement avant/pendant/après et note de suivi, en plus du dépôt documentaire complet. |
| Logo entreprise dans logiciel et documents | ✅ Fait | Import PNG/JPG/WebP dans Paramètres, logo visible dans la carte de l’entreprise active et sur ses PDF. L’identité du logiciel reste toujours Liria Gestion Pro. |
| Utilisation complète sur mobile | ✅ Fait | Interface responsive et application installable sur l’écran d’accueil. Les listes principales ont des cartes mobiles dédiées ; menu renforcé pour les zones sûres iPhone et bouton Retour vers la page parente. Le tableau de bord terrain réunit pointage et planning personnel. Aucune donnée privée n’est mise en cache. |
| Espace propriétaire SaaS | ✅ Fait | Liste des entreprises, codes, membres, statut d’abonnement, échéance et note ; accès réservé au propriétaire en auth réelle. |
| Stock inspiré d’une application GitHub existante | ⏳ En attente de source | Le socle est opérationnel. Comparaison/fusion détaillée à faire dès réception du dépôt GitHub annoncé par l’utilisateur. |

## Dépendances externes restantes

1. Envoi email entièrement automatique avec PDF joint : choisir un domaine d’envoi et fournir une clé Resend/SMTP.
2. OCR des factures ou catalogues scannés sans texte : choisir un service OCR si les PDF image sont fréquents.
3. Archivage renforcé à valeur probante : validation juridique/comptable et éventuel prestataire d’horodatage ou d’archivage qualifié.
