export function clePubliqueSupabase(): string {
  const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!cle) throw new Error("Configuration Supabase incomplète : NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY absente");
  return cle;
}
