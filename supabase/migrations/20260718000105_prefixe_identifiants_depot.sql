-- Les identifiants utilisés à la borne dépôt commencent, par défaut, par les
-- trois premières lettres utiles du nom de l'entreprise : Liria Concept -> LIR-0001.
-- Les entreprises ayant déjà choisi un format personnalisé ne sont pas renumérotées.

create or replace function public.prefixe_identifiant_entreprise(p_nom text)
returns text language plpgsql immutable set search_path=public as $$
declare
  v_normalise text;
begin
  v_normalise:=upper(translate(coalesce(p_nom,''),
    'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝŸýÿ',
    'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOOooooooUUUUuuuuYYyy'));
  v_normalise:=left(regexp_replace(v_normalise,'[^A-Z0-9]','','g'),3);
  if v_normalise='' then return 'DEP';end if;
  return rpad(v_normalise,3,'X');
end;$$;

alter table public.entreprises
  alter column mode_identifiant_employe set default 'prefixe_4_chiffres',
  alter column prefixe_identifiant_employe set default 'DEP';

create or replace function public.trg_prefixe_identifiant_entreprise()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.prefixe_identifiant_employe is null or new.prefixe_identifiant_employe='DEP' then
    new.prefixe_identifiant_employe:=public.prefixe_identifiant_entreprise(new.nom);
  end if;
  return new;
end;$$;

drop trigger if exists prefixe_identifiant_entreprise on public.entreprises;
create trigger prefixe_identifiant_entreprise
before insert on public.entreprises
for each row execute function public.trg_prefixe_identifiant_entreprise();

-- Corrige uniquement la configuration générique historique. Les identifiants
-- existants restent intacts tant que l'administrateur ne demande pas une
-- renumérotation depuis Paramètres.
update public.entreprises
set prefixe_identifiant_employe=public.prefixe_identifiant_entreprise(nom),updated_at=now()
where prefixe_identifiant_employe='EMP';

revoke all on function public.prefixe_identifiant_entreprise(text) from public,anon,authenticated;
revoke all on function public.trg_prefixe_identifiant_entreprise() from public,anon,authenticated;

notify pgrst,'reload schema';
