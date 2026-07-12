# Passage en production — LIRIA CONCEPT

> Le script manuel de sortie du prototype est prêt mais **non appliqué**. Il est volontairement rangé hors des migrations automatiques, car son application coupe immédiatement le mode prototype anonyme.

## Préconditions déjà vérifiées le 12 juillet 2026

- L’entreprise `ENT-001` est bien `LIRIA CONCEPT`.
- Elle possède un membre actif et un poste Admin/Gérant.
- Le profil public du propriétaire existe et pointe sur `ENT-001` comme entreprise active.
- Le compte Supabase Auth correspondant existe, a un mot de passe, un email confirmé et a déjà réussi une connexion.
- Le script de production passe en transaction de test puis peut être annulé sans modifier la base.
- **Correctif 2026-07-12 (audit reprise Claude) :** le script `sortie_mode_prototype.sql` re-donnait `EXECUTE` à `authenticated` sur 15 RPC mais en oubliait 6 pourtant appelées par l'app (`creer_poste_avec_permissions`, `enregistrer_permissions_poste`, `modifier_poste_membre`, `supprimer_poste_vide`, `importer_articles_stock`, `valider_preuve_pointage`). Sans elles, la gestion des accès/postes, l'import d'articles/nuanciers et la validation des preuves de pointage auraient renvoyé « permission denied » après la coupure. Les 6 grants ont été ajoutés au script.

## Décisions et actions avant la coupure

1. Choisir l’URL de production et l’hébergement (Vercel recommandé pour ce projet Next.js).
2. Créer ou vérifier une sauvegarde Supabase restaurable avant la bascule.
3. Dans Supabase Auth, renseigner le `Site URL` de production et les URLs de redirection locales/production.
4. Configurer sur l’hébergement :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (clé publiable)
   - `DISABLE_EMAIL_LOGIN=false`
5. Tester la connexion du propriétaire sur un environnement de préproduction avec `DISABLE_EMAIL_LOGIN=false`.
6. Appliquer manuellement `supabase/production/sortie_mode_prototype.sql` dans Supabase.
7. Vérifier qu’un appel REST anonyme aux tables métier est refusé, puis tester en session authentifiée : dashboard, création devis, facture, paiement, document privé, commande, dépense et inventaire.
8. Déployer la production et conserver le mode prototype uniquement sur une base locale/de démonstration séparée.

## Services externes encore optionnels

- Envoi automatique des devis/factures par email avec pièce jointe : choisir un fournisseur SMTP/Resend et fournir sa clé.
- Domaine personnalisé et adresse d’envoi professionnelle.
- Sauvegardes/PITR selon le plan Supabase choisi.

## Retour arrière d’urgence

Ne pas remettre `DISABLE_EMAIL_LOGIN=true` sur une base durcie : la fonction prototype aura été supprimée. Restaurer la sauvegarde pré-migration ou réappliquer explicitement la migration 08 sur une base de démonstration isolée.
