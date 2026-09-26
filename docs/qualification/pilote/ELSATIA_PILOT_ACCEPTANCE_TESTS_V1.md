# ELSATIA GP — Acceptance tests terrain (pilote externe accompagné, V1)

143 contrôles terrain, dérivés de l'inventaire réel des routes et actions serveur du produit (pas
une liste générique) — voir `docs/qualification/ELSATIA_EXTERNAL_PILOT_ACCEPTANCE_PACK_V1.md` pour
le contexte, la fixture (`supabase/production/seed_entreprise_pilote_btp.sql`) et le verdict
GO/NO-GO. Criticité : **P0** (bloque le pilote), **P1** (pilote possible avec contournement),
**P2** (acceptable en pilote accompagné, à corriger avant extension).

Profils : Gérant (G), Administratif (A), Chef de chantier (CC), Chef d'équipe (CE), Ouvrier (O).

## Onboarding (ON)

| ID | Profil | Action | Résultat attendu | Criticité |
| --- | --- | --- | --- | --- |
| ON-01 | G | Créer une nouvelle entreprise depuis `/onboarding` | Entreprise créée, gérant affecté automatiquement au poste « Gérant » | P0 |
| ON-02 | G | Renseigner les paramètres (SIRET, adresse, logo) sur `/parametres` | Champs enregistrés, logo affiché dans l'en-tête des documents | P1 |
| ON-03 | G | Installer les rôles prédéfinis depuis `/parametres/acces` | 9 rôles créés avec leurs permissions par défaut | P0 |
| ON-04 | G | Créer une fiche salarié sans e-mail | Fiche créée, numéro d'inscription généré | P1 |
| ON-05 | Salarié | Activer son compte avec le numéro d'inscription depuis `/onboarding` | Compte utilisateur créé et lié à la fiche salarié | P0 |
| ON-06 | G | Créer un client puis un chantier sans client préalable | Création du chantier refusée tant qu'aucun client n'existe | P2 |
| ON-07 | G | Créer un devis puis l'envoyer par e-mail à un client de test | E-mail reçu avec PDF en pièce jointe, lien de consultation fonctionnel | P0 |
| ON-08 | G | Dérouler le wizard `/onboarding/demarrage` de bout en bout | Les 6 étapes suivies se cochent ; noter que rôles et premier document ne sont pas suivis (friction connue) | P2 |

## Dashboard (DB)

| ID | Profil | Action | Résultat attendu | Criticité |
| --- | --- | --- | --- | --- |
| DB-01 | G | Ouvrir le dashboard | KPI (CA, chantiers actifs, factures en retard) cohérents avec la fixture | P1 |
| DB-02 | G | Ignorer une alerte opérationnelle | Alerte disparaît du dashboard, réapparaît si « rétablir » | P2 |
| DB-03 | G | Déléguer une alerte à un autre utilisateur | Le destinataire reçoit une notification | P2 |

## Clients (CL)

| ID | Profil | Action | Résultat attendu | Criticité |
| --- | --- | --- | --- | --- |
| CL-01 | A | Créer un client particulier | Fiche créée, apparaît dans la liste filtrable | P1 |
| CL-02 | A | Créer un client professionnel (société) | Champs société/raison sociale correctement enregistrés | P1 |
| CL-03 | A | Modifier les conditions de paiement d'un client | Nouveau délai appliqué aux prochains devis/factures de ce client | P2 |
| CL-04 | A | Créer un client rapidement depuis l'écran devis (création rapide) | Client créé sans quitter le formulaire de devis | P2 |
| CL-05 | O | Accès direct à `/clients` par URL | Accès refusé (redirection dashboard) | P0 |
| CL-06 | A | Renseigner un `delai_paiement_jours` hors bornes (ex. 400) | Valeur plafonnée à 365 avec message explicite (friction connue si le message est absent) | P2 |

## Chantiers (CH)

