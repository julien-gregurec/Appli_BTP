# Passage en production — LIRIA CONCEPT

> Le script manuel de sortie du prototype est prêt mais **non appliqué**. Il est volontairement rangé hors des migrations automatiques, car son application coupe immédiatement le mode prototype anonyme.

## Préconditions déjà vérifiées le 12 juillet 2026

- L’entreprise `ENT-001` est bien `LIRIA CONCEPT`.
- Elle possède un membre actif et un poste Admin/Gérant.
- Le profil public du propriétaire existe et pointe sur `ENT-001` comme entreprise active.
- Le compte Supabase Auth correspondant existe, a un mot de passe, un email confirmé et a déjà réussi une connexion.
- Le script de production passe en transaction de test puis peut être annulé sans modifier la base. Nouveau dry-run après migrations 30–37 réussi ; rollback contrôlé (fonction prototype + accès anon + 46 policies anon toujours présents).
- **Correctif 2026-07-12 :** le script réaccorde désormais toutes les RPC appelées par l’application après les migrations 30 à 37 : accès/postes, rattachement par code, import stock, validation des pointages, justificatifs fournisseurs et espace propriétaire.
- **Renforcement 2026-07-13 validé :** les migrations 43 et 44 sont appliquées. La 43 impose les droits `gerer_*` au niveau RLS, stockage et wrappers RPC ; la 44 prépare les comptes depuis les fiches employés. Le script de production réaccorde `a_permission` après avoir retiré les droits anonymes.

## Décisions et actions avant la coupure

1. Choisir l’URL de production et l’hébergement (Vercel recommandé pour ce projet Next.js).
2. Créer ou vérifier une sauvegarde Supabase restaurable avant la bascule.
3. Dans Supabase Auth, renseigner le `Site URL` de production et autoriser les redirections `https://liria-concept-gestion-btp.vercel.app/auth/callback` et `http://localhost:3000/auth/callback`.
4. Dans **Authentication → Email Templates**, utiliser les liens SSR suivants :
   - confirmation d’inscription : `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`
   - récupération de mot de passe : `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/nouveau-mot-de-passe`
   Ces liens évitent de dépendre du navigateur ayant initié la demande et créent correctement la session en cookie.
5. Configurer sur l’hébergement :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (clé publiable)
   - `DISABLE_EMAIL_LOGIN=false`
6. Tester la connexion du propriétaire, la confirmation d’un compte test et « Mot de passe oublié » sur un environnement de préproduction avec `DISABLE_EMAIL_LOGIN=false`.
7. Appliquer manuellement `supabase/production/sortie_mode_prototype.sql` dans Supabase.
8. Vérifier qu’un appel REST anonyme aux tables métier est refusé, puis tester en session authentifiée : dashboard, création devis, facture, paiement, document privé, commande, dépense et inventaire.
9. Déployer la production et conserver le mode prototype uniquement sur une base locale/de démonstration séparée.

## Services externes encore optionnels

- Envoi automatique des devis/factures par email avec pièce jointe : choisir un fournisseur SMTP/Resend et fournir sa clé.
- Domaine personnalisé et adresse d’envoi professionnelle.
- Sauvegardes/PITR selon le plan Supabase choisi.

## Retour arrière d’urgence

Ne pas remettre `DISABLE_EMAIL_LOGIN=true` sur une base durcie : la fonction prototype aura été supprimée. Restaurer la sauvegarde pré-migration ou réappliquer explicitement la migration 08 sur une base de démonstration isolée.
