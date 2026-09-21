-- Non-régression : module_gestion_pro_actif_entreprise() doit vérifier
-- l'appartenance de l'appelant à l'entreprise passée en argument dès qu'un JWT
-- authentifié est présent (corrigé par 20260905000266). Avant correction, un
-- utilisateur authentifié non membre pouvait apprendre l'état d'activation
-- d'un module payant d'une entreprise tierce via un appel RPC direct. La
-- garde ne s'applique volontairement PAS quand auth.uid() est nul (appel
-- "pur" sans contexte JWT), pour ne pas régresser modules_a_la_carte_r3_v1.test.sql
-- (assertions 1-8, appelées en superuser) ni l'appelant interne
-- a_acces_module_gestion_pro().
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

\ir fixtures/isolation_multitenant.inc

-- Entreprise B a un module "stock" explicitement actif, sans rapport avec A.
-- Entreprise A a aussi "stock" actif (pour le témoin positif même-tenant).
-- modules_entreprises est SELECT-seul pour authenticated (mutation par RPC
-- uniquement) : ces inserts de fixture doivent s'exécuter avant le SET ROLE.
insert into public.modules_entreprises (entreprise_id, module_code, actif, origine, valide_du)
values
  ('b0000000-0000-0000-0000-000000000001', 'stock', true, 'admin', current_date),
  ('a0000000-0000-0000-0000-000000000001', 'stock', true, 'admin', current_date)
on conflict do nothing;

-- 1. Sans contexte JWT (auth.uid() nul) : comportement "pur" préservé, la
-- garde ne s'applique pas (chemin utilisé par les tests unitaires
-- superuser existants et par a_acces_module_gestion_pro() en interne).
select is(
  public.module_gestion_pro_actif_entreprise('b0000000-0000-0000-0000-000000000001', 'stock'),
  true,
  '1. Sans identité JWT (superuser) : réponse "pure" non affectée par le correctif'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true); -- admin A
select set_config('request.jwt.claim.role', 'authenticated', true);

-- 2. Témoin négatif : A (non membre de B) authentifié ne doit PAS apprendre
-- l'état du module de B (ex-fuite cross-tenant).
select is(
  public.module_gestion_pro_actif_entreprise('b0000000-0000-0000-0000-000000000001', 'stock'),
  false,
  '2. A authentifié, non-membre de B : renvoie false (fuite cross-tenant fermée)'
);

-- 3. Témoin positif : appel RPC direct même-tenant toujours fonctionnel
-- (usage existant, cf. test "10b" de modules_a_la_carte_r3_v1.test.sql).
select is(
  public.module_gestion_pro_actif_entreprise('a0000000-0000-0000-0000-000000000001', 'stock'),
  true,
  '3. A authentifié sur SA PROPRE entreprise : réponse réelle inchangée (pas de régression)'
);

-- 4. Le chemin appelant légitime (a_acces_module_gestion_pro) reste inchangé.
select is(
  public.a_acces_module_gestion_pro('a0000000-0000-0000-0000-000000000001', 'stock'),
  true,
  '4. a_acces_module_gestion_pro(A, stock) pour un membre actif de A reste true après le correctif'
);

reset role;

-- 5. Plateforme admin : accès conservé (branche est_plateforme_admin() de la garde).
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.module_gestion_pro_actif_entreprise('b0000000-0000-0000-0000-000000000001', 'stock'),
  true,
  '5. Admin plateforme authentifié : accès conservé sur une entreprise tierce'
);

select * from finish();
rollback;
