-- ELSATIA Social : module interne de gestion des réseaux sociaux officiels
-- d'ELSATIA (Page Facebook, Instagram professionnel, Page Entreprise LinkedIn).
--
-- Le module appartient à l'espace plateforme (éditeur), pas aux entreprises
-- clientes : aucune table n'a d'entreprise_id. L'accès est réservé aux membres
-- de plateforme_admins, avec un rôle social distinct (table social_membres).
--
-- Principes de sécurité :
--   * toutes les tables ont la RLS activée ;
--   * aucune policy d'écriture : les écritures passent exclusivement par le
--     serveur (service_role) après contrôle du rôle ;
--   * les jetons OAuth chiffrés (social_identifiants, social_connexions_en_attente)
--     n'ont aucune policy : illisibles depuis le client, même authentifié ;
--   * une publication ne peut être validée/programmée que par un Administrateur
--     ou un Validateur, contrôle appliqué par trigger en base ;
--   * toute modification du contenu après validation annule la validation ;
--   * le journal d'audit est en ajout seul.

-- ─────────────────────────────────────────────────────────────
-- Rôles
-- ─────────────────────────────────────────────────────────────
create table public.social_membres (
  email text primary key references public.plateforme_admins(email) on delete cascade on update cascade,
  role text not null check (role in ('administrateur','responsable_communication','editeur','validateur','lecture')),
  ajoute_par text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.social_membres enable row level security;

-- Rôle social d'un email : rôle explicite, sinon Administrateur pour un membre
-- plateforme « total », sinon Lecture seule pour les autres membres plateforme.
-- null si l'email n'appartient pas à l'équipe plateforme.
create or replace function public.social_role_de(p_email text)
returns text language sql security definer stable set search_path = public as $$
  select coalesce(
    sm.role,
    case when pa.role = 'total' then 'administrateur' else 'lecture' end
  )
  from public.plateforme_admins pa
  left join public.social_membres sm on sm.email = pa.email
  where pa.email = lower(btrim(coalesce(p_email, '')));
$$;

create or replace function public.social_role_courant()
returns text language sql security definer stable set search_path = public as $$
  select public.social_role_de(auth.email());
$$;

revoke all on function public.social_role_de(text) from public, anon, authenticated;
revoke all on function public.social_role_courant() from public, anon;
grant execute on function public.social_role_courant() to authenticated;

create policy social_membres_lecture on public.social_membres
  for select to authenticated using ((select public.social_role_courant()) is not null);

-- ─────────────────────────────────────────────────────────────
-- Paramètres (ligne unique)
-- ─────────────────────────────────────────────────────────────
create table public.social_parametres (
  id boolean primary key default true check (id),
  -- Prévu pour une version ultérieure. Sans effet en V1 : le code refuse
  -- toute publication non validée par un humain, quelle que soit cette valeur.
  automatisation_active boolean not null default false,
  fuseau_horaire text not null default 'Europe/Paris',
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.social_parametres (id) values (true) on conflict do nothing;
alter table public.social_parametres enable row level security;
create policy social_parametres_lecture on public.social_parametres
  for select to authenticated using ((select public.social_role_courant()) is not null);

-- ─────────────────────────────────────────────────────────────
-- Comptes connectés et secrets
-- ─────────────────────────────────────────────────────────────
create table public.social_comptes (
  id uuid primary key default gen_random_uuid(),
  fournisseur text not null check (fournisseur in ('meta','linkedin')),
  reseau text not null check (reseau in ('facebook','instagram','linkedin')),
  nom_compte text not null check (btrim(nom_compte) <> ''),
  -- Page ID Facebook, IG User ID, ou ID numérique de l'organisation LinkedIn.
  external_account_id text not null check (btrim(external_account_id) <> ''),
  -- Pour Instagram : Page Facebook liée (les appels passent par son jeton).
  external_parent_id text,
  nom_utilisateur text,
  statut text not null default 'connecte'
    check (statut in ('connecte','a_reconnecter','expire','revoque','erreur')),
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  connecte_par text,
  token_expires_at timestamptz,
  refresh_expires_at timestamptz,
  data_access_expires_at timestamptz,
  derniere_verification_at timestamptz,
  derniere_erreur text,
  updated_at timestamptz not null default now(),
  check ((fournisseur = 'meta' and reseau in ('facebook','instagram')) or (fournisseur = 'linkedin' and reseau = 'linkedin')),
  unique (reseau, external_account_id)
);
-- Un seul compte actif par réseau : ce sont les comptes officiels ELSATIA.
create unique index social_comptes_un_actif_par_reseau
  on public.social_comptes (reseau) where statut <> 'revoque';
alter table public.social_comptes enable row level security;
create policy social_comptes_lecture on public.social_comptes
  for select to authenticated using ((select public.social_role_courant()) is not null);

-- Jetons chiffrés AES-256-GCM côté serveur (clé hors base). Aucune policy :
-- seul le service_role y accède.
create table public.social_identifiants (
  compte_id uuid primary key references public.social_comptes(id) on delete cascade,
  jeton_chiffre text not null,
  refresh_chiffre text,
  cle_version text not null,
  updated_at timestamptz not null default now()
);
alter table public.social_identifiants enable row level security;
revoke all on public.social_identifiants from anon, authenticated;

-- Résultat OAuth en attente de choix de la Page / de l'organisation. Expire
-- après 15 minutes et est supprimé à la finalisation.
create table public.social_connexions_en_attente (
  id uuid primary key default gen_random_uuid(),
  fournisseur text not null check (fournisseur in ('meta','linkedin')),
  donnees_chiffrees text not null,
  cree_par text not null,
  expire_at timestamptz not null default now() + interval '15 minutes',
  created_at timestamptz not null default now()
);
alter table public.social_connexions_en_attente enable row level security;
revoke all on public.social_connexions_en_attente from anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Médias
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-medias', 'social-medias', false, 209715200,
  array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.social_medias (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('image','video')),
  storage_path text not null unique check (btrim(storage_path) <> ''),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','video/mp4','video/quicktime')),
  nom_original text not null,
  taille_octets bigint not null check (taille_octets > 0),
  largeur integer check (largeur > 0),
  hauteur integer check (hauteur > 0),
  duree_secondes numeric(8,2) check (duree_secondes > 0),
  texte_alternatif text check (length(texte_alternatif) <= 1000),
  cree_par text not null,
  created_at timestamptz not null default now()
);
alter table public.social_medias enable row level security;
create policy social_medias_lecture on public.social_medias
  for select to authenticated using ((select public.social_role_courant()) is not null);

-- ─────────────────────────────────────────────────────────────
-- Publications
-- ─────────────────────────────────────────────────────────────
create table public.social_publications (
  id uuid primary key default gen_random_uuid(),
  titre text not null check (btrim(titre) <> '' and length(titre) <= 200),
  contenu_principal text not null default '' check (length(contenu_principal) <= 10000),
  contenu_facebook text check (length(contenu_facebook) <= 63206),
  contenu_instagram text check (length(contenu_instagram) <= 2200),
  contenu_linkedin text check (length(contenu_linkedin) <= 3000),
  lien_url text check (lien_url is null or lien_url ~ '^https://'),
  application text not null default 'elsatia'
    check (application in ('elsatia','gestion_pro','tools','colors','studio','reserves')),
  reseaux text[] not null default '{}'
    check (reseaux <@ array['facebook','instagram','linkedin']::text[]),
  statut text not null default 'brouillon'
    check (statut in ('idee','brouillon','a_valider','valide','programme','publication_en_cours','publie','partiel','echec','annule')),
  programme_at timestamptz,
  soumis_at timestamptz,
  soumis_par text,
  approuve_at timestamptz,
  approuve_par text,
  -- SHA-256 du contenu exact validé (textes, réseaux, médias, lien).
  empreinte_validee text,
  commentaire_validation text,
  publie_at timestamptz,
  cree_par text not null,
  modifie_par text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (statut not in ('valide','programme','publication_en_cours','publie','partiel') or (approuve_par is not null and approuve_at is not null and empreinte_validee is not null)),
  check (statut <> 'programme' or programme_at is not null)
);
create index social_publications_statut_idx on public.social_publications (statut, programme_at);
create index social_publications_calendrier_idx on public.social_publications (coalesce(publie_at, programme_at, created_at));
alter table public.social_publications enable row level security;
create policy social_publications_lecture on public.social_publications
  for select to authenticated using ((select public.social_role_courant()) is not null);

create table public.social_publication_medias (
  publication_id uuid not null references public.social_publications(id) on delete cascade,
  media_id uuid not null references public.social_medias(id) on delete restrict,
  ordre smallint not null default 0,
  primary key (publication_id, media_id)
);
create index social_publication_medias_media_idx on public.social_publication_medias (media_id);
alter table public.social_publication_medias enable row level security;
create policy social_publication_medias_lecture on public.social_publication_medias
  for select to authenticated using ((select public.social_role_courant()) is not null);

-- Garde-fous du workflow, appliqués quel que soit le code appelant.
create or replace function public.social_publications_garde_fou()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_contenu_change boolean;
begin
  if tg_op = 'UPDATE' then
    v_contenu_change :=
      new.titre is distinct from old.titre
      or new.contenu_principal is distinct from old.contenu_principal
      or new.contenu_facebook is distinct from old.contenu_facebook
      or new.contenu_instagram is distinct from old.contenu_instagram
      or new.contenu_linkedin is distinct from old.contenu_linkedin
      or new.lien_url is distinct from old.lien_url
      or new.reseaux is distinct from old.reseaux;

    if v_contenu_change and old.statut in ('publication_en_cours','publie','partiel') then
      raise exception 'Une publication envoyée ne peut plus être modifiée';
    end if;

    -- Toute modification du contenu après soumission ou validation renvoie en brouillon.
    if v_contenu_change and old.statut in ('a_valider','valide','programme','echec') then
      new.statut := 'brouillon';
      new.approuve_at := null;
      new.approuve_par := null;
      new.empreinte_validee := null;
      new.soumis_at := null;
      new.soumis_par := null;
    end if;
  end if;

  -- La validation n'est jamais acceptée d'un rôle non autorisé.
  if new.approuve_par is not null
     and (tg_op = 'INSERT' or new.approuve_par is distinct from old.approuve_par or new.approuve_at is distinct from old.approuve_at)
     and coalesce(public.social_role_de(new.approuve_par), '') not in ('administrateur','validateur') then
    raise exception 'Seuls un Administrateur ou un Validateur peuvent autoriser une publication';
  end if;

  if tg_op = 'INSERT' and new.statut not in ('idee','brouillon') then
    raise exception 'Une publication est toujours créée en idée ou en brouillon';
  end if;

  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.social_publications_garde_fou() from public, anon, authenticated;

create trigger social_publications_garde_fou
  before insert or update on public.social_publications
  for each row execute function public.social_publications_garde_fou();

-- Une cible par réseau et par publication. La clé d'idempotence empêche
-- toute double publication, y compris en cas d'appels concurrents.
create table public.social_publication_cibles (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.social_publications(id) on delete cascade,
  reseau text not null check (reseau in ('facebook','instagram','linkedin')),
  compte_id uuid references public.social_comptes(id) on delete set null,
  statut text not null default 'en_attente'
    check (statut in ('en_attente','en_cours','publie','simule','echec','annule')),
  cle_idempotence text not null unique,
  external_post_id text,
  external_url text,
  -- Conteneur Instagram créé mais pas encore publié (reprise sans doublon).
  external_conteneur_id text,
  tentatives smallint not null default 0,
  prochaine_tentative_at timestamptz,
  verrou_at timestamptz,
  publie_at timestamptz,
  erreur text,
  erreur_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (publication_id, reseau)
);
create index social_publication_cibles_compte_idx on public.social_publication_cibles (compte_id);
create index social_publication_cibles_reprise_idx on public.social_publication_cibles (statut, prochaine_tentative_at);
create unique index social_publication_cibles_externe_idx on public.social_publication_cibles (reseau, external_post_id) where external_post_id is not null;
alter table public.social_publication_cibles enable row level security;
create policy social_publication_cibles_lecture on public.social_publication_cibles
  for select to authenticated using ((select public.social_role_courant()) is not null);

-- Prise de verrou atomique d'une cible avant appel à l'API (anti-doublon).
-- Une cible restée « en_cours » (processus interrompu) n'est JAMAIS reprise
-- automatiquement : la plateforme a pu recevoir la publication. Le cron la
-- passe en échec « a_verifier » et un humain décide de la relancer.
-- Une cible en échec n'est reprise que si une nouvelle tentative est prévue.
create or replace function public.social_verrouiller_cible(p_cible_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.social_publication_cibles
     set statut = 'en_cours', verrou_at = now(), tentatives = tentatives + 1, updated_at = now()
   where id = p_cible_id
     and external_post_id is null
     and (statut = 'en_attente'
          or (statut = 'echec' and prochaine_tentative_at is not null and prochaine_tentative_at <= now()));
  return found;
end;
$$;
revoke all on function public.social_verrouiller_cible(uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Statistiques
-- ─────────────────────────────────────────────────────────────
create table public.social_statistiques (
  id bigint generated always as identity primary key,
  cible_id uuid not null references public.social_publication_cibles(id) on delete cascade,
  publication_id uuid not null references public.social_publications(id) on delete cascade,
  reseau text not null check (reseau in ('facebook','instagram','linkedin')),
  -- null = métrique non fournie par la plateforme (jamais 0 par défaut).
  impressions bigint,
  portee bigint,
  vues bigint,
  likes bigint,
  commentaires bigint,
  partages bigint,
  clics bigint,
  enregistrements bigint,
  metriques_brutes jsonb not null default '{}',
  collecte_at timestamptz not null default now()
);
create index social_statistiques_cible_idx on public.social_statistiques (cible_id, collecte_at desc);
create index social_statistiques_publication_idx on public.social_statistiques (publication_id, collecte_at desc);
alter table public.social_statistiques enable row level security;
create policy social_statistiques_lecture on public.social_statistiques
  for select to authenticated using ((select public.social_role_courant()) is not null);

create table public.social_abonnes (
  compte_id uuid not null references public.social_comptes(id) on delete cascade,
  collecte_le date not null default current_date,
  abonnes bigint not null check (abonnes >= 0),
  primary key (compte_id, collecte_le)
);
alter table public.social_abonnes enable row level security;
create policy social_abonnes_lecture on public.social_abonnes
  for select to authenticated using ((select public.social_role_courant()) is not null);

-- ─────────────────────────────────────────────────────────────
-- Commentaires et messages (réponses toujours validées par un humain en V1)
-- ─────────────────────────────────────────────────────────────
create table public.social_commentaires (
  id uuid primary key default gen_random_uuid(),
  reseau text not null check (reseau in ('facebook','instagram','linkedin')),
  compte_id uuid references public.social_comptes(id) on delete set null,
  cible_id uuid references public.social_publication_cibles(id) on delete set null,
  external_comment_id text not null,
  external_post_id text not null,
  external_parent_id text,
  auteur_nom text,
  auteur_external_id text,
  contenu text not null default '',
  publie_externe_at timestamptz,
  statut text not null default 'nouveau'
    check (statut in ('nouveau','lu','reponse_preparee','repondu','ignore','echec')),
  brouillon_reponse text check (length(brouillon_reponse) <= 8000),
  brouillon_par text,
  brouillon_ia boolean not null default false,
  reponse_validee_par text,
  reponse_envoyee_at timestamptz,
  reponse_external_id text,
  erreur text,
  recu_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reseau, external_comment_id)
);
create index social_commentaires_boite_idx on public.social_commentaires (statut, publie_externe_at desc);
create index social_commentaires_compte_idx on public.social_commentaires (compte_id);
create index social_commentaires_cible_idx on public.social_commentaires (cible_id);
alter table public.social_commentaires enable row level security;
create policy social_commentaires_lecture on public.social_commentaires
  for select to authenticated using ((select public.social_role_courant()) is not null);

create table public.social_messages (
  id uuid primary key default gen_random_uuid(),
  reseau text not null check (reseau in ('facebook','instagram','linkedin')),
  compte_id uuid references public.social_comptes(id) on delete set null,
  external_conversation_id text not null,
  external_message_id text not null,
  sens text not null check (sens in ('entrant','sortant')),
  auteur_nom text,
  auteur_external_id text,
  contenu text not null default '',
  envoye_externe_at timestamptz,
  statut text not null default 'recu'
    check (statut in ('recu','lu','reponse_preparee','repondu','ignore','echec','envoye')),
  brouillon_reponse text check (length(brouillon_reponse) <= 2000),
  brouillon_par text,
  brouillon_ia boolean not null default false,
  reponse_validee_par text,
  reponse_envoyee_at timestamptz,
  erreur text,
  recu_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reseau, external_message_id)
);
create index social_messages_conversation_idx on public.social_messages (reseau, external_conversation_id, envoye_externe_at);
create index social_messages_compte_idx on public.social_messages (compte_id);
alter table public.social_messages enable row level security;
create policy social_messages_lecture on public.social_messages
  for select to authenticated using ((select public.social_role_courant()) is not null);

-- ─────────────────────────────────────────────────────────────
-- Webhooks : idempotence, reprise et file des échecs définitifs
-- ─────────────────────────────────────────────────────────────
create table public.social_webhook_evenements (
  id bigint generated always as identity primary key,
  fournisseur text not null check (fournisseur in ('meta','linkedin')),
  cle_idempotence text not null unique,
  type_evenement text,
  payload jsonb not null,
  statut text not null default 'recu' check (statut in ('recu','traite','echec','abandonne','ignore')),
  tentatives smallint not null default 0,
  prochaine_tentative_at timestamptz not null default now(),
  erreur text,
  recu_at timestamptz not null default now(),
  traite_at timestamptz
);
create index social_webhook_evenements_file_idx on public.social_webhook_evenements (statut, prochaine_tentative_at);
alter table public.social_webhook_evenements enable row level security;
create policy social_webhook_evenements_lecture on public.social_webhook_evenements
  for select to authenticated using ((select public.social_role_courant()) in ('administrateur','responsable_communication'));

-- ─────────────────────────────────────────────────────────────
-- Limitation de débit (actions IA, publications, webhooks)
-- ─────────────────────────────────────────────────────────────
create table public.social_quotas (
  cle text not null,
  fenetre_debut timestamptz not null,
  compteur integer not null default 0,
  primary key (cle, fenetre_debut)
);
alter table public.social_quotas enable row level security;
revoke all on public.social_quotas from anon, authenticated;

create or replace function public.social_consommer_quota(p_cle text, p_max integer, p_fenetre_secondes integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_debut timestamptz := to_timestamp(floor(extract(epoch from now()) / p_fenetre_secondes) * p_fenetre_secondes);
  v_compteur integer;
begin
  insert into public.social_quotas (cle, fenetre_debut, compteur) values (p_cle, v_debut, 1)
  on conflict (cle, fenetre_debut) do update set compteur = public.social_quotas.compteur + 1
  returning compteur into v_compteur;
  delete from public.social_quotas where fenetre_debut < now() - interval '2 days';
  return v_compteur <= p_max;
end;
$$;
revoke all on function public.social_consommer_quota(text, integer, integer) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Journal d'audit (ajout seul)
-- ─────────────────────────────────────────────────────────────
create table public.social_audit (
  id bigint generated always as identity primary key,
  acteur text not null,
  action text not null,
  reseau text,
  publication_id uuid,
  objet_id text,
  avant jsonb,
  apres jsonb,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index social_audit_date_idx on public.social_audit (created_at desc);
create index social_audit_publication_idx on public.social_audit (publication_id, created_at desc);
alter table public.social_audit enable row level security;
create policy social_audit_lecture on public.social_audit
  for select to authenticated using ((select public.social_role_courant()) is not null);

create or replace function public.social_audit_ajout_seul()
returns trigger language plpgsql as $$
begin
  raise exception 'Le journal ELSATIA Social est en ajout seul';
end;
$$;
create trigger social_audit_ajout_seul
  before update or delete on public.social_audit
  for each row execute function public.social_audit_ajout_seul();

-- Rafraîchit updated_at sur les tables modifiées par le serveur.
create or replace function public.social_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger social_comptes_touch before update on public.social_comptes for each row execute function public.social_touch_updated_at();
create trigger social_cibles_touch before update on public.social_publication_cibles for each row execute function public.social_touch_updated_at();
create trigger social_commentaires_touch before update on public.social_commentaires for each row execute function public.social_touch_updated_at();
create trigger social_messages_touch before update on public.social_messages for each row execute function public.social_touch_updated_at();
create trigger social_membres_touch before update on public.social_membres for each row execute function public.social_touch_updated_at();

-- Toutes les tables restent en lecture seule pour le client, y compris
-- authentifié : les écritures passent par le serveur.
revoke insert, update, delete, truncate on
  public.social_membres, public.social_parametres, public.social_comptes, public.social_medias,
  public.social_publications, public.social_publication_medias, public.social_publication_cibles,
  public.social_statistiques, public.social_abonnes, public.social_commentaires, public.social_messages,
  public.social_webhook_evenements, public.social_audit
from anon, authenticated;
revoke all on
  public.social_membres, public.social_parametres, public.social_comptes, public.social_medias,
  public.social_publications, public.social_publication_medias, public.social_publication_cibles,
  public.social_statistiques, public.social_abonnes, public.social_commentaires, public.social_messages,
  public.social_webhook_evenements, public.social_audit
from anon;
