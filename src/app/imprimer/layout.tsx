// Layout minimal pour les documents imprimables : pas de navigation, fond blanc.
export default function ImprimerLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-full bg-white text-black">{children}</div>;
}