| ID | Profil | Action | Résultat attendu | Criticité |
| --- | --- | --- | --- | --- |
| CH-01 | G | Créer un chantier lié à un client existant | Chantier créé, statut `prospect` par défaut | P1 |
| CH-02 | CC | Changer le statut d'un chantier (`accepte` → `en_cours`) | Statut mis à jour, visible sur le dashboard | P1 |
| CH-03 | CC | Ajouter une tâche à un chantier et la basculer faite/à faire | Tâche créée et son état bascule correctement | P2 |
| CH-04 | CC | Ajouter une photo de compte-rendu de chantier | Photo visible dans l'onglet comptes-rendus | P1 |
| CH-05 | CC | Générer le DOE d'un chantier | Document généré, téléchargeable | P2 |
| CH-06 | G | Convertir un devis accepté en chantier (`previsualiserChantierDepuisDevis`) | Chantier créé avec les bonnes informations client/adresse | P1 |
| CH-07 | CC | Affecter/retirer un employé d'un chantier (`equipes_chantiers`) | Équipe mise à jour, visible sur le planning | P1 |
| CH-08 | O | Accéder au détail d'un chantier où il n'est pas affecté | Accès refusé ou liste vide (isolation) | P0 |
| CH-09 | CC | Consulter la géolocalisation du chantier (`/chantiers/[id]/localisation`) | Carte affichée avec adresse correcte | P2 |

## Devis (DV)

| ID | Profil | Action | Résultat attendu | Criticité |
| --- | --- | --- | --- | --- |
| DV-01 | A | Créer un devis brouillon | Devis créé en statut `brouillon`, lignes calculées HT/TTC correctement | P0 |
| DV-02 | A | Dupliquer un devis existant | Copie créée avec un nouveau numéro | P2 |
| DV-03 | A | Envoyer un devis par e-mail (`envoyerDevisEmailAction`) | Devis passe en `envoye`, e-mail reçu avec PDF | P0 |
| DV-04 | Client (public) | Ouvrir le lien public `/document/[token]` d'un devis envoyé | Devis consultable sans authentification, PDF et photos visibles | P0 |
| DV-05 | Client (public) | Ouvrir le lien public d'un devis **brouillon** (URL forcée) | Accès refusé (garde brouillon) | P0 |
| DV-06 | G | Faire passer un devis de `envoye` à `accepte` | Notification interne envoyée aux membres `gerer_devis`, entrée journal d'activité créée | P1 |
| DV-07 | G | Refuser un devis | Statut `refuse`, devis non convertible en chantier | P2 |
| DV-08 | CC | Consulter un devis de son chantier via `/mes-travaux` | Quantités/tâches visibles, **aucun prix affiché** | P0 |
| DV-09 | O | Accès direct à `/devis` par URL | Accès refusé | P0 |
| DV-10 | A | Signer électroniquement un devis en interne (`signerDocumentMetierAction`) | Signature enregistrée, horodatée | P2 |
| DV-11 | A | Générer un devis assisté par IA (`genererDevisIAAction`) si activé | Brouillon de lignes proposé, modifiable avant envoi | P2 |
| DV-12 | A | Créer un devis sans chantier associé (client seul) | Devis créé, `chantier_id` nul accepté | P2 |

## Factures (FA) et avoirs (AV)

