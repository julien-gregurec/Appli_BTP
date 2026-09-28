-- DR V2 — contrôle Stripe OBLIGATOIRE après toute restauration (garde anti-réouverture).
--
-- Une sauvegarde fige les droits tels qu'ils étaient à `backup_at`. Tout événement Stripe
-- postérieur (échec de paiement, résiliation, remboursement) est PERDU par la restauration :
-- sans rejeu, un accès suspendu ou un droit révoqué depuis la sauvegarde est ROUVERT.
--
-- Ce contrôle liste, par l'état local seul, les droits OUVERTS dont la dernière décision Stripe
-- connue est antérieure ou égale à `backup_at` : leur état ne peut pas être tenu pour vrai
-- tant que les événements Stripe créés depuis `backup_at` n'ont pas été rejoués (Events API
-- `created[gte]`, renvoi aux webhooks). Une ligne = un droit à confirmer.
-- Usage : psql -v backup_at='<horodatage UTC>' -f stripe_controle_post_restauration.sql
select 'GP|' || e.id || '|' || e.abonnement_statut || '|' || coalesce(o.dernier_evenement_created::text, 'aucun_filigrane')
  from public.entreprises e
  left join public.stripe_objets_ordre o on o.flux = 'abonnement' and o.objet_type = 'entreprise_acces' and o.objet_id = e.id::text
 where e.stripe_subscription_id is not null
   and e.abonnement_statut in ('actif', 'essai')
   and coalesce(o.dernier_evenement_created, '-infinity') <= :'backup_at'::timestamptz
union all
select 'TOOLS|' || s.external_subscription_id || '|' || s.status || '|' || coalesce(o.dernier_evenement_created::text, 'aucun_filigrane')
  from public.tools_monetization_subscriptions s
  join public.entitlements_utilisateurs_elsatia en on en.source = 'web' and en.metadata->>'reference_externe' = s.external_subscription_id
  left join public.stripe_objets_ordre o on o.flux = 'tools' and o.objet_type = 'subscription' and o.objet_id = s.external_subscription_id
 where s.provider = 'stripe' and en.revoked_at is null
   and coalesce(o.dernier_evenement_created, '-infinity') <= :'backup_at'::timestamptz
order by 1;
