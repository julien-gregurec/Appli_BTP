# Suivi des besoins métier — LIRIA CONCEPT

Mise à jour : 13 juillet 2026. Ce document distingue ce qui est utilisable, ce qui reste progressif et ce qui dépend d’un service externe.

| Besoin | État | Réalisation / reste |
|---|---|---|
| Créer un client depuis un nouveau devis | ✅ Fait | Mini-formulaire intégré au devis, création de la fiche puis sélection automatique. |
| Planning simple date + heures + tâche | ✅ Fait | Semaine visuelle lundi-dimanche, sans horaires début/fin. |
| Plusieurs ouvriers sur une tâche | ✅ Fait | Sélection multiple, carte groupée, total heures-équipe, suppression groupée. |
| Partager le planning semaine | ✅ Fait | Liens email et WhatsApp avec contenu de la semaine. |
| PDF devis et factures | ✅ Fait | Pages A4 et bouton Télécharger PDF / impression. |
| Email devis/facture/commande avec copies | 🟡 Fonctionnel assisté | Fenêtre destinataire + CC + objet + message + PDF à joindre ; ouvre la messagerie configurée et met le statut à Envoyé. Les commandes fournisseur ont désormais leur propre bon PDF. L’envoi serveur avec pièce jointe nécessite un domaine et une clé SMTP/Resend. |
| Synchronisation automatique des statuts | ✅ Fait | Paiements → partiel/payé, devis/facture → envoyé lors de l’email, devis/facture/chantier synchronisés. Les décisions métier (accepté/refusé/annulé) restent volontaires. |
| Prestations préenregistrées | ✅ Fait | Catalogue administrable, insertion dans une ligne de devis, sauvegarde rapide d’une ligne manuelle. |
| Accès selon les postes | 🟡 Migration 43 à valider | Interface, proxy et panneaux repliables opérationnels. La migration 43 préparée ajoute la défense RLS/stockage/RPC des droits Gérer ; elle doit être testée puis appliquée dans Supabase avant l’auth réelle. |
| Rattacher un employé à une entreprise | ✅ Fait | Code entreprise unique, demande en attente, validation par affectation d’un poste. |
| Compte et accès propres à chaque collaborateur | 🟡 Prêt à activer | Invitation partageable, inscription/confirmation SSR, code prérempli, demande et validation admin, poste Consulter/Gérer, mot de passe oublié. Reste la sortie volontaire du mode prototype et le réglage des modèles email Supabase. |
| Carte professionnelle BTP de l’ouvrier | ✅ Fait | Import privé PDF/photo sur la fiche employé, numéro et expiration facultatifs, présentation plein écran et téléchargement lors d’un contrôle. |
| Pointage arrivée/départ avec localisation | ✅ Fait | Choix obligatoire du chantier, GPS obligatoire à l’arrivée et au départ, date/heure automatiques, pause saisie et heures calculées. Aucune photo et aucune saisie manuelle dans le nouveau parcours. |
| Import listes fournisseur Excel/PDF | ✅ Fait | XLSX/CSV/PDF, détection de colonnes, import atomique catalogue. Les PDF image sans texte doivent être passés en OCR ou exportés en Excel. |
| Import inventaire Excel/PDF | ✅ Fait | Même import en mode Inventaire, écarts convertis en mouvements d’ajustement traçables. |
| Nuanciers / teintes produits | ✅ Fait | Teintes, référence fabricant, couleur visuelle, sélection sur les mouvements. |
| Scan entrée/sortie stock | ✅ Fait | Scanner caméra mobile multi-format avec caméra arrière, détection automatique, vibration et lampe si disponible. Douchette et saisie manuelle restent disponibles en repli. |
| Inventaire et déclaration fin d’année | ✅ Socle fait | Inventaires datés, quantités théoriques/comptées, validation atomique et valeur d’achat estimée ; exports comptables CSV disponibles. |
| Véhicule assigné à un ouvrier | ✅ Fait | Affectation sur la fiche véhicule. |
| Factures/coûts et travaux par véhicule | ✅ Fait | Dépense liée au véhicule, total, historique des affectations et résumé des travaux récents de l’ouvrier assigné. |
| Outil assigné à un ouvrier/chantier | ✅ Fait | Affectation/retour/maintenance historisés. |
| Factures/coûts par outil | ✅ Fait | Dépense liée à l’outil, total, historique et présence du scan. |
| Dépense synchronisée actif/ouvrier/chantier | ✅ Fait | Une facture peut viser chantier + ouvrier + véhicule ou outil ; l’ouvrier de l’actif est repris automatiquement. |
| Listes intelligentes marques/modèles | ✅ Fait | Véhicules : suggestions locales + modèles vPIC officiels ; outillage : marques BTP et gammes usuelles. La saisie libre reste toujours autorisée. |
| Scanner/importer une facture papier | ✅ Fait | PDF/photo depuis fichier ou appareil photo, stockage privé, aperçu/téléchargement depuis la dépense. |
| Import véhicules et outillage Excel/PDF | ✅ Fait | Import XLSX/CSV/PDF depuis les listes Flotte et Outillage, détection des colonnes usuelles, doublons véhicules mis à jour et doublons outils ignorés. |
| Photos chantier par les équipes | ✅ Fait | Prise de photo directe depuis le téléphone, classement avant/pendant/après et note de suivi, en plus du dépôt documentaire complet. |
| Logo entreprise dans logiciel et documents | ✅ Fait | Import PNG/JPG/WebP dans Paramètres, logo utilisé dans la navigation et les PDF. Logo LIRIA fourni déjà importé. |
| Utilisation complète sur mobile | ✅ Fait | Navigation par menu latéral coulissant, en-tête compact, cartes et formulaires empilés, boutons tactiles, tableaux défilants horizontalement et fenêtres adaptées à la hauteur du téléphone. Tests validés à 360 px et 390 px. |
| Espace propriétaire SaaS | ✅ Fait | Liste des entreprises, codes, membres, statut d’abonnement, échéance et note ; accès réservé au propriétaire en auth réelle. |
| Stock inspiré d’une application GitHub existante | ⏳ En attente de source | Le socle est opérationnel. Comparaison/fusion détaillée à faire dès réception du dépôt GitHub annoncé par l’utilisateur. |

## Dépendances externes restantes

1. Envoi email entièrement automatique avec PDF joint : choisir un domaine d’envoi et fournir une clé Resend/SMTP.
2. OCR des factures ou catalogues scannés sans texte : choisir un service OCR si les PDF image sont fréquents.
3. Passage en authentification réelle : sauvegarde, `DISABLE_EMAIL_LOGIN=false`, puis script manuel `supabase/production/sortie_mode_prototype.sql`.
