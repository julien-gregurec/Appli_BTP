-- ELSATIA RÉSERVES V6 — SQL PROPOSÉ, **NON INTÉGRÉ**
--
-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │  BLOQUÉE PAR TRAIN GLOBAL                                                 │
-- │                                                                           │
-- │  Ce fichier n'est PAS une migration. Il vit délibérément hors de          │
-- │  `supabase/migrations/`, ne porte aucun numéro, et ne doit être joué par  │
-- │  aucun environnement en l'état.                                           │
-- │                                                                           │
-- │  Le train de migrations ELSATIA est consolidé en parallèle de ce lot :    │
-- │  allouer un numéro ici entrerait en collision avec cette consolidation.   │
-- │  Le contenu ci-dessous est donc RÉDIGÉ, argumenté et prêt, et sera        │
-- │  numéroté depuis le train canonique quand celui-ci sera figé.             │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- Ce que ce fichier NE contient pas, volontairement :
--
--   • aucune policy `update` sur `storage.objects`. Le défaut P0 du dépôt de photo
--     (un renvoi échouait définitivement) venait d'un code qui demandait l'écrasement,
--     PAS d'une policy manquante. L'absence de `update` et de `delete` sur les objets
--     photo est une garantie du produit — « un fichier déposé ne peut être ni écrasé ni
--     effacé depuis l'application » — et le correctif V6 aligne le code sur elle plutôt
--     que de l'affaiblir. Il a été livré en TypeScript, sans SQL.


-- ── 1. Rattachement d'une entreprise intervenante : exiger le consentement ───
--
-- CONSTAT (P2, démontré). `reserves_intervenants` accorde `update` au rôle
-- `authenticated`, et la policy ne vérifie que le droit `gerer_intervenants` sur
-- l'organisation HÔTE. Une organisation hôte peut donc écrire directement, par l'API de
-- données :
--
--     PATCH /rest/v1/reserves_intervenants?id=eq.<le sien>
--     { "entreprise_intervenante_id": "<n'importe quelle organisation>",
--       "statut": "active", "rejoint_at": "..." }
--
-- et rattacher ainsi une organisation tierce à son chantier SANS son accord. Les
-- utilisateurs de cette organisation — si elle dispose déjà de Réserves — voient alors
-- apparaître un chantier qu'ils n'ont jamais accepté, et peuvent y être adressés par la
-- messagerie interne.
--
-- PORTÉE RÉELLE, MESURÉE EN RECETTE (P1). Il n'y a pas de fuite d'un tenant vers un
-- autre : l'hôte n'expose que ses propres données. Ce qui casse est plus grave pour ce
-- produit-ci — la TRAÇABILITÉ du porteur d'une réserve. La même écriture directe
-- DESSAISIT instantanément l'entreprise précédente :
--
--   avant  : entreprise_intervenante_id = F  → F voit ses réserves
--   PATCH  : entreprise_intervenante_id = B  → HTTP 200
--   après  : F voit []  ·  revoque_at = NULL  ·  historique_acces_applications = 0 ligne
--
-- Autrement dit, l'entreprise qui portait les réserves perd tout accès sans qu'aucune
-- révocation ne soit enregistrée, et sans que rien ne dise quand ni par qui. Le chemin
-- métier prévu (`reserves_revoquer_intervenant`) grave `revoque_at`, `revoque_par`, et
-- avertit même du nombre de réserves restées ouvertes ; l'écriture directe court-circuite
-- tout cela. Pour une application dont la valeur EST le constat contradictoire entre deux
-- entreprises, un changement de porteur sans trace est un défaut d'intégrité, pas un
-- inconfort.
--
-- CORRECTIF PROPOSÉ. Interdire, par trigger, toute modification directe des colonnes qui
-- portent le rattachement. Elles restent modifiables par les fonctions `security definer`
-- du domaine, qui vérifient le consentement et tracent — c'est exactement la mécanique
-- déjà employée pour le statut d'une réserve (`reserves_garde_workflow`).

