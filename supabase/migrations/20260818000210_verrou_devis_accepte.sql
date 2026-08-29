-- DEVIS-LOCK-V1 : un devis accepte doit devenir immuable au niveau base, pas seulement
-- au niveau RPC/UI. Faille corrigee (voir docs/commercial/DEVIS_LOCK_V1_ELSATIA.md) : un
-- devis statut='accepte' restait modifiable/supprimable par ecriture directe (UPDATE/DELETE
-- sur devis, INSERT/UPDATE/DELETE sur lignes_devis) pour tout utilisateur disposant de
-- gerer_devis, car le verrou n'existait que dans la RPC modifier_devis_brouillon, jamais au
-- niveau table/RLS.
--
-- Champs non contractuels laisses modifiables sur un devis accepte : notes_internes (note
-- interne jamais affichee au client), email_envoye_le/email_envoye_a (tracabilite d'un envoi,
-- action legitime apres acceptation), updated_at. chantier_id est verrouille : un devis accepte
-- ne peut plus changer de chantier (decision explicite, cf. doc du lot).

create or replace function public.verrouiller_devis_accepte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.statut = 'accepte' then
      raise exception 'Ce devis est accepté et ne peut plus être supprimé.';
    end if;
    return old;
  end if;

  if old.statut = 'accepte' then
    if new.statut is distinct from old.statut
       or new.montant_ht is distinct from old.montant_ht
       or new.montant_tva is distinct from old.montant_tva
       or new.montant_ttc is distinct from old.montant_ttc
       or new.client_id is distinct from old.client_id
       or new.chantier_id is distinct from old.chantier_id
       or new.remise_globale is distinct from old.remise_globale
       or new.conditions is distinct from old.conditions
       or new.notes_client is distinct from old.notes_client
       or new.date_emission is distinct from old.date_emission
       or new.date_validite is distinct from old.date_validite
       or new.numero is distinct from old.numero
       or new.entreprise_id is distinct from old.entreprise_id
    then
      raise exception 'Ce devis est accepté et ne peut plus être modifié.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists verrou_devis_accepte on public.devis;
create trigger verrou_devis_accepte
  before update or delete on public.devis
  for each row execute function public.verrouiller_devis_accepte();

-- Une ligne rattachee a un devis accepte n'est ni insertable, ni modifiable, ni supprimable.
-- Le statut du devis parent est relu cote serveur (jamais fait confiance a une valeur envoyee
-- par le client) ; si le devis parent est deja introuvable (cascade de suppression d'un devis
-- brouillon/refuse dans la meme transaction), on laisse passer : un devis accepte ne peut de
-- toute facon jamais etre supprime, ce cas ne peut donc pas correspondre a un devis accepte.
-- Le blocage n'est prononce que si l'appelant est membre actif de l'entreprise du devis : pour
-- un devis d'une autre entreprise, on laisse la policy RLS habituelle (role_gestion_insert/
-- update/delete) rendre son verdict, afin de ne jamais reveler l'existence ou le statut d'un
-- devis a un utilisateur qui n'y a de toute facon pas acces (le SELECT ci-dessous est security
-- definer et verrait sinon a travers les tenants).
create or replace function public.verrouiller_lignes_devis_accepte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_entreprise_id uuid; v_statut text;
begin
  select entreprise_id, statut into v_entreprise_id, v_statut
  from public.devis where id = coalesce(new.devis_id, old.devis_id);

  if v_statut = 'accepte' and public.est_membre_actif(v_entreprise_id) then
    raise exception 'Ce devis est accepté : ses lignes ne peuvent plus être modifiées.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists verrou_lignes_devis_accepte on public.lignes_devis;
create trigger verrou_lignes_devis_accepte
  before insert or update or delete on public.lignes_devis
  for each row execute function public.verrouiller_lignes_devis_accepte();

notify pgrst, 'reload schema';
