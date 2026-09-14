-- AVENANTS-V1 — implémentation minimale. Modèle de données (option C de l'audit
-- AVENANTS_V1_AUDIT_ELSATIA.md §20 : table avenants dédiée, lignes propres —
-- lignes_devis n'est pas réutilisée pour éviter le polymorphisme fragile qu'un
-- avenant_id nullable y aurait introduit (DEVIS-LOCK-V1 suppose que toute ligne
-- de lignes_devis appartient à un devis, sans exception).
--
-- Principe contractuel : montant contractuel courant d'un devis = son montant
-- (si accepté) + la somme de ses avenants acceptés. Un avenant brouillon/envoyé/
-- refusé/annulé ne modifie jamais ce montant. Le devis initial reste strictement
-- immuable (DEVIS-LOCK-V1, inchangé) — un avenant est un document séparé.

create table public.avenants (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  chantier_id uuid not null references public.chantiers(id) on delete restrict,
  devis_origine_id uuid not null references public.devis(id) on delete restrict,
  ordre integer not null,
  statut text not null default 'brouillon' check (statut in ('brouillon','envoye','accepte','refuse','annule')),
  date_creation date not null default current_date,
  date_envoi timestamptz,
  date_acceptation timestamptz,
  date_refus timestamptz,
  accepte_par uuid references auth.users(id) on delete set null,
  montant_ht numeric not null default 0,
  montant_tva numeric not null default 0,
  montant_ttc numeric not null default 0,
  notes_client text,
  notes_internes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, entreprise_id),
  unique (devis_origine_id, ordre),
  foreign key (chantier_id, entreprise_id) references public.chantiers(id, entreprise_id),
  foreign key (devis_origine_id, entreprise_id) references public.devis(id, entreprise_id)
);
create index avenants_entreprise_idx on public.avenants (entreprise_id, chantier_id);
create index avenants_devis_origine_idx on public.avenants (devis_origine_id);

create table public.lignes_avenants (
  id uuid primary key default gen_random_uuid(),
  avenant_id uuid not null references public.avenants(id) on delete cascade,
  designation text not null,
  description text,
  type text not null default 'fourniture' check (type in ('main_oeuvre','fourniture','sous_traitance','deplacement','forfait')),
  -- quantite peut être négative : c'est la représentation explicite d'une ligne
  -- de moins-value (même convention que les lignes d'avoir dans lignes_factures,
  -- déjà en place depuis FACTURATION-BTP-V1B — creer_facture_avancee).
  quantite numeric not null default 1,
  unite text not null default 'u',
  prix_unitaire_ht numeric not null default 0,
  remise_ligne numeric not null default 0,
  taux_tva numeric not null default 20,
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);
create index lignes_avenants_avenant_idx on public.lignes_avenants (avenant_id);

alter table public.avenants enable row level security;
alter table public.lignes_avenants enable row level security;

-- RLS : motif identique à devis (permissive membre + restrictive par permission,
-- gerer_devis/acces_devis réutilisées — un avenant est un complément de devis,
-- porté par la même équipe commerciale, cf. audit §28).
create policy "membres avenants" on public.avenants
  for all using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));
create policy "lecture_avenants_selon_permission" on public.avenants as restrictive for select
  to authenticated using (public.a_permission(entreprise_id, 'acces_devis'));
create policy "role_gestion_insert" on public.avenants as restrictive for insert
  to authenticated with check (public.a_permission(entreprise_id, 'gerer_devis'));
create policy "role_gestion_update" on public.avenants as restrictive for update
  to authenticated using (public.a_permission(entreprise_id, 'gerer_devis')) with check (public.a_permission(entreprise_id, 'gerer_devis'));
create policy "role_gestion_delete" on public.avenants as restrictive for delete
  to authenticated using (public.a_permission(entreprise_id, 'gerer_devis'));

create policy "membres lignes_avenants" on public.lignes_avenants
  for all using (exists (select 1 from public.avenants a where a.id = lignes_avenants.avenant_id and public.est_membre_actif(a.entreprise_id)))
  with check (exists (select 1 from public.avenants a where a.id = lignes_avenants.avenant_id and public.est_membre_actif(a.entreprise_id)));
create policy "lecture_lignes_avenants_selon_permission" on public.lignes_avenants as restrictive for select
  to authenticated using (exists (select 1 from public.avenants a where a.id = lignes_avenants.avenant_id and public.a_permission(a.entreprise_id, 'acces_devis')));
create policy "role_gestion_insert" on public.lignes_avenants as restrictive for insert
  to authenticated with check (exists (select 1 from public.avenants a where a.id = lignes_avenants.avenant_id and public.a_permission(a.entreprise_id, 'gerer_devis')));
create policy "role_gestion_update" on public.lignes_avenants as restrictive for update
  to authenticated using (exists (select 1 from public.avenants a where a.id = lignes_avenants.avenant_id and public.a_permission(a.entreprise_id, 'gerer_devis')))
  with check (exists (select 1 from public.avenants a where a.id = lignes_avenants.avenant_id and public.a_permission(a.entreprise_id, 'gerer_devis')));