create or replace function public.reserves_garde_rattachement()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Les fonctions du domaine posent ce drapeau le temps de leur transaction.
  if coalesce(current_setting('elsatia.reserves_rattachement', true), 'off') = 'on' then
    return new;
  end if;
  if new.entreprise_intervenante_id is distinct from old.entreprise_intervenante_id
     or new.statut is distinct from old.statut
     or new.rejoint_at is distinct from old.rejoint_at
     or new.entreprise_id is distinct from old.entreprise_id
     or new.chantier_id is distinct from old.chantier_id
  then
    raise exception
      'Rattachement d''une entreprise intervenante interdit en écriture directe : '
      'passez par l''invitation, la désignation ou la révocation';
  end if;
  return new;
end;
$$;

create trigger reserves_intervenants_garde_rattachement
  before update on public.reserves_intervenants
  for each row execute function public.reserves_garde_rattachement();

revoke all on function public.reserves_garde_rattachement() from public, anon, authenticated;

-- Les trois fonctions qui ONT le droit de rattacher doivent alors poser le drapeau :
--   • `reserves_designer_entreprise_intervenante(uuid, uuid)`
--   • `reserves_invitation_accepter(text, uuid)`
--   • `reserves_revoquer_intervenant(uuid)` et `reserves_reactiver_intervenant(uuid)`
-- en encadrant leur `update` par :
--     perform set_config('elsatia.reserves_rattachement', 'on', true);
--     ... update ...
--     perform set_config('elsatia.reserves_rattachement', 'off', true);
--
-- (Le corps complet de ces quatre fonctions n'est pas recopié ici : il devra être repris
-- depuis le train canonique au moment de la numérotation, pour ne pas figer une version
-- qui aurait divergé entre-temps.)


-- ── 2. Désignation sans consentement : la restreindre aux organisations publiées ──
--
-- `reserves_designer_entreprise_intervenante` accepte AUJOURD'HUI n'importe quel
-- identifiant présent dans `entreprises`, alors que l'écran, lui, ne propose que les
-- organisations publiées à l'annuaire. L'écart n'est pas exploitable pour lire quoi que ce
-- soit, mais il permet d'adresser une organisation qui n'a jamais demandé à être
-- démarchée. Aligner la fonction sur l'écran ferme l'écart :

--   if not exists (
--     select 1 from public.reserves_annuaire_publication a
--     where a.entreprise_id = p_entreprise_intervenante_id and a.publiee
--   ) then
--     raise exception 'Cette organisation n''est pas publiée à l''annuaire ELSATIA : '
--                     'invitez-la par lien plutôt que de la désigner';
--   end if;


-- ── 3. Recherche à l'annuaire : neutraliser les jokers de `like` ─────────────
--
-- CONSTAT (P2). `reserves_annuaire_rechercher` compose `'%' || v_terme || '%'` sans
-- échapper `%` et `_`. Un terme de trois caractères composé de jokers (« %%% ») satisfait
-- donc la borne « trois caractères minimum » tout en équivalant à « tout ». La portée est
-- limitée — seules les organisations qui ont CHOISI de se publier sont concernées, et le
-- résultat est plafonné à vingt lignes — mais la borne des trois caractères existe
-- précisément pour empêcher de balayer l'annuaire, et elle ne le fait pas.
--
-- CORRECTIF : échapper les jokers avant composition.

--   v_motif text := replace(replace(replace(v_terme, '\', '\\'), '%', '\%'), '_', '\_');
--   ...
--   where ... e.nom ilike '%' || v_motif || '%' escape '\'


-- ── 4. Registre d'idempotence : purge ───────────────────────────────────────
--
-- `reserves_mutations_appliquees` (migration candidate 271) ne connaît aucune expiration.
-- Une clé de mutation n'a plus d'utilité passé quelques jours — la file locale, elle, est
-- bornée par le plafond de tentatives. Une purge périodique évite qu'une table technique
-- ne grossisse indéfiniment sur un parc actif. Ce n'est pas un défaut de sécurité, c'est
-- une dette d'exploitation à ouvrir avant la mise en service.

--   delete from public.reserves_mutations_appliquees where created_at < now() - interval '90 days';
