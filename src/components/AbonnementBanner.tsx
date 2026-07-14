import { AbonnementCountdown } from "@/components/AbonnementCountdown";

export function AbonnementBanner({echeance,message}:{echeance:string;message:string|null}){
  return <div role="alert" className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
    <strong>Règlement en attente.</strong> Votre administrateur a été averti : sans règlement, l’accès de l’entreprise sera automatiquement suspendu dans <AbonnementCountdown echeance={echeance} bloquerAEcheance/>.
    {message&&<span className="ml-1">{message}</span>}
  </div>;
}