| ID | Profil | Action | Résultat attendu | Criticité |
| --- | --- | --- | --- | --- |
| FA-01 | A | Créer une facture depuis un devis accepté (type simple) | Facture créée en brouillon, lignes reprises du devis | P0 |
| FA-02 | A | Émettre la facture (`envoyee`) | Lignes verrouillées, impossible de les modifier après émission | P0 |
| FA-03 | A | Créer une facture d'acompte | Montant calculé selon le pourcentage prévu au devis | P1 |
| FA-04 | A | Créer une situation d'avancement sur un chantier en cours | Situation créée, cumul correct avec les situations précédentes | P1 |
| FA-05 | A | Enregistrer un paiement partiel | Statut passe à `payee_partiel` | P0 |
| FA-06 | A | Enregistrer un paiement soldant le reste dû | Statut passe à `payee` | P0 |
| FA-07 | A | Tenter d'enregistrer un paiement dépassant le montant TTC | Refusé (protection TOCTOU sur `enregistrer_paiement_facture`) | P0 |
| FA-08 | G | Constater une facture en retard (`en_retard`) | Statut basculé automatiquement après échéance dépassée | P1 |
| FA-09 | G | Déclencher une relance manuelle sur une facture en retard | E-mail de relance prévisualisé puis envoyé, historique visible | P1 |
| FA-10 | A | Modifier l'échéance d'une facture émise | Refusé — échéance gelée après émission (affichage figé, pas de formulaire) | P1 |
| AV-01 | G | Créer un avoir sur une facture soldée | Avoir créé, statut facture d'origine `avoir_emis` | P1 |
| AV-02 | G | Tenter de créer un second avoir sur la même facture d'origine | Refusé (index unique anti-doublon) | P0 |
| AV-03 | Client (public) | Consulter le lien public d'une facture (`/document/[token]`) | Facture et PDF accessibles, photos/signatures visibles sans authentification | P0 |
| AV-04 | O | Accès direct à `/factures` par URL | Accès refusé | P0 |

## Commandes et fournisseurs (CM / FR)

| ID | Profil | Action | Résultat attendu | Criticité |
| --- | --- | --- | --- | --- |
| CM-01 | A | Créer un fournisseur | Fiche créée, visible dans la liste | P2 |
| CM-02 | A | Créer une commande fournisseur liée à un chantier | Commande créée en `brouillon` | P1 |
| CM-03 | A | Envoyer la commande au fournisseur | Statut `envoyee` | P2 |
| CM-04 | CC | Enregistrer une réception partielle | Statut `recue_partiel`, quantités reçues mises à jour, stock crédité | P1 |
| CM-05 | CC | Enregistrer la réception finale | Statut `recue` | P1 |
| CM-06 | A | Supprimer une commande en brouillon | Commande supprimée sans effet sur le stock | P2 |
| CM-07 | O | Accès direct à `/fournisseurs` par URL | Accès refusé | P1 |
| FR-01 | A | Désactiver un fournisseur | Fournisseur non proposé pour une nouvelle commande | P2 |
| FR-02 | A | Créer rapidement un fournisseur depuis l'écran commande | Fournisseur créé sans quitter le formulaire | P2 |
| FR-03 | A | Lier une dépense fournisseur à une commande reçue | Dépense créée, montant TTC calculé correctement | P1 |

## Stock (ST)

| ID | Profil | Action | Résultat attendu | Criticité |
| --- | --- | --- | --- | --- |
| ST-01 | O | Effectuer une sortie de stock depuis la borne (`/stock/borne`) avec code personnel | Mouvement enregistré, quantité décrémentée | P0 |
| ST-02 | CC | Effectuer une entrée de stock | Quantité incrémentée | P1 |
| ST-03 | G | Consulter un article sous son seuil d'alerte | Article signalé visuellement | P2 |
| ST-04 | A | Modifier le prix d'achat d'un article | Nouveau prix appliqué aux futurs mouvements | P2 |
| ST-05 | A | Importer un fichier stock (Excel/CSV) | Articles importés sans doublon | P2 |
| ST-06 | G | Clôturer un inventaire | Écarts calculés et affichés | P2 |
| ST-07 | O | Utiliser la borne stock avec un mauvais code personnel | Accès refusé | P1 |
| ST-08 | O | Accès direct à `/stock` (hors borne) par URL | Accès conforme à `acces_stock` du poste (ouvrier : borne uniquement, pas la vue de gestion complète) | P1 |

## Dépenses et notes de frais (DP / NF)

