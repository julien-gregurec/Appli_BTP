-- Correctif : les migrations boutique (144/145) ont rouvert l'accès anon par erreur,
-- en suivant la convention "mode prototype" d'avant le passage en production
-- authentifiée (voir 20260714000078_fermeture_acces_anonyme_production.sql). La
-- boutique est postérieure à cette fermeture définitive et ne doit avoir aucun
-- accès anonyme, comme toute table créée depuis cette date (ex. grands_deplacements).

drop policy if exists boutique_produits_prototype on public.boutique_produits;
drop policy if exists boutique_commandes_prototype on public.boutique_commandes;
drop policy if exists boutique_lignes_prototype on public.boutique_lignes_commande;

revoke all privileges on public.boutique_produits from anon;
revoke all privileges on public.boutique_commandes from anon;
revoke all privileges on public.boutique_lignes_commande from anon;

notify pgrst,'reload schema';
