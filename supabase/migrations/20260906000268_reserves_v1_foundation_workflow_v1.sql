-- ELSATIA-RESERVES-V1-FOUNDATION-AND-WORKFLOW-V1
--
-- Socle de l'application ELSATIA Réserves : levée des réserves de chantier, du constat
-- jusqu'à la validation, avec les entreprises intervenantes invitées.
--
-- Migration strictement ADDITIVE et POSTÉRIEURE au train post-cutover canonique
-- (ledger 265, migrations 00266 / 00267 conservées telles quelles). Aucune table, aucune
-- fonction et aucune policy existante n'est réécrite : ce fichier ne fait qu'ajouter le
-- domaine `reserves_*` et inscrire l'application au catalogue multi-app de 00234.
--
-- Trois décisions structurantes portées ici :
--
--   1. Réserves est une APPLICATION INDÉPENDANTE. Elle possède ses propres chantiers et
--      fonctionne sans Gestion Pro. Le lien vers un chantier GP est facultatif, nullable,
--      et n'est jamais requis par une contrainte ni par une policy.
--
--   2. L'ENTREPRISE INTERVENANTE INVITÉE est une entreprise ELSATIA à part entière, pas
--      un compte fantôme : elle est son propre tenant. Elle n'accède donc jamais aux
--      données du chantier hôte par appartenance, mais uniquement aux réserves qui lui
--      sont nominativement attribuées, via `reserves_intervenant_courant()`.
--
--   3. Le WORKFLOW est déclaratif et vérifié côté base. La table `reserves_transitions`
--      est la seule source de vérité des changements d'état ; un trigger interdit toute
--      mutation de `statut` qui ne passe pas par les RPC métier. Le frontend ne peut pas
--      inventer une transition.
--
-- Ce que cette migration ne fait PAS : ouvrir les données métier d'une autre entreprise,
-- affaiblir une RLS existante, brancher un canal de notification réel, ni implémenter la
-- synchronisation hors-ligne (seuls ses points d'ancrage d'idempotence sont posés).

-- ── 1. Inscription au catalogue multi-app ────────────────────────────────────
-- `statut_produit = 'interne'` : l'application est active (donc accessible au
-- propriétaire global, cf. 00266) mais n'est pas annoncée comme commercialisée, et
-- `url_production` reste nulle tant qu'aucun domaine n'est servi.
insert into public.applications_elsatia (
  code, nom, description, ordre, url_locale, url_production, icone, statut_produit
) values (
  'reserves', 'ELSATIA Réserves',
  'Réserves de chantier : constat, attribution, levée et validation',
  40, 'http://localhost:3020', null, 'reserves', 'interne'
)
on conflict (code) do update
  set nom = excluded.nom,
      description = excluded.description,
      ordre = excluded.ordre,
      url_locale = excluded.url_locale,
      icone = excluded.icone;

-- Rôles applicatifs. `reserves_intervenant` est le compte gratuit limité de l'entreprise
-- extérieure : il ne donne aucun droit d'émission ni de validation, et sa visibilité est
-- entièrement portée par l'attribution nominative des réserves.
insert into public.roles_applications_elsatia (application_code, code, nom, description, ordre) values
  ('reserves','reserves_admin_organisation','Administrateur ELSATIA Réserves','Paramètres, chantiers, plans, intervenants et validation des levées',10),
  ('reserves','reserves_responsable','Responsable des réserves','Attribue les réserves, valide ou refuse les levées',20),
  ('reserves','reserves_emetteur','Émetteur de réserves','Constate et attribue des réserves, sans pouvoir valider une levée',30),
  ('reserves','reserves_intervenant','Intervenant entreprise invitée','Compte gratuit limité aux réserves attribuées à son entreprise',40),
  ('reserves','reserves_consultation','Consultation ELSATIA Réserves','Lecture seule et export',50)
on conflict (application_code, code) do update
  set nom = excluded.nom, description = excluded.description, ordre = excluded.ordre;

-- ── 2. Machine à états, déclarative ──────────────────────────────────────────
-- Table de référence plutôt que `case` enfoui dans une fonction : la matrice des
-- transitions est lisible, requêtable et testable telle quelle. `acteur` distingue
-- l'organisation hôte de l'entreprise intervenante : c'est ce qui empêche un hôte
-- d'accepter une responsabilité à la place de son sous-traitant, et réciproquement.
create table public.reserves_transitions (
  statut_avant text not null,
  statut_apres text not null,
  acteur text not null check (acteur in ('hote','intervenant')),
  action text not null,
  commentaire_obligatoire boolean not null default false,
  primary key (statut_avant, statut_apres, acteur)
);

insert into public.reserves_transitions (statut_avant, statut_apres, acteur, action, commentaire_obligatoire) values
  ('emise','assignee','hote','assignation',false),
  ('emise','annulee','hote','annulation',true),
  ('assignee','acceptee','intervenant','acceptation',false),
  ('assignee','refusee_responsabilite','intervenant','refus_responsabilite',true),
  ('assignee','assignee','hote','reassignation',false),
  ('assignee','annulee','hote','annulation',true),
  ('refusee_responsabilite','assignee','hote','reassignation',false),
  ('refusee_responsabilite','annulee','hote','annulation',true),
  ('acceptee','levee_demandee','intervenant','demande_levee',false),
  ('acceptee','annulee','hote','annulation',true),
  ('levee_demandee','levee','hote','levee_validee',false),
  ('levee_demandee','levee_refusee','hote','levee_refusee',true),
  ('levee_refusee','levee_demandee','intervenant','demande_levee',false),
  ('levee','assignee','hote','reouverture',true);