| ID | Profil | Action | Résultat attendu | Criticité |
| --- | --- | --- | --- | --- |
| DP-01 | A | Consulter une dépense fournisseur liée à une commande reçue | Montants HT/TVA/TTC cohérents | P2 |
| DP-02 | A | Enregistrer un règlement fournisseur partiel | Solde restant dû recalculé | P1 |
| DP-03 | A | Joindre un justificatif PDF/image à une dépense | Justificatif visible, OCR déclenché si activé | P2 |
| DP-04 | A | Classer une dépense sur un chantier | Dépense visible dans le suivi budgétaire du chantier | P2 |
| DP-05 | A | Générer l'export ZIP des notes de frais pour l'expert-comptable | Archive téléchargée avec manifeste SHA-256 | P2 |
| NF-01 | O | Saisir une note de frais avec justificatif photo | Note créée en `soumise` | P0 |
| NF-02 | A | Valider une note de frais soumise | Statut `validee`, employé notifié | P1 |
| NF-03 | A | Refuser une note de frais avec motif | Statut `refusee`, motif visible par le salarié | P1 |
| NF-04 | A | Marquer une note validée comme remboursée | Statut `remboursee` | P2 |
| NF-05 | O | Modifier une note de frais déjà validée | Refusé ou verrouillé (pas de modification post-validation) | P1 |

## Personnel et paie (PE / PA)

