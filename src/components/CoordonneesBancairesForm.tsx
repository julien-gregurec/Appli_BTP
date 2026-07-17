import { enregistrerRibAction } from "@/app/actions/paiements-bancaires";

const champ = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export function CoordonneesBancairesForm({
  type,
  beneficiaireId,
  retour,
  rib,
}: {
  type: "employe" | "fournisseur";
  beneficiaireId: string;
  retour: string;
  rib?: { titulaire: string; iban_quatre_derniers: string; verification_statut: string; verification_message?: string | null } | null;
}) {
  return <section className="space-y-4 rounded-md border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-semibold">Coordonnées bancaires</h2><p className="text-sm text-neutral-500">L’IBAN est chiffré avant stockage et ne sera jamais réaffiché en entier.</p></div>
      {rib && <span className={`rounded-full px-2 py-1 text-xs font-semibold ${rib.verification_statut === "verifie" ? "bg-green-100 text-green-800" : rib.verification_statut === "rejete" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>{rib.verification_statut === "verifie" ? "RIB vérifié" : rib.verification_statut === "rejete" ? "RIB rejeté" : "À vérifier"}</span>}
    </div>
    {rib && <div className="rounded-md border bg-white p-3 text-sm dark:bg-neutral-950"><strong>{rib.titulaire}</strong><p className="font-mono text-neutral-500">IBAN •••• {rib.iban_quatre_derniers}</p>{rib.verification_message && <p className="mt-1 text-xs text-red-700">{rib.verification_message}</p>}</div>}
    <form action={enregistrerRibAction.bind(null, type, beneficiaireId)} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="retour" value={retour}/>
      <label className="text-xs text-neutral-500">Titulaire exact du compte<input name="titulaire" required autoComplete="off" defaultValue={rib?.titulaire ?? ""} className={`mt-1 ${champ}`}/></label>
      <label className="text-xs text-neutral-500">IBAN<input name="iban" required autoComplete="off" placeholder="FR76…" className={`mt-1 ${champ}`}/></label>
      <label className="text-xs text-neutral-500">BIC (facultatif)<input name="bic" autoComplete="off" className={`mt-1 ${champ}`}/></label>
      <button className="self-end rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">{rib ? "Remplacer le RIB" : "Enregistrer le RIB"}</button>
    </form>
    <p className="text-xs text-neutral-500">Tout nouveau RIB doit être vérifié par une seconde personne autorisée avant de pouvoir préparer un virement.</p>
  </section>;
}
