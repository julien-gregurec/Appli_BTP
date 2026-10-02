import Link from "next/link";
import {
  CHAMP_ACCEPTATION,
  CHAMP_ACCEPTATION_VERSIONS,
  VERSIONS_DOCUMENTS_LEGAUX,
  versionsAfficheesSerialisees,
} from "@/lib/documents-legaux-versions";

// Case d'acceptation des CGU / CGV / DPA. Jamais pré-cochée (aucun état coché par défaut) et
// `required` côté navigateur ; l'action serveur revérifie la valeur et les versions
// affichées (lireAcceptationFormulaire), la base revérifie version et empreinte.
export function AcceptationConditions({ id = "acceptation-conditions" }: { id?: string }) {
  const { cgu, cgv, dpa } = VERSIONS_DOCUMENTS_LEGAUX;
  return (
    <div className="flex items-start gap-2 text-xs text-neutral-600 dark:text-neutral-300">
      <input type="hidden" name={CHAMP_ACCEPTATION_VERSIONS} value={versionsAfficheesSerialisees()} />
      <input id={id} name={CHAMP_ACCEPTATION} type="checkbox" required className="mt-0.5" />
      <label htmlFor={id}>
        J’ai lu et j’accepte les{" "}
        <Link href={cgu.chemin} target="_blank" className="underline">CGU (v{cgu.version})</Link>, les{" "}
        <Link href={cgv.chemin} target="_blank" className="underline">CGV (v{cgv.version})</Link> et l’
        <Link href={dpa.chemin} target="_blank" className="underline">accord de traitement des données (v{dpa.version})</Link>
        {" "}au nom de l’entreprise.
      </label>
    </div>
  );
}