| ID | Profil | Action | Résultat attendu | Criticité |
| --- | --- | --- | --- | --- |
| PE-01 | A | Créer une fiche salarié complète (contrat, taux horaire) | Fiche créée, coût horaire enregistré dans `employes_cout_horaire` | P1 |
| PE-02 | G | Consulter le taux/coût horaire d'un salarié | Visible uniquement pour gérant/RH/comptable | P0 |
| PE-03 | CC/CE/O | Tenter de consulter le taux/coût horaire d'un collègue (via écran ou capture réseau) | Non affiché dans l'UI (planning/pointage n'exposent que `id,prenom,nom`) — voir réserve RLS structurelle P1-5 du rapport principal | P1 |
| PE-04 | A | Importer/supprimer une carte BTP sur une fiche salarié | Numéro et échéance enregistrés | P2 |
| PE-05 | A | Anonymiser un salarié parti (`anonymiserEmployeAction`) | Colonnes personnelles vidées, fichiers Storage associés purgés | P1 |
| PE-06 | O | Enregistrer sa propre signature électronique | Signature enregistrée et réutilisable sur les documents internes | P2 |
| PE-07 | A | Révoquer l'appareil mobile d'un salarié parti | Session mobile invalidée | P1 |
| PA-01 | A | Créer une période de paie | Période créée, synchronisation des pointages validés déclenchée | P1 |
| PA-02 | A | Consulter un dossier de paie individuel | Temps, absences, primes, indemnités cohérents avec le pointage | P1 |
| PA-03 | A | Justifier une anomalie de paie détectée | Anomalie clôturée avec justification tracée | P2 |
| PA-04 | O | Accès direct à `/paie` par URL | Accès refusé | P0 |
| PA-05 | CC | Accès direct à `/paie` par URL | Accès refusé | P0 |
| PA-06 | A | Paramétrer un profil de paie salarié | Paramètres appliqués à la prochaine période | P2 |

## Planning (PL)

| ID | Profil | Action | Résultat attendu | Criticité |
| --- | --- | --- | --- | --- |
| PL-01 | CC | Créer une affectation planning pour son équipe | Affectation visible sur le planning du chantier | P0 |
| PL-02 | CC | Tenter d'affecter un employé inactif (compte non activé) | Refusé avec message explicite (pas une erreur brute) | P1 |
| PL-03 | CC | Modifier une affectation existante | Modification appliquée, historique conservé | P2 |
| PL-04 | CC | Supprimer plusieurs affectations en une fois | Suppression groupée réussie | P2 |
| PL-05 | O | Consulter son propre planning | Voit uniquement ses affectations | P1 |
| PL-06 | CE | Consulter les heures cumulées de son équipe (`voir_heures_chantiers`) | Cumul correct, pas d'accès à la validation | P2 |

## Pointage (PT)

| ID | Profil | Action | Résultat attendu | Criticité |
| --- | --- | --- | --- | --- |
| PT-01 | O | Pointer son arrivée avec GPS activé | Pointage enregistré avec coordonnées et précision | P0 |
| PT-02 | O | Pointer son arrivée sans GPS (motif renseigné) | Pointage enregistré en `origine_pointage='arrivee_oubliee'` ou motif explicite | P1 |
| PT-03 | O | Pointer son départ | Heures normales/supplémentaires calculées | P0 |
| PT-04 | O | Déclarer un pointage oublié a posteriori | Pointage créé avec statut `a_verifier` | P1 |
| PT-05 | CC | Valider un pointage `a_verifier` de son équipe | Statut passe à `valide` | P0 |
| PT-06 | CC | Rejeter un pointage avec preuve | Pointage rejeté, salarié notifié | P1 |
| PT-07 | O | Supprimer son propre pointage validé | Refusé (verrouillé après validation) | P1 |
| PT-08 | A | Créer une fiche de pointage pour un salarié depuis l'administration | Pointage créé au nom du salarié, tracé comme régularisation | P2 |

## Congés (CG)

| ID | Profil | Action | Résultat attendu | Criticité |
| --- | --- | --- | --- | --- |
| CG-01 | O | Déposer une demande de congés payés | Demande créée en `soumise` | P1 |
| CG-02 | G | Approuver une demande de congés | Statut `approuvee`, synchronisé avec le planning (absence bloquée) | P1 |
| CG-03 | G | Refuser une demande avec motif | Statut `refusee`, motif visible par le salarié | P1 |
| CG-04 | O | Modifier une demande déjà approuvée | Refusé ou nécessite une nouvelle demande | P2 |

## Exports (EX)

| ID | Profil | Action | Résultat attendu | Criticité |
| --- | --- | --- | --- | --- |
| EX-01 | A | Générer l'export comptable (ventes/achats/TVA) sur une période | Fichier Excel/CSV cohérent avec les factures de la période | P1 |
| EX-02 | G | Lancer l'export RGPD de données entreprise | Export JSON téléchargeable, manifeste de fichiers inclus | P0 |
| EX-03 | O | Accès direct à `/exports` par URL | Accès refusé | P0 |
| EX-04 | A | Filtrer un export comptable sur une période sans données | Export vide généré sans erreur | P2 |
| EX-05 | A | Générer l'export ZIP notes de frais pour une période donnée | Archive téléchargée avec manifeste SHA-256 | P2 |

## Messagerie (MS)

| ID | Profil | Action | Résultat attendu | Criticité |
| --- | --- | --- | --- | --- |
| MS-01 | CC | Créer une conversation interne liée à un chantier | Conversation créée, participants notifiés | P2 |
| MS-02 | O | Envoyer un message avec photo dans la conversation de son chantier | Message et pièce jointe visibles par toute l'équipe | P1 |
| MS-03 | O | Accéder à une conversation d'un chantier où il n'est pas affecté | Accès refusé ou conversation non listée | P1 |
| MS-04 | A | Utiliser la suggestion de réponse assistée par IA (si activée) | Brouillon proposé, modifiable avant envoi | P2 |

## Documents et DOE (DOC)

| ID | Profil | Action | Résultat attendu | Criticité |
| --- | --- | --- | --- | --- |
| DOC-01 | CC | Ajouter un document à un chantier | Document visible dans l'onglet documents | P1 |
| DOC-02 | A | Analyser un document par IA (`analyserDocumentIAAction`) si activé | Résumé/extraction proposée | P2 |
| DOC-03 | Client (public) | Télécharger le PDF public d'un devis/facture via `/imprimer/partage/[token]` | PDF téléchargé sans authentification, cohérent avec la version envoyée | P0 |
| DOC-04 | Client (public) | Consulter une photo/signature protégée via le lien public | Média accessible via la route de partage scopée au jeton, pas via la route authentifiée directe | P0 |

## RGPD (RG)

| ID | Profil | Action | Résultat attendu | Criticité |
| --- | --- | --- | --- | --- |
| RG-01 | G | Lancer un export de données entreprise à blanc (test) | Export généré, contrôle de droit vérifié (`gerer_parametres`) | P0 |
| RG-02 | G | Déposer une demande de suppression d'entreprise | Délai de grâce de 30 jours affiché, action journalisée | P1 |
| RG-03 | G | Annuler une demande de suppression en cours de délai de grâce | Suppression annulée, entreprise réactivée normalement | P1 |
| RG-04 | A | Anonymiser un salarié parti | Données personnelles vidées, fichiers Storage purgés | P1 |
| RG-05 | O | Demander l'accès à ses propres données personnelles | Redirigé vers l'entreprise pilote (responsable de traitement), pas de canal direct avec ELSATIA | P2 |

## Sécurité et cloisonnement des rôles (SEC)

| ID | Profil | Action | Résultat attendu | Criticité |
| --- | --- | --- | --- | --- |
| SEC-01 | O | Accès direct par URL à `/employes/[id]/modifier` d'un collègue | Accès refusé (middleware) | P0 |
| SEC-02 | O | Accès direct par URL à `/parametres/acces` | Accès refusé | P0 |
| SEC-03 | O | Accès direct par URL à `/rentabilite` et `/tresorerie` | Accès refusé | P0 |
| SEC-04 | Entreprise B (autre pilote/démo) | Tenter d'accéder à un chantier/client/facture de l'entreprise pilote par ID direct | Isolation multi-entreprise respectée, accès refusé | P0 |
| SEC-05 | O | Inspecter les appels réseau (onglet Network) pendant une session normale (planning, pointage, mes-travaux) | Aucun champ `taux_horaire`/`cout_horaire`/notes RH d'un tiers dans les réponses | P1 |
| SEC-06 | CC | Tenter une mutation RH via un appel reconstruit à la main (sans passer par l'UI) vers une action réservée à `gerer_employes` | Refusé côté serveur (défense en profondeur indépendante du middleware) | P0 |
| SEC-07 | Support plateforme | Vérifier qu'une session support plateforme active ne permet pas de s'auto-attribuer un siège ou une permission permanente | Refusé (`est_membre_actif_reel`, correctif déjà fusionné) | P0 |
| SEC-08 | Membre poste « lecture » plateforme | Tenter de s'auto-promouvoir rôle plateforme `total` | Refusé (`plateforme_ajouter_admin` exige déjà le rôle `total`) | P0 |
| SEC-09 | G | Vérifier qu'un devis/une facture en `brouillon` n'est ni envoyable par e-mail, ni consultable via un lien public | Garde brouillon respectée sur les deux canaux | P0 |
| SEC-10 | A | Vérifier qu'une facture émise ne peut pas recevoir de nouvelles lignes | Trigger `trg_lignes_factures_brouillon_only` bloque l'insertion | P0 |

## Support et incident (SUP)

| ID | Profil | Action | Résultat attendu | Criticité |
| --- | --- | --- | --- | --- |
| SUP-01 | G | Envoyer un message support depuis `/plateforme/support` | Message reçu côté plateforme, notification e-mail déclenchée (best effort) | P1 |
| SUP-02 | Support plateforme | Répondre à un message support | Réponse visible côté entreprise pilote, notifiée par e-mail | P1 |
| SUP-03 | G | Suivre la procédure perte d'accès (mot de passe oublié) | Vérification d'identité en 4 points respectée, accès restauré | P0 |
| SUP-04 | G | Simuler un incident « facture bloquée » et suivre la checklist incident (§11 du rapport principal) | Distinction correcte entre verrou métier attendu et anomalie réelle | P1 |