-- ── 3. Chantiers propres à Réserves ──────────────────────────────────────────
-- `chantier_gp_id` référence la table `chantiers` de Gestion Pro, qui vit dans le même
-- schéma : la clé étrangère est un confort d'intégrité, pas une dépendance produit.
-- Une organisation qui n'a jamais ouvert Gestion Pro laisse la colonne nulle et ne
-- perd aucune fonctionnalité.
create table public.reserves_chantiers (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  nom text not null check (btrim(nom) <> '' and length(nom) <= 180),
  reference text check (reference is null or length(reference) <= 80),
  adresse text check (adresse is null or length(adresse) <= 400),
  code_postal text check (code_postal is null or code_postal ~ '^[0-9A-Za-z -]{2,12}$'),
  ville text check (ville is null or length(ville) <= 120),
  statut text not null default 'en_cours' check (statut in ('en_cours','receptionne','clos')),
  date_reception date,
  source text not null default 'reserves' check (source in ('reserves','gestion_pro')),
  chantier_gp_id uuid references public.chantiers(id) on delete set null,
  synchronise_at timestamptz,
  compteur_reserves integer not null default 0 check (compteur_reserves >= 0),
  created_by uuid not null default auth.uid() references public.utilisateurs(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (entreprise_id, nom),
  check ((source = 'gestion_pro') = (chantier_gp_id is not null)),
  check (statut <> 'receptionne' or date_reception is not null)
);
create unique index reserves_chantiers_gp_unique
  on public.reserves_chantiers (entreprise_id, chantier_gp_id) where chantier_gp_id is not null;
create index reserves_chantiers_entreprise_idx
  on public.reserves_chantiers (entreprise_id, statut, created_at desc);

-- ── 4. Plans, niveaux et zones ───────────────────────────────────────────────
-- Contrat minimal et honnête : un plan est un document rattaché à un chantier, situé par
-- un niveau et une zone facultatifs. Le rendu graphique complet (calques, échelle, PDF
-- multipages) relève d'un lot dédié ; ici seule la donnée réellement persistée existe.
create table public.reserves_plans (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  chantier_id uuid not null references public.reserves_chantiers(id) on delete cascade,
  nom text not null check (btrim(nom) <> '' and length(nom) <= 180),
  niveau text check (niveau is null or length(niveau) <= 80),
  zone text check (zone is null or length(zone) <= 120),
  storage_path text check (storage_path is null or length(storage_path) <= 500),
  mime_type text check (mime_type is null or mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  ordre integer not null default 0,
  created_by uuid not null default auth.uid() references public.utilisateurs(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index reserves_plans_identite_unique
  on public.reserves_plans (chantier_id, nom, coalesce(niveau,''), coalesce(zone,''));
create index reserves_plans_chantier_idx on public.reserves_plans (chantier_id, ordre);

-- ── 5. Entreprises intervenantes invitées ────────────────────────────────────
-- Une ligne existe dès que l'hôte nomme une entreprise sur son chantier, même si cette
-- entreprise n'a pas encore de compte ELSATIA (`entreprise_intervenante_id` nul). Le
-- rattachement à un vrai tenant est un second temps, explicite et réversible.
create table public.reserves_intervenants (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  chantier_id uuid not null references public.reserves_chantiers(id) on delete cascade,
  nom text not null check (btrim(nom) <> '' and length(nom) <= 180),
  corps_etat text check (corps_etat is null or length(corps_etat) <= 120),
  email_contact text check (email_contact is null or email_contact ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  telephone_contact text check (telephone_contact is null or length(telephone_contact) <= 40),
  entreprise_intervenante_id uuid references public.entreprises(id) on delete set null,
  statut text not null default 'invitee' check (statut in ('invitee','active','revoquee')),
  invite_at timestamptz,
  rejoint_at timestamptz,
  revoque_at timestamptz,
  created_by uuid not null default auth.uid() references public.utilisateurs(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chantier_id, nom),
  -- Une entreprise ne peut pas s'inviter elle-même comme intervenante extérieure.
  check (entreprise_intervenante_id is null or entreprise_intervenante_id <> entreprise_id),
  check (statut <> 'active' or (entreprise_intervenante_id is not null and rejoint_at is not null)),
  check (statut <> 'revoquee' or revoque_at is not null)
);
create unique index reserves_intervenants_compte_unique
  on public.reserves_intervenants (chantier_id, entreprise_intervenante_id)
  where entreprise_intervenante_id is not null;
create index reserves_intervenants_compte_idx
  on public.reserves_intervenants (entreprise_intervenante_id, statut) where entreprise_intervenante_id is not null;

-- ── 6. La réserve ────────────────────────────────────────────────────────────
-- `photo_obligatoire_levee` est porté PAR RÉSERVE, jamais par un réglage global : c'est
-- l'émetteur qui décide, réserve par réserve, si une preuve photographique conditionne
-- la demande de levée. Une réserve de finition esthétique et une reprise structurelle
-- n'appellent pas la même exigence.
--
-- `position_x` / `position_y` sont des fractions normalisées du document de plan (0..1).
-- Aucun repère métrique n'est inventé : ce qui n'est pas mesuré n'est pas stocké.
create table public.reserves (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  chantier_id uuid not null references public.reserves_chantiers(id) on delete cascade,
  numero integer not null check (numero > 0),
  titre text not null check (btrim(titre) <> '' and length(titre) <= 200),
  description text check (description is null or length(description) <= 4000),
  statut text not null default 'emise' check (statut in (
    'emise','assignee','refusee_responsabilite','acceptee',
    'levee_demandee','levee_refusee','levee','annulee'
  )),
  priorite text not null default 'normale' check (priorite in ('basse','normale','haute','bloquante')),
  intervenant_id uuid references public.reserves_intervenants(id) on delete restrict,
  plan_id uuid references public.reserves_plans(id) on delete set null,
  position_x numeric(6,5) check (position_x is null or position_x between 0 and 1),
  position_y numeric(6,5) check (position_y is null or position_y between 0 and 1),
  photo_obligatoire_levee boolean not null default false,
  echeance date,
  cree_par uuid not null default auth.uid() references public.utilisateurs(id) on delete restrict,
  -- Point d'ancrage de l'idempotence hors-ligne : un client qui rejoue une création
  -- déjà synchronisée retombe sur la même réserve au lieu d'en créer un doublon.
  -- La synchronisation elle-même n'est PAS implémentée par ce lot.
  origine_client_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  assignee_at timestamptz,
  acceptee_at timestamptz,
  levee_demandee_at timestamptz,
  levee_at timestamptz,
  cloturee_at timestamptz,
  unique (chantier_id, numero),
  check ((position_x is null) = (position_y is null)),
  check (position_x is null or plan_id is not null),
  -- Hors `emise` et `annulee`, une réserve est nécessairement portée par un intervenant.
  check (statut in ('emise','annulee') or intervenant_id is not null)
);
create unique index reserves_origine_client_unique
  on public.reserves (entreprise_id, origine_client_id) where origine_client_id is not null;
create index reserves_chantier_statut_idx on public.reserves (chantier_id, statut, created_at desc);
create index reserves_intervenant_idx on public.reserves (intervenant_id, statut) where intervenant_id is not null;
create index reserves_echeance_idx on public.reserves (entreprise_id, echeance)
  where echeance is not null and statut not in ('levee','annulee');
create index reserves_plan_idx on public.reserves (plan_id) where plan_id is not null;

-- ── 7. Photos ────────────────────────────────────────────────────────────────
create table public.reserves_photos (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  reserve_id uuid not null references public.reserves(id) on delete cascade,
  storage_path text not null check (btrim(storage_path) <> '' and length(storage_path) <= 500),
  usage text not null check (usage in ('constat','preuve_refus','travaux','levee')),
  legende text check (legende is null or length(legende) <= 500),
  mime_type text not null default 'image/jpeg'
    check (mime_type in ('image/jpeg','image/png','image/webp','image/heic')),
  taille_octets integer check (taille_octets is null or taille_octets between 1 and 26214400),
  ajoutee_par uuid not null default auth.uid() references public.utilisateurs(id) on delete restrict,
  ajoutee_par_entreprise_id uuid not null references public.entreprises(id) on delete restrict,
  origine_client_id uuid,
  created_at timestamptz not null default now(),
  unique (entreprise_id, storage_path)
);
create index reserves_photos_reserve_idx on public.reserves_photos (reserve_id, usage, created_at desc);

-- ── 8. Historique immuable ───────────────────────────────────────────────────
-- Append-only : aucune policy `update`/`delete`, et le droit correspondant est révoqué
-- explicitement pour `authenticated`. Qui, quoi, quand, et l'avant/après quand il a un
-- sens (statut, intervenant, échéance).
create table public.reserves_historique (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  reserve_id uuid not null references public.reserves(id) on delete cascade,
  action text not null check (action in (
    'creation','assignation','reassignation','acceptation','refus_responsabilite',
    'commentaire','photo_ajoutee','demande_levee','levee_validee','levee_refusee',
    'reouverture','annulation','modification'
  )),
  statut_avant text,
  statut_apres text,
  champ text check (champ is null or length(champ) <= 80),
  valeur_avant text check (valeur_avant is null or length(valeur_avant) <= 500),
  valeur_apres text check (valeur_apres is null or length(valeur_apres) <= 500),
  commentaire text check (commentaire is null or length(commentaire) <= 2000),
  auteur_id uuid references public.utilisateurs(id) on delete set null,
  auteur_entreprise_id uuid references public.entreprises(id) on delete set null,
  created_at timestamptz not null default now()
);
create index reserves_historique_reserve_idx on public.reserves_historique (reserve_id, created_at);

-- ── 9. Messagerie ────────────────────────────────────────────────────────────
-- Une conversation portant un `intervenant_id` est partagée avec cette entreprise ;
-- une conversation sans intervenant reste interne à l'organisation hôte. Une entreprise
-- invitée ne voit donc jamais les échanges internes ni ceux d'un autre corps d'état.
create table public.reserves_conversations (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  chantier_id uuid not null references public.reserves_chantiers(id) on delete cascade,
  reserve_id uuid references public.reserves(id) on delete cascade,
  intervenant_id uuid references public.reserves_intervenants(id) on delete cascade,
  portee text not null check (portee in ('chantier','reserve')),
  titre text not null check (btrim(titre) <> '' and length(titre) <= 200),
  created_by uuid not null default auth.uid() references public.utilisateurs(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((portee = 'reserve') = (reserve_id is not null))
);
create unique index reserves_conversations_reserve_unique
  on public.reserves_conversations (reserve_id) where reserve_id is not null;
create index reserves_conversations_chantier_idx on public.reserves_conversations (chantier_id, updated_at desc);

create table public.reserves_messages (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  conversation_id uuid not null references public.reserves_conversations(id) on delete cascade,
  auteur_id uuid not null default auth.uid() references public.utilisateurs(id) on delete restrict,
  auteur_entreprise_id uuid not null references public.entreprises(id) on delete restrict,
  contenu text not null check (btrim(contenu) <> '' and length(contenu) <= 4000),
  created_at timestamptz not null default now()
);
create index reserves_messages_conversation_idx on public.reserves_messages (conversation_id, created_at);

-- ── 10. File d'événements de notification ────────────────────────────────────
-- V1 : le contrat existe et la file est écrite par les RPC métier. AUCUN canal externe
-- n'est branché — pas d'e-mail, pas de push. `distribue_at` reste nul, et c'est un lot
-- ultérieur qui consommera cette file.
create table public.reserves_evenements_notifications (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  chantier_id uuid references public.reserves_chantiers(id) on delete cascade,
  reserve_id uuid references public.reserves(id) on delete cascade,
  type text not null check (type in (
    'reserve_creee','reserve_assignee','reserve_annulee','reserve_reouverte',
    'responsabilite_refusee','message_recu','echeance_proche',
    'levee_demandee','levee_validee','levee_refusee'
  )),
  destinataire_entreprise_id uuid references public.entreprises(id) on delete cascade,
  destinataire_utilisateur_id uuid references public.utilisateurs(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  canal text check (canal is null or canal in ('email','push','in_app')),
  distribue_at timestamptz,
  created_at timestamptz not null default now()
);
create index reserves_notifications_file_idx
  on public.reserves_evenements_notifications (entreprise_id, created_at desc) where distribue_at is null;

-- ── 11. Prédicats d'autorisation ─────────────────────────────────────────────
-- Rôle applicatif de l'utilisateur courant dans l'organisation hôte. Même forme que
-- `colors_role_courant` : la décision reste portée par `a_acces_application`, jamais
-- par une comparaison d'e-mail ni par une permission métier Gestion Pro.
create or replace function public.reserves_role_courant(p_entreprise_id uuid)
returns text language sql security definer stable set search_path = public as $$
  select h.role_code
  from public.habilitations_applications_utilisateurs h
  join public.roles_applications_elsatia r
    on r.application_code = h.application_code and r.code = h.role_code and r.actif
  where h.entreprise_id = p_entreprise_id
    and h.utilisateur_id = auth.uid()
    and h.application_code = 'reserves'
    and h.autorise
    and (h.valide_du is null or h.valide_du <= now())
    and (h.valide_jusqu_au is null or h.valide_jusqu_au > now())
    and not public.est_plateforme_admin()
    and public.a_acces_application(p_entreprise_id, 'reserves')
  limit 1;
$$;

-- Actions de l'organisation HÔTE. Le propriétaire global / admin plateforme n'obtient
-- ici que la lecture, et seulement sous session support explicitement ouverte : le
-- catalogue d'applications lui est ouvert, les données d'un client ne le sont pas.
create or replace function public.reserves_action_autorisee(p_entreprise_id uuid, p_action text)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare v_role text;
begin
  if auth.uid() is null or p_entreprise_id is null then return false; end if;
  if public.est_plateforme_admin() then
    return p_action = 'voir' and public.est_acces_support_actif(p_entreprise_id);
  end if;
  v_role := public.reserves_role_courant(p_entreprise_id);
  if v_role is null then return false; end if;
  -- `reserves_intervenant` est le rôle du compte gratuit invité : sur son propre tenant
  -- il ne peut rien piloter. Sa visibilité vient exclusivement de l'attribution.
  if v_role = 'reserves_intervenant' then return false; end if;
  if p_action in ('voir','exporter') then return true; end if;
  if v_role = 'reserves_consultation' then return false; end if;
  if p_action in ('creer_reserve','assigner','commenter') then return true; end if;
  if p_action in ('valider_levee','gerer_chantier','gerer_plans','gerer_intervenants') then
    return v_role in ('reserves_admin_organisation','reserves_responsable');
  end if;
  if p_action in ('gerer_parametres','inviter_entreprise') then
    return v_role = 'reserves_admin_organisation';
  end if;
  return false;
end;
$$;

-- Côté entreprise INVITÉE. La visibilité n'est pas dérivée d'une appartenance au
-- chantier hôte : elle est portée par la ligne d'intervenant, active, rattachée à un
-- tenant dont l'utilisateur courant est membre actif et titulaire d'un accès Réserves.
create or replace function public.reserves_intervenant_courant(p_intervenant_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select p_intervenant_id is not null
    and auth.uid() is not null
    and exists (
      select 1
      from public.reserves_intervenants i
      where i.id = p_intervenant_id
        and i.statut = 'active'
        and i.entreprise_intervenante_id is not null
        and public.est_membre_actif(i.entreprise_intervenante_id)
        and public.a_acces_application(i.entreprise_intervenante_id, 'reserves')
    );
$$;

-- Qualité de l'acteur courant sur une réserve donnée, au sens de la machine à états.
-- `null` = aucun droit d'agir. L'hôte l'emporte si l'utilisateur est des deux côtés.
create or replace function public.reserves_acteur_courant(p_reserve_id uuid)
returns text language plpgsql security definer stable set search_path = public as $$
declare v_entreprise uuid; v_intervenant uuid;
begin
  select r.entreprise_id, r.intervenant_id into v_entreprise, v_intervenant
  from public.reserves r where r.id = p_reserve_id;
  if v_entreprise is null then return null; end if;
  if public.reserves_role_courant(v_entreprise) is not null
     and public.reserves_action_autorisee(v_entreprise, 'commenter') then
    return 'hote';
  end if;
  if public.reserves_intervenant_courant(v_intervenant) then return 'intervenant'; end if;
  return null;
end;
$$;

-- Lecture d'une réserve : l'organisation hôte, ou l'entreprise à qui elle est attribuée.
create or replace function public.reserves_lecture_autorisee(p_reserve_id uuid)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare v_entreprise uuid; v_intervenant uuid;
begin
  select r.entreprise_id, r.intervenant_id into v_entreprise, v_intervenant
  from public.reserves r where r.id = p_reserve_id;
  if v_entreprise is null then return false; end if;
  return public.reserves_action_autorisee(v_entreprise, 'voir')
      or public.reserves_intervenant_courant(v_intervenant);
end;
$$;

-- ── 12. Triggers d'intégrité ─────────────────────────────────────────────────
create or replace function public.reserves_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;

-- Numérotation par chantier, sérialisée par le verrou de ligne pris sur le compteur :
-- deux créations concurrentes ne peuvent pas obtenir le même numéro.
create or replace function public.reserves_numeroter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.reserves_chantiers
  set compteur_reserves = compteur_reserves + 1, updated_at = now()
  where id = new.chantier_id
  returning compteur_reserves into new.numero;
  if new.numero is null then raise exception 'Chantier Réserves introuvable'; end if;
  return new;
end;
$$;

-- Cohérence référentielle inter-tables : le chantier, le plan et l'intervenant d'une
-- réserve appartiennent tous à la même organisation et au même chantier. Sans cela, un
-- appelant pourrait rattacher une réserve au plan d'un autre client.
create or replace function public.reserves_valider_coherence()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_chantier_entreprise uuid; v_plan_chantier uuid; v_intervenant_chantier uuid;
begin
  select entreprise_id into v_chantier_entreprise
  from public.reserves_chantiers where id = new.chantier_id;
  if v_chantier_entreprise is distinct from new.entreprise_id then
    raise exception 'Chantier Réserves invalide pour cette organisation';
  end if;
  if new.plan_id is not null then
    select chantier_id into v_plan_chantier from public.reserves_plans where id = new.plan_id;
    if v_plan_chantier is distinct from new.chantier_id then
      raise exception 'Plan invalide pour ce chantier';
    end if;
  end if;
  if new.intervenant_id is not null then
    select chantier_id into v_intervenant_chantier
    from public.reserves_intervenants where id = new.intervenant_id;
    if v_intervenant_chantier is distinct from new.chantier_id then
      raise exception 'Intervenant invalide pour ce chantier';
    end if;
  end if;
  return new;
end;
$$;

-- Garde de la machine à états. Toute mutation des champs de workflow exige le drapeau
-- transactionnel posé par les RPC métier : un `update` direct depuis PostgREST, même
-- autorisé par la policy, ne peut pas franchir un état.
create or replace function public.reserves_garde_workflow()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('elsatia.reserves_transition', true), 'off') = 'on' then
    return new;
  end if;
  if new.statut is distinct from old.statut
     or new.intervenant_id is distinct from old.intervenant_id
     or new.entreprise_id is distinct from old.entreprise_id
     or new.chantier_id is distinct from old.chantier_id
     or new.numero is distinct from old.numero
     or new.cree_par is distinct from old.cree_par
     or new.assignee_at is distinct from old.assignee_at
     or new.acceptee_at is distinct from old.acceptee_at
     or new.levee_demandee_at is distinct from old.levee_demandee_at
     or new.levee_at is distinct from old.levee_at
     or new.cloturee_at is distinct from old.cloturee_at
  then
    raise exception 'Transition de réserve interdite : utilisez une action métier ELSATIA Réserves';
  end if;
  return new;
end;
$$;

create or replace function public.reserves_historiser_creation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.reserves_historique (
    entreprise_id, reserve_id, action, statut_apres, auteur_id, auteur_entreprise_id
  ) values (
    new.entreprise_id, new.id, 'creation', new.statut, auth.uid(), new.entreprise_id
  );
  return new;
end;
$$;

create trigger reserves_chantiers_updated before update on public.reserves_chantiers
  for each row execute function public.reserves_set_updated_at();
create trigger reserves_plans_updated before update on public.reserves_plans
  for each row execute function public.reserves_set_updated_at();
create trigger reserves_intervenants_updated before update on public.reserves_intervenants
  for each row execute function public.reserves_set_updated_at();
create trigger reserves_conversations_updated before update on public.reserves_conversations
  for each row execute function public.reserves_set_updated_at();
create trigger reserves_numerotation before insert on public.reserves
  for each row execute function public.reserves_numeroter();
create trigger reserves_coherence before insert or update on public.reserves
  for each row execute function public.reserves_valider_coherence();
create trigger reserves_workflow_garde before update on public.reserves
  for each row execute function public.reserves_garde_workflow();
create trigger reserves_updated before update on public.reserves
  for each row execute function public.reserves_set_updated_at();
create trigger reserves_creation_historisee after insert on public.reserves
  for each row execute function public.reserves_historiser_creation();

-- ── 13. Cœur du workflow ─────────────────────────────────────────────────────
-- Seul chemin d'écriture d'un changement d'état. La transition est validée contre
-- `reserves_transitions` — donc contre la matrice, pas contre du code applicatif — puis
-- historisée et notifiée dans la même transaction que la mutation.
create or replace function public.reserves_appliquer_transition(
  p_reserve_id uuid,
  p_statut_apres text,
  p_commentaire text default null,
  p_intervenant_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_reserve public.reserves;
  v_acteur text;
  v_transition public.reserves_transitions;
  v_intervenant uuid;
  v_entreprise_intervenante uuid;
  v_type_notification text;
  v_destinataire uuid;
begin
  select * into v_reserve from public.reserves where id = p_reserve_id for update;
  if not found then raise exception 'Réserve introuvable'; end if;

  v_acteur := public.reserves_acteur_courant(p_reserve_id);
  if v_acteur is null then raise exception 'Action non autorisée sur cette réserve'; end if;

  select * into v_transition from public.reserves_transitions
  where statut_avant = v_reserve.statut and statut_apres = p_statut_apres and acteur = v_acteur;
  if not found then
    raise exception 'Transition % → % impossible pour l''acteur %',
      v_reserve.statut, p_statut_apres, v_acteur;
  end if;

  if v_transition.commentaire_obligatoire and coalesce(btrim(p_commentaire), '') = '' then
    raise exception 'Un motif est obligatoire pour l''action %', v_transition.action;
  end if;

  -- Attribution : seule une action d'assignation peut changer l'intervenant porteur.
  v_intervenant := v_reserve.intervenant_id;
  if v_transition.action in ('assignation','reassignation') then
    if p_intervenant_id is null then raise exception 'Aucune entreprise intervenante fournie'; end if;
    v_intervenant := p_intervenant_id;
  elsif p_intervenant_id is not null and p_intervenant_id is distinct from v_reserve.intervenant_id then
    raise exception 'Cette action ne peut pas réattribuer la réserve';
  end if;

  -- La levée demandée est conditionnée, réserve par réserve, à la preuve photographique
  -- exigée par l'émetteur. Le contrôle est ici, en base : le frontend ne peut pas le
  -- contourner en appelant directement la RPC.
  if v_transition.action = 'demande_levee' and v_reserve.photo_obligatoire_levee then
    if not exists (
      select 1 from public.reserves_photos
      where reserve_id = p_reserve_id and usage in ('travaux','levee')
    ) then
      raise exception 'Photo obligatoire : ajoutez une preuve avant de demander la levée';
    end if;
  end if;

  perform set_config('elsatia.reserves_transition', 'on', true);
  update public.reserves set
    statut = p_statut_apres,
    intervenant_id = v_intervenant,
    assignee_at = case when v_transition.action in ('assignation','reassignation','reouverture')
                       then now() else assignee_at end,
    acceptee_at = case when v_transition.action = 'acceptation' then now()
                       when v_transition.action = 'reouverture' then null else acceptee_at end,
    levee_demandee_at = case when v_transition.action = 'demande_levee' then now()
                             when v_transition.action = 'reouverture' then null else levee_demandee_at end,
    levee_at = case when v_transition.action = 'levee_validee' then now()
                    when v_transition.action = 'reouverture' then null else levee_at end,
    cloturee_at = case when p_statut_apres in ('levee','annulee') then now() else null end
  where id = p_reserve_id;
  perform set_config('elsatia.reserves_transition', 'off', true);

  insert into public.reserves_historique (
    entreprise_id, reserve_id, action, statut_avant, statut_apres,
    champ, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_entreprise_id
  ) values (
    v_reserve.entreprise_id, p_reserve_id, v_transition.action, v_reserve.statut, p_statut_apres,
    case when v_intervenant is distinct from v_reserve.intervenant_id then 'intervenant_id' end,
    case when v_intervenant is distinct from v_reserve.intervenant_id then v_reserve.intervenant_id::text end,
    case when v_intervenant is distinct from v_reserve.intervenant_id then v_intervenant::text end,
    nullif(btrim(coalesce(p_commentaire, '')), ''), auth.uid(),
    case when v_acteur = 'hote' then v_reserve.entreprise_id else null end
  );

  select i.entreprise_intervenante_id into v_entreprise_intervenante
  from public.reserves_intervenants i where i.id = v_intervenant;

  v_type_notification := case v_transition.action
    when 'assignation' then 'reserve_assignee'
    when 'reassignation' then 'reserve_assignee'
    when 'refus_responsabilite' then 'responsabilite_refusee'
    when 'demande_levee' then 'levee_demandee'
    when 'levee_validee' then 'levee_validee'
    when 'levee_refusee' then 'levee_refusee'
    when 'reouverture' then 'reserve_reouverte'
    when 'annulation' then 'reserve_annulee'
    else null end;

  -- Le destinataire est l'autre partie : ce que l'hôte décide part vers l'entreprise
  -- intervenante, ce que l'intervenant déclare remonte à l'organisation hôte.
  v_destinataire := case when v_acteur = 'hote' then v_entreprise_intervenante
                         else v_reserve.entreprise_id end;

  if v_type_notification is not null then
    insert into public.reserves_evenements_notifications (
      entreprise_id, chantier_id, reserve_id, type, destinataire_entreprise_id, payload
    ) values (
      v_reserve.entreprise_id, v_reserve.chantier_id, p_reserve_id, v_type_notification,
      v_destinataire,
      jsonb_build_object(
        'statut_avant', v_reserve.statut, 'statut_apres', p_statut_apres,
        'numero', v_reserve.numero, 'titre', v_reserve.titre
      )
    );
  end if;
end;
$$;

-- ── 14. Actions métier ───────────────────────────────────────────────────────
create or replace function public.reserves_creer(
  p_chantier_id uuid,
  p_titre text,
  p_description text default null,
  p_priorite text default 'normale',
  p_intervenant_id uuid default null,
  p_plan_id uuid default null,
  p_position_x numeric default null,
  p_position_y numeric default null,
  p_photo_obligatoire_levee boolean default false,
  p_echeance date default null,
  p_origine_client_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_entreprise uuid; v_id uuid;
begin
  select entreprise_id into v_entreprise from public.reserves_chantiers where id = p_chantier_id;
  if v_entreprise is null then raise exception 'Chantier Réserves introuvable'; end if;
  if not public.reserves_action_autorisee(v_entreprise, 'creer_reserve') then
    raise exception 'Création de réserve non autorisée';
  end if;

  -- Idempotence hors-ligne : rejouer une création déjà synchronisée renvoie la réserve
  -- existante au lieu d'en produire un doublon.
  if p_origine_client_id is not null then
    select id into v_id from public.reserves
    where entreprise_id = v_entreprise and origine_client_id = p_origine_client_id;
    if v_id is not null then return v_id; end if;
  end if;

  insert into public.reserves (
    entreprise_id, chantier_id, titre, description, priorite, intervenant_id,
    plan_id, position_x, position_y, photo_obligatoire_levee, echeance,
    statut, assignee_at, origine_client_id
  ) values (
    v_entreprise, p_chantier_id, p_titre, p_description, coalesce(p_priorite,'normale'),
    p_intervenant_id, p_plan_id, p_position_x, p_position_y,
    coalesce(p_photo_obligatoire_levee, false), p_echeance,
    case when p_intervenant_id is null then 'emise' else 'assignee' end,
    case when p_intervenant_id is null then null else now() end,
    p_origine_client_id
  ) returning id into v_id;

  if p_intervenant_id is not null then
    insert into public.reserves_evenements_notifications (
      entreprise_id, chantier_id, reserve_id, type, destinataire_entreprise_id, payload
    )
    select v_entreprise, p_chantier_id, v_id, 'reserve_assignee', i.entreprise_intervenante_id,
           jsonb_build_object('titre', p_titre)
    from public.reserves_intervenants i where i.id = p_intervenant_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.reserves_assigner(
  p_reserve_id uuid, p_intervenant_id uuid, p_commentaire text default null
) returns void language sql security definer set search_path = public as $$
  select public.reserves_appliquer_transition(p_reserve_id, 'assignee', p_commentaire, p_intervenant_id);
$$;

-- Acceptation ou refus de responsabilité par l'entreprise intervenante. Le refus exige
-- un motif ; la preuve photographique est facultative mais rattachée au même geste.
create or replace function public.reserves_repondre_responsabilite(
  p_reserve_id uuid,
  p_accepte boolean,
  p_motif text default null,
  p_photo_path text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_accepte then
    perform public.reserves_appliquer_transition(p_reserve_id, 'acceptee', p_motif);
  else
    if p_photo_path is not null then
      perform public.reserves_ajouter_photo(p_reserve_id, p_photo_path, 'preuve_refus', p_motif);
    end if;
    perform public.reserves_appliquer_transition(p_reserve_id, 'refusee_responsabilite', p_motif);
  end if;
end;
$$;

create or replace function public.reserves_demander_levee(
  p_reserve_id uuid, p_commentaire text default null
) returns void language sql security definer set search_path = public as $$
  select public.reserves_appliquer_transition(p_reserve_id, 'levee_demandee', p_commentaire);
$$;

create or replace function public.reserves_statuer_levee(
  p_reserve_id uuid, p_validee boolean, p_commentaire text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_entreprise uuid;
begin
  select entreprise_id into v_entreprise from public.reserves where id = p_reserve_id;
  if v_entreprise is null then raise exception 'Réserve introuvable'; end if;
  -- Statuer sur une levée est le geste de responsabilité : il est réservé au responsable
  -- des réserves et à l'administrateur, jamais au simple émetteur.
  if not public.reserves_action_autorisee(v_entreprise, 'valider_levee') then
    raise exception 'Validation de levée non autorisée';
  end if;
  perform public.reserves_appliquer_transition(
    p_reserve_id, case when p_validee then 'levee' else 'levee_refusee' end, p_commentaire
  );
end;
$$;

create or replace function public.reserves_rouvrir(
  p_reserve_id uuid, p_commentaire text
) returns void language plpgsql security definer set search_path = public as $$
declare v_entreprise uuid;
begin
  select entreprise_id into v_entreprise from public.reserves where id = p_reserve_id;
  if v_entreprise is null then raise exception 'Réserve introuvable'; end if;
  if not public.reserves_action_autorisee(v_entreprise, 'valider_levee') then
    raise exception 'Réouverture non autorisée';
  end if;
  perform public.reserves_appliquer_transition(p_reserve_id, 'assignee', p_commentaire);
end;
$$;

create or replace function public.reserves_annuler(
  p_reserve_id uuid, p_commentaire text
) returns void language sql security definer set search_path = public as $$
  select public.reserves_appliquer_transition(p_reserve_id, 'annulee', p_commentaire);
$$;

-- ── 15. Photos et commentaires ───────────────────────────────────────────────
create or replace function public.reserves_ajouter_photo(
  p_reserve_id uuid,
  p_storage_path text,
  p_usage text default 'constat',
  p_legende text default null,
  p_mime_type text default 'image/jpeg',
  p_taille_octets integer default null,
  p_origine_client_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_reserve public.reserves; v_acteur text; v_entreprise_auteur uuid; v_id uuid;
begin
  select * into v_reserve from public.reserves where id = p_reserve_id;
  if not found then raise exception 'Réserve introuvable'; end if;
  v_acteur := public.reserves_acteur_courant(p_reserve_id);
  if v_acteur is null then raise exception 'Ajout de photo non autorisé'; end if;

  if v_acteur = 'hote' then
    v_entreprise_auteur := v_reserve.entreprise_id;
  else
    select i.entreprise_intervenante_id into v_entreprise_auteur
    from public.reserves_intervenants i where i.id = v_reserve.intervenant_id;
  end if;

  insert into public.reserves_photos (
    entreprise_id, reserve_id, storage_path, usage, legende, mime_type,
    taille_octets, ajoutee_par_entreprise_id, origine_client_id
  ) values (
    v_reserve.entreprise_id, p_reserve_id, p_storage_path, coalesce(p_usage,'constat'),
    p_legende, coalesce(p_mime_type,'image/jpeg'), p_taille_octets,
    v_entreprise_auteur, p_origine_client_id
  )
  on conflict (entreprise_id, storage_path) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.reserves_photos
    where entreprise_id = v_reserve.entreprise_id and storage_path = p_storage_path;
    return v_id;
  end if;

  insert into public.reserves_historique (
    entreprise_id, reserve_id, action, statut_avant, statut_apres,
    champ, valeur_apres, commentaire, auteur_id, auteur_entreprise_id
  ) values (
    v_reserve.entreprise_id, p_reserve_id, 'photo_ajoutee', v_reserve.statut, v_reserve.statut,
    'photo', coalesce(p_usage,'constat'), p_legende, auth.uid(), v_entreprise_auteur
  );
  return v_id;
end;
$$;

-- Commentaire libre, tracé à l'historique. La conversation dédiée à la réserve est
-- créée à la demande et partagée avec l'entreprise porteuse — jamais avec les autres.
create or replace function public.reserves_commenter(
  p_reserve_id uuid, p_contenu text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_reserve public.reserves; v_acteur text; v_conversation uuid; v_entreprise_auteur uuid;
begin
  if coalesce(btrim(p_contenu), '') = '' then raise exception 'Message vide'; end if;
  select * into v_reserve from public.reserves where id = p_reserve_id;
  if not found then raise exception 'Réserve introuvable'; end if;
  v_acteur := public.reserves_acteur_courant(p_reserve_id);
  if v_acteur is null then raise exception 'Commentaire non autorisé'; end if;

  if v_acteur = 'hote' then
    v_entreprise_auteur := v_reserve.entreprise_id;
  else
    select i.entreprise_intervenante_id into v_entreprise_auteur
    from public.reserves_intervenants i where i.id = v_reserve.intervenant_id;
  end if;

  select id into v_conversation from public.reserves_conversations where reserve_id = p_reserve_id;
  if v_conversation is null then
    insert into public.reserves_conversations (
      entreprise_id, chantier_id, reserve_id, intervenant_id, portee, titre
    ) values (
      v_reserve.entreprise_id, v_reserve.chantier_id, p_reserve_id, v_reserve.intervenant_id,
      'reserve', 'Réserve n°' || v_reserve.numero || ' — ' || left(v_reserve.titre, 150)
    ) returning id into v_conversation;
  end if;

  insert into public.reserves_messages (
    entreprise_id, conversation_id, auteur_entreprise_id, contenu
  ) values (v_reserve.entreprise_id, v_conversation, v_entreprise_auteur, p_contenu);

  insert into public.reserves_historique (
    entreprise_id, reserve_id, action, statut_avant, statut_apres,
    commentaire, auteur_id, auteur_entreprise_id
  ) values (
    v_reserve.entreprise_id, p_reserve_id, 'commentaire', v_reserve.statut, v_reserve.statut,
    left(p_contenu, 2000), auth.uid(), v_entreprise_auteur
  );

  insert into public.reserves_evenements_notifications (
    entreprise_id, chantier_id, reserve_id, type, destinataire_entreprise_id, payload
  )
  select v_reserve.entreprise_id, v_reserve.chantier_id, p_reserve_id, 'message_recu',
         case when v_acteur = 'hote' then i.entreprise_intervenante_id else v_reserve.entreprise_id end,
         jsonb_build_object('numero', v_reserve.numero)
  from public.reserves_intervenants i where i.id = v_reserve.intervenant_id;

  return v_conversation;
end;
$$;

-- ── 16. Invitation d'une entreprise extérieure ───────────────────────────────
-- Deux temps délibérés. L'hôte DÉSIGNE l'entreprise et lui ouvre l'application ; c'est
-- ensuite un membre de cette entreprise qui REJOINT, en connaissance de cause. Un hôte
-- ne peut donc jamais écrire une habilitation dans le tenant d'un tiers à sa place.
create or replace function public.reserves_designer_entreprise_intervenante(
  p_intervenant_id uuid, p_entreprise_intervenante_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare v_hote uuid;
begin
  select entreprise_id into v_hote from public.reserves_intervenants where id = p_intervenant_id;
  if v_hote is null then raise exception 'Intervenant introuvable'; end if;
  if not public.reserves_action_autorisee(v_hote, 'inviter_entreprise') then
    raise exception 'Invitation non autorisée';
  end if;
  if p_entreprise_intervenante_id = v_hote then
    raise exception 'Une organisation ne peut pas s''inviter elle-même';
  end if;
  if not exists (select 1 from public.entreprises where id = p_entreprise_intervenante_id) then
    raise exception 'Entreprise intervenante introuvable';
  end if;

  update public.reserves_intervenants
  set entreprise_intervenante_id = p_entreprise_intervenante_id,
      invite_at = coalesce(invite_at, now())
  where id = p_intervenant_id and statut = 'invitee';
  if not found then raise exception 'Cet intervenant n''est plus au statut « invitée »'; end if;

  -- Compte gratuit limité : l'accès applicatif est ouvert avec une source explicite, et
  -- `do nothing` garantit qu'un client Réserves payant ne voit jamais son propre droit
  -- réécrit par l'invitation d'un tiers.
  insert into public.acces_applications_entreprises (
    entreprise_id, application_code, autorise, source, reference_externe
  ) values (
    p_entreprise_intervenante_id, 'reserves', true,
    'reserves_invitation_gratuite', p_intervenant_id::text
  )
  on conflict (entreprise_id, application_code) do nothing;

  insert into public.historique_acces_applications (
    cible_type, cible_id, application_code, action, auteur_email
  ) values (
    'entreprise', p_entreprise_intervenante_id, 'reserves',
    'invitation_intervenant:' || p_intervenant_id::text, auth.email()
  );
end;
$$;

create or replace function public.reserves_rejoindre_intervention(
  p_intervenant_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare v_cible uuid;
begin
  select entreprise_intervenante_id into v_cible
  from public.reserves_intervenants where id = p_intervenant_id and statut = 'invitee';
  if v_cible is null then raise exception 'Aucune invitation en attente pour cet intervenant'; end if;
  if not public.est_membre_actif(v_cible) then
    raise exception 'Vous n''êtes pas membre actif de l''entreprise invitée';
  end if;

  -- Habilitation gratuite au rôle strictement limité. `do nothing` protège un rôle
  -- Réserves supérieur déjà détenu par l'utilisateur dans sa propre organisation.
  insert into public.habilitations_applications_utilisateurs (
    entreprise_id, utilisateur_id, application_code, role_code, autorise, attribue_par
  ) values (
    v_cible, auth.uid(), 'reserves', 'reserves_intervenant', true, auth.uid()
  )
  on conflict (entreprise_id, utilisateur_id, application_code) do nothing;

  update public.reserves_intervenants
  set statut = 'active', rejoint_at = now()
  where id = p_intervenant_id;

  insert into public.historique_acces_applications (
    cible_type, cible_id, application_code, action, auteur_email
  ) values ('utilisateur', auth.uid(), 'reserves', 'intervenant_rejoint', auth.email());
end;
$$;

create or replace function public.reserves_revoquer_intervenant(
  p_intervenant_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare v_hote uuid;
begin
  select entreprise_id into v_hote from public.reserves_intervenants where id = p_intervenant_id;
  if v_hote is null then raise exception 'Intervenant introuvable'; end if;
  if not public.reserves_action_autorisee(v_hote, 'gerer_intervenants') then
    raise exception 'Révocation non autorisée';
  end if;
  update public.reserves_intervenants
  set statut = 'revoquee', revoque_at = now() where id = p_intervenant_id;
end;
$$;

-- ── 17. Passerelle Gestion Pro (facultative) ─────────────────────────────────
-- Sens GP → Réserves. L'appelant doit être habilité DES DEUX CÔTÉS : rôle Réserves qui
-- gère les chantiers, et permission Gestion Pro `acces_chantiers` dans la même
-- organisation. Aucun droit n'est déduit d'une application vers l'autre.
create or replace function public.reserves_importer_chantier_gp(
  p_chantier_gp_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gp public.chantiers; v_id uuid;
begin
  select * into v_gp from public.chantiers where id = p_chantier_gp_id;
  if not found then raise exception 'Chantier Gestion Pro introuvable'; end if;
  if not public.reserves_action_autorisee(v_gp.entreprise_id, 'gerer_chantier') then
    raise exception 'Import non autorisé côté Réserves';
  end if;
  if not public.a_permission(v_gp.entreprise_id, 'acces_chantiers') then
    raise exception 'Import non autorisé côté Gestion Pro';
  end if;

  select id into v_id from public.reserves_chantiers
  where entreprise_id = v_gp.entreprise_id and chantier_gp_id = p_chantier_gp_id;

  if v_id is null then
    insert into public.reserves_chantiers (
      entreprise_id, nom, source, chantier_gp_id, synchronise_at
    ) values (
      v_gp.entreprise_id, v_gp.nom, 'gestion_pro', p_chantier_gp_id, now()
    ) returning id into v_id;
  else
    update public.reserves_chantiers
    set nom = v_gp.nom, synchronise_at = now() where id = v_id;
  end if;
  return v_id;
end;
$$;

-- Sens Réserves → GP : compteurs et lien applicatif, sans exposer le détail des
-- réserves ni des entreprises intervenantes. C'est ce que Gestion Pro affichera sur
-- une fiche chantier, rien de plus.
create or replace function public.reserves_resume_chantier_gp(
  p_chantier_gp_id uuid
) returns table (
  chantier_reserves_id uuid, total bigint, ouvertes bigint,
  demandes_levee bigint, levees bigint, en_retard bigint
)
language sql security definer stable set search_path = public as $$
  select c.id,
         count(r.id),
         count(r.id) filter (where r.statut not in ('levee','annulee')),
         count(r.id) filter (where r.statut = 'levee_demandee'),
         count(r.id) filter (where r.statut = 'levee'),
         count(r.id) filter (where r.echeance < current_date and r.statut not in ('levee','annulee'))
  from public.reserves_chantiers c
  left join public.reserves r on r.chantier_id = c.id
  where c.chantier_gp_id = p_chantier_gp_id
    and public.reserves_action_autorisee(c.entreprise_id, 'voir')
  group by c.id;
$$;

-- ── 18. Tableau de bord ──────────────────────────────────────────────────────
-- Les filtres sont portés en base pour que les compteurs et la liste ne puissent pas
-- diverger, et pour qu'un intervenant obtienne exactement le sous-ensemble qu'il a le
-- droit de voir sans que le frontend ait à le savoir.
-- `p_entreprise_id` est FACULTATIF, et c'est une nécessité, pas un confort : une
-- entreprise intervenante invitée appartient à son propre tenant, alors que les réserves
-- qu'elle porte appartiennent à l'organisation hôte. Filtrer sur « son » entreprise lui
-- renverrait zéro alors qu'elle voit bien des réserves. Laissé nul, le décompte suit
-- exactement la visibilité réelle de l'appelant.
create or replace function public.reserves_tableau_de_bord(
  p_entreprise_id uuid default null,
  p_chantier_id uuid default null,
  p_intervenant_id uuid default null,
  p_statut text default null,
  p_priorite text default null,
  p_echeance_avant date default null
) returns table (
  total bigint, emises bigint, assignees bigint, refusees bigint, acceptees bigint,
  demandes_levee bigint, levees_refusees bigint, levees bigint, annulees bigint,
  en_attente bigint, en_retard bigint
)
language sql security definer stable set search_path = public as $$
  with visibles as (
    select r.* from public.reserves r
    where (p_entreprise_id is null or r.entreprise_id = p_entreprise_id)
      and (
        public.reserves_action_autorisee(r.entreprise_id, 'voir')
        or public.reserves_intervenant_courant(r.intervenant_id)
      )
      and (p_chantier_id is null or r.chantier_id = p_chantier_id)
      and (p_intervenant_id is null or r.intervenant_id = p_intervenant_id)
      and (p_statut is null or r.statut = p_statut)
      and (p_priorite is null or r.priorite = p_priorite)
      and (p_echeance_avant is null or (r.echeance is not null and r.echeance <= p_echeance_avant))
  )
  select count(*),
         count(*) filter (where statut = 'emise'),
         count(*) filter (where statut = 'assignee'),
         count(*) filter (where statut = 'refusee_responsabilite'),
         count(*) filter (where statut = 'acceptee'),
         count(*) filter (where statut = 'levee_demandee'),
         count(*) filter (where statut = 'levee_refusee'),
         count(*) filter (where statut = 'levee'),
         count(*) filter (where statut = 'annulee'),
         -- « En attente » = la balle est dans le camp de l'organisation hôte.
         count(*) filter (where statut in ('emise','levee_demandee')),
         count(*) filter (where echeance < current_date and statut not in ('levee','annulee'))
  from visibles;
$$;

-- Jeu de données d'export (liste PDF chantier / par entreprise). Aucune donnée
-- cross-tenant : la vue passe par les mêmes prédicats que la lecture normale.
create or replace function public.reserves_export_chantier(
  p_chantier_id uuid, p_intervenant_id uuid default null
) returns table (
  numero integer, titre text, description text, statut text, priorite text,
  intervenant text, plan text, niveau text, zone text,
  position_x numeric, position_y numeric, echeance date,
  photo_obligatoire_levee boolean, nb_photos bigint,
  created_at timestamptz, levee_at timestamptz
)
language sql security definer stable set search_path = public as $$
  select r.numero, r.titre, r.description, r.statut, r.priorite,
         i.nom, pl.nom, pl.niveau, pl.zone, r.position_x, r.position_y, r.echeance,
         r.photo_obligatoire_levee,
         (select count(*) from public.reserves_photos ph where ph.reserve_id = r.id),
         r.created_at, r.levee_at
  from public.reserves r
  left join public.reserves_intervenants i on i.id = r.intervenant_id
  left join public.reserves_plans pl on pl.id = r.plan_id
  where r.chantier_id = p_chantier_id
    and (p_intervenant_id is null or r.intervenant_id = p_intervenant_id)
    and (
      public.reserves_action_autorisee(r.entreprise_id, 'exporter')
      or public.reserves_intervenant_courant(r.intervenant_id)
    )
  order by r.numero;
$$;

-- ── 19. Visibilité dérivée ───────────────────────────────────────────────────
create or replace function public.reserves_chantier_visible_intervenant(p_chantier_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.reserves_intervenants i
    where i.chantier_id = p_chantier_id and public.reserves_intervenant_courant(i.id)
  );
$$;

create or replace function public.reserves_plan_visible_intervenant(p_plan_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.reserves r
    where r.plan_id = p_plan_id and public.reserves_intervenant_courant(r.intervenant_id)
  );
$$;

create or replace function public.reserves_conversation_visible(p_conversation_id uuid)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare v_entreprise uuid; v_intervenant uuid;
begin
  select c.entreprise_id, c.intervenant_id into v_entreprise, v_intervenant
  from public.reserves_conversations c where c.id = p_conversation_id;
  if v_entreprise is null then return false; end if;
  return public.reserves_action_autorisee(v_entreprise, 'voir')
      or public.reserves_intervenant_courant(v_intervenant);
end;
$$;

-- ── 20. Row Level Security ───────────────────────────────────────────────────
alter table public.reserves_transitions enable row level security;
alter table public.reserves_chantiers enable row level security;
alter table public.reserves_plans enable row level security;
alter table public.reserves_intervenants enable row level security;
alter table public.reserves enable row level security;
alter table public.reserves_photos enable row level security;
alter table public.reserves_historique enable row level security;
alter table public.reserves_conversations enable row level security;
alter table public.reserves_messages enable row level security;
alter table public.reserves_evenements_notifications enable row level security;

-- La matrice des transitions est une référence produit, pas une donnée client.
create policy reserves_transitions_lecture on public.reserves_transitions
  for select to authenticated using (true);

-- Chantiers : l'organisation hôte en totalité ; l'entreprise invitée uniquement
-- l'identité des chantiers où elle intervient — pas leurs devis, plannings ou clients,
-- qui vivent dans Gestion Pro sous leurs propres RLS, inchangées.
create policy reserves_chantiers_select on public.reserves_chantiers
  for select to authenticated using (
    public.reserves_action_autorisee(entreprise_id, 'voir')
    or public.reserves_chantier_visible_intervenant(id)
  );
create policy reserves_chantiers_insert on public.reserves_chantiers
  for insert to authenticated with check (public.reserves_action_autorisee(entreprise_id, 'gerer_chantier'));
create policy reserves_chantiers_update on public.reserves_chantiers
  for update to authenticated
  using (public.reserves_action_autorisee(entreprise_id, 'gerer_chantier'))
  with check (public.reserves_action_autorisee(entreprise_id, 'gerer_chantier'));

create policy reserves_plans_select on public.reserves_plans
  for select to authenticated using (
    public.reserves_action_autorisee(entreprise_id, 'voir')
    or public.reserves_plan_visible_intervenant(id)
  );
create policy reserves_plans_insert on public.reserves_plans
  for insert to authenticated with check (public.reserves_action_autorisee(entreprise_id, 'gerer_plans'));
create policy reserves_plans_update on public.reserves_plans
  for update to authenticated
  using (public.reserves_action_autorisee(entreprise_id, 'gerer_plans'))
  with check (public.reserves_action_autorisee(entreprise_id, 'gerer_plans'));

-- Une entreprise invitée voit sa propre ligne d'intervenant, jamais celle des autres
-- corps d'état du même chantier.
create policy reserves_intervenants_select on public.reserves_intervenants
  for select to authenticated using (
    public.reserves_action_autorisee(entreprise_id, 'voir')
    or public.reserves_intervenant_courant(id)
  );
create policy reserves_intervenants_insert on public.reserves_intervenants
  for insert to authenticated with check (public.reserves_action_autorisee(entreprise_id, 'gerer_intervenants'));
create policy reserves_intervenants_update on public.reserves_intervenants
  for update to authenticated
  using (public.reserves_action_autorisee(entreprise_id, 'gerer_intervenants'))
  with check (public.reserves_action_autorisee(entreprise_id, 'gerer_intervenants'));

-- Cœur de l'isolation : une réserve est lisible par son organisation hôte, ou par
-- l'entreprise à qui elle est nominativement attribuée. Rien d'autre ne l'ouvre.
create policy reserves_select on public.reserves
  for select to authenticated using (
    public.reserves_action_autorisee(entreprise_id, 'voir')
    or public.reserves_intervenant_courant(intervenant_id)
  );
create policy reserves_insert on public.reserves
  for insert to authenticated with check (public.reserves_action_autorisee(entreprise_id, 'creer_reserve'));
-- L'`update` direct ne sert qu'aux champs descriptifs : le trigger `reserves_workflow_garde`
-- refuse toute mutation d'état qui ne passe pas par une action métier.
create policy reserves_update on public.reserves
  for update to authenticated
  using (public.reserves_action_autorisee(entreprise_id, 'creer_reserve'))
  with check (public.reserves_action_autorisee(entreprise_id, 'creer_reserve'));

create policy reserves_photos_select on public.reserves_photos
  for select to authenticated using (public.reserves_lecture_autorisee(reserve_id));

-- Historique : lecture seulement. Aucune policy d'écriture n'existe, et le droit est
-- révoqué plus bas : l'historique ne peut être ni corrigé ni effacé depuis l'application.
create policy reserves_historique_select on public.reserves_historique
  for select to authenticated using (public.reserves_lecture_autorisee(reserve_id));

create policy reserves_conversations_select on public.reserves_conversations
  for select to authenticated using (
    public.reserves_action_autorisee(entreprise_id, 'voir')
    or public.reserves_intervenant_courant(intervenant_id)
  );
create policy reserves_messages_select on public.reserves_messages
  for select to authenticated using (public.reserves_conversation_visible(conversation_id));

create policy reserves_notifications_select on public.reserves_evenements_notifications
  for select to authenticated using (
    destinataire_entreprise_id is not null
    and public.est_membre_actif(destinataire_entreprise_id)
    and public.a_acces_application(destinataire_entreprise_id, 'reserves')
  );

-- ── 21. Droits ───────────────────────────────────────────────────────────────
grant select on
  public.reserves_transitions, public.reserves_chantiers, public.reserves_plans,
  public.reserves_intervenants, public.reserves, public.reserves_photos,
  public.reserves_historique, public.reserves_conversations, public.reserves_messages,
  public.reserves_evenements_notifications
to authenticated;

grant insert, update on
  public.reserves_chantiers, public.reserves_plans, public.reserves_intervenants, public.reserves
to authenticated;

-- Écritures réservées aux actions métier : photos, historique, messagerie et file de
-- notification ne sont jamais écrits directement par le client.
revoke insert, update, delete on
  public.reserves_photos, public.reserves_historique, public.reserves_conversations,
  public.reserves_messages, public.reserves_evenements_notifications, public.reserves_transitions
from authenticated;
revoke delete on
  public.reserves_chantiers, public.reserves_plans, public.reserves_intervenants, public.reserves
from authenticated;

-- Fonctions de trigger : jamais appelables directement.
revoke all on function public.reserves_set_updated_at() from public, anon, authenticated;
revoke all on function public.reserves_numeroter() from public, anon, authenticated;
revoke all on function public.reserves_valider_coherence() from public, anon, authenticated;
revoke all on function public.reserves_garde_workflow() from public, anon, authenticated;
revoke all on function public.reserves_historiser_creation() from public, anon, authenticated;
-- Cœur de transition : atteignable seulement via les actions métier ci-dessous.
revoke all on function public.reserves_appliquer_transition(uuid, text, text, uuid) from public, anon, authenticated;

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.reserves_role_courant(uuid)',
    'public.reserves_action_autorisee(uuid,text)',
    'public.reserves_intervenant_courant(uuid)',
    'public.reserves_acteur_courant(uuid)',
    'public.reserves_lecture_autorisee(uuid)',
    'public.reserves_chantier_visible_intervenant(uuid)',
    'public.reserves_plan_visible_intervenant(uuid)',
    'public.reserves_conversation_visible(uuid)',
    'public.reserves_creer(uuid,text,text,text,uuid,uuid,numeric,numeric,boolean,date,uuid)',
    'public.reserves_assigner(uuid,uuid,text)',
    'public.reserves_repondre_responsabilite(uuid,boolean,text,text)',
    'public.reserves_demander_levee(uuid,text)',
    'public.reserves_statuer_levee(uuid,boolean,text)',
    'public.reserves_rouvrir(uuid,text)',
    'public.reserves_annuler(uuid,text)',
    'public.reserves_ajouter_photo(uuid,text,text,text,text,integer,uuid)',
    'public.reserves_commenter(uuid,text)',
    'public.reserves_designer_entreprise_intervenante(uuid,uuid)',
    'public.reserves_rejoindre_intervention(uuid)',
    'public.reserves_revoquer_intervenant(uuid)',
    'public.reserves_importer_chantier_gp(uuid)',
    'public.reserves_resume_chantier_gp(uuid)',
    'public.reserves_tableau_de_bord(uuid,uuid,uuid,text,text,date)',
    'public.reserves_export_chantier(uuid,uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_signature);
    execute format('grant execute on function %s to authenticated', v_signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