create policy "role_gestion_delete" on public.lignes_avenants as restrictive for delete
  to authenticated using (exists (select 1 from public.avenants a where a.id = lignes_avenants.avenant_id and public.a_permission(a.entreprise_id, 'gerer_devis')));

grant select, insert, update, delete on table public.avenants to authenticated;
grant select, insert, update, delete on table public.lignes_avenants to authenticated;
revoke all on table public.avenants from anon;
revoke all on table public.lignes_avenants from anon;

-- Recalcul des totaux depuis les lignes, motif identique à recalc_totaux_devis.
create or replace function public.recalc_totaux_avenant(p_avenant_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ht numeric := 0; v_tva numeric := 0;
begin
  select coalesce(sum(ligne_ht), 0), coalesce(sum(ligne_ht * taux_tva / 100), 0)
  into v_ht, v_tva
  from (select (quantite * prix_unitaire_ht) * (1 - remise_ligne / 100) as ligne_ht, taux_tva
        from public.lignes_avenants where avenant_id = p_avenant_id) s;
  update public.avenants
  set montant_ht = round(v_ht, 2), montant_tva = round(v_tva, 2), montant_ttc = round(v_ht + v_tva, 2), updated_at = now()
  where id = p_avenant_id;
end; $$;

create or replace function public.trg_recalc_avenant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_totaux_avenant(coalesce(new.avenant_id, old.avenant_id));
  return null;
end; $$;

create trigger recalc_avenant_apres_ligne
  after insert or update or delete on public.lignes_avenants
  for each row execute function public.trg_recalc_avenant();
revoke all on function public.recalc_totaux_avenant(uuid) from public, anon, authenticated;

-- AVENANT-LOCK : un avenant accepté est immuable, même principe que
-- DEVIS-LOCK-V1. 'accepte' est un état terminal (aucune transition prévue
-- au-delà, contrairement à une facture) : toute modification de statut une
-- fois accepté est bloquée, pas seulement le retour à brouillon. Capture
-- automatique (non falsifiable côté client) des dates et de l'auteur de
-- l'acceptation à chaque transition — répond à AVENANTS-V1 §35 (« capturer au
-- minimum date + utilisateur »telle qu'un devis n'en dispose pas aujourd'hui).
create or replace function public.verrouiller_avenant_accepte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.statut = 'accepte' then
      raise exception 'Cet avenant est accepté et ne peut plus être supprimé.';
    end if;
    return old;
  end if;

  if new.statut = 'envoye' and old.statut <> 'envoye' then
    new.date_envoi := now();
  end if;
  if new.statut = 'accepte' and old.statut <> 'accepte' then
    new.date_acceptation := now();
    new.accepte_par := auth.uid();
  end if;
  if new.statut = 'refuse' and old.statut <> 'refuse' then
    new.date_refus := now();
  end if;

  if old.statut = 'accepte' then
    if new.statut is distinct from old.statut
       or new.entreprise_id is distinct from old.entreprise_id
       or new.chantier_id is distinct from old.chantier_id
       or new.devis_origine_id is distinct from old.devis_origine_id
       or new.ordre is distinct from old.ordre
       or new.montant_ht is distinct from old.montant_ht
       or new.montant_tva is distinct from old.montant_tva
       or new.montant_ttc is distinct from old.montant_ttc
       or new.date_acceptation is distinct from old.date_acceptation
       or new.accepte_par is distinct from old.accepte_par
       or new.notes_client is distinct from old.notes_client
    then
      raise exception 'Cet avenant est accepté et ne peut plus être modifié.';
    end if;
  end if;
  return new;
end;
$$;

create trigger verrou_avenant_accepte
  before update or delete on public.avenants
  for each row execute function public.verrouiller_avenant_accepte();

-- Lignes d'un avenant accepté : ni insertables, ni modifiables, ni supprimables.
-- Même vigilance cross-tenant que verrouiller_lignes_devis_accepte
-- (DEVIS-LOCK-V1) : le blocage n'est prononcé que pour un appelant membre de
-- l'entreprise concernée, pour ne jamais laisser un attaquant cross-tenant
-- recevoir un message différent du message RLS standard.
create or replace function public.verrouiller_lignes_avenant_accepte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_entreprise_id uuid; v_statut text;
begin
  select entreprise_id, statut into v_entreprise_id, v_statut
  from public.avenants where id = coalesce(new.avenant_id, old.avenant_id);

  if v_statut = 'accepte' and public.est_membre_actif(v_entreprise_id) then
    raise exception 'Cet avenant est accepté : ses lignes ne peuvent plus être modifiées.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger verrou_lignes_avenant_accepte
  before insert or update or delete on public.lignes_avenants
  for each row execute function public.verrouiller_lignes_avenant_accepte();

notify pgrst, 'reload schema';
