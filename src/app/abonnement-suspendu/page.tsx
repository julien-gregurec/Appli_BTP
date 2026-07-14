import { logoutAction } from "@/app/actions/auth";

export default function AbonnementSuspenduPage(){
  return <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6"><div className="w-full max-w-lg space-y-5 rounded-xl border bg-white p-6 text-center shadow-sm"><div className="text-4xl">⏸</div><h1 className="text-2xl font-semibold">Accès temporairement suspendu</h1><p className="text-sm text-neutral-600">Le délai de règlement est arrivé à échéance. Les données de l’entreprise sont conservées, mais l’accès est suspendu jusqu’à régularisation.</p><p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">L’administrateur de l’entreprise doit contacter Liria Gestion Pro. L’accès sera rétabli dès l’enregistrement du règlement.</p><form action={logoutAction}><button className="rounded-md border px-4 py-2 text-sm">Se déconnecter</button></form></div></main>;
}
