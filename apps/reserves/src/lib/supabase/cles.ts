/**
 * Clé publique du client Supabase.
 *
 * La convention de l'écosystème est `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Gestion Pro,
 * Colors). Réserves lisait seulement l'ancien `NEXT_PUBLIC_SUPABASE_ANON_KEY`, avec un `!`
 * qui promettait une valeur que rien ne garantissait : si la variable portait une clé JWT
 * legacy — désactivée au niveau du projet Supabase — l'authentification échouait sans bruit
 * et l'écran affichait « Identifiants incorrects ».
 *
 * Le nom courant est lu en premier. L'ancien nom reste accepté en TRANSITION seulement, pour
 * ne pas casser un environnement déjà configuré : contrairement à Colors, Réserves n'a pas
 * encore de garde de build qui pourrait refuser l'ancien nom. Retirer ce repli dès que la
 * variable est renommée partout.
 *
 * Les deux lectures sont écrites littéralement : Next ne remplace que `process.env.NEXT_PUBLIC_X`.
 */
export function clePubliqueSupabase(): string {
  const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!cle) {
    throw new Error("Configuration Supabase incomplète : NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY absente");
  }
  return cle;
}
