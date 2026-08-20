// Repli sur l'ancienne clé anon legacy tant que tous les environnements
// (Preview notamment) n'ont pas explicitement reçu NEXT_PUBLIC_SUPABASE_
// PUBLISHABLE_KEY — cf. SECURITY-CREDENTIALS-V1B, qui ne touche que Production.
export function clePubliqueSupabase(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
}
