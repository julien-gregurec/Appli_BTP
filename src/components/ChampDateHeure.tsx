"use client";

import { useId, useState, useSyncExternalStore } from "react";
import {
  FUSEAU_REFERENCE,
  fuseauValide,
  suffixeFuseau,
  suffixeSansValeur,
  valeurDateHeureDansFuseau,
} from "@/lib/date-heure-locale";

type Props = {
  name: string;
  label: string;
  /** Instant stocké (ISO UTC) à afficher, ou null. */
  valeurIso?: string | null;
  required?: boolean;
  className?: string;
  labelClassName?: string;
  /** Libellé de l'option explicite « sans date » (ex. « Sans date de fin »). */
  libelleSansValeur?: string;
};

const abonnementInerte = () => () => {};

function fuseauNavigateur(): string {
  try {
    const fuseau = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return fuseauValide(fuseau) ? fuseau : FUSEAU_REFERENCE;
  } catch {
    return FUSEAU_REFERENCE;
  }
}

/**
 * Champ date + heure au contrat explicite (V9-01 / V9-02, post-V9) — voir
 * src/lib/date-heure-locale.ts. Le rendu serveur utilise le fuseau de référence ; une fois
 * hydraté, le champ bascule sur le fuseau du navigateur et transmet ce fuseau dans
 * `<name>__fuseau`, de sorte que le serveur convertit l'heure saisie dans le fuseau même
 * où elle a été lue. L'option `libelleSansValeur` ajoute une case explicite (Safari ne
 * permet pas de vider un datetime-local) qui désactive et vide le champ.
 */
export function ChampDateHeure({ name, label, valeurIso = null, required, className, labelClassName, libelleSansValeur }: Props) {
  const id = useId();
  // Fuseau : instantané serveur = fuseau de référence ; navigateur = fuseau local (le
  // fuseau ne change pas pendant la vie de la page, aucun abonnement nécessaire).
  const fuseau = useSyncExternalStore(abonnementInerte, fuseauNavigateur, () => FUSEAU_REFERENCE);
  // null = champ non modifié : la valeur affichée suit le fuseau effectif.
  const [saisie, setSaisie] = useState<string | null>(null);
  const [sansValeur, setSansValeur] = useState(Boolean(libelleSansValeur) && !valeurIso);
  const valeur = saisie ?? valeurDateHeureDansFuseau(valeurIso, fuseau);

  return (
    <div className="space-y-1">
      <label htmlFor={id} className={labelClassName}>
        {label}
        <input
          id={id}
          name={name}
          type="datetime-local"
          autoComplete="off"
          required={required && !sansValeur}
          disabled={sansValeur}
          value={sansValeur ? "" : valeur}
          onChange={(evenement) => setSaisie(evenement.target.value)}
          className={className}
          aria-describedby={`${id}-fuseau`}
          data-fuseau={fuseau}
        />
      </label>
      <input type="hidden" name={suffixeFuseau(name)} value={fuseau} />
      <p id={`${id}-fuseau`} className="text-[11px] text-neutral-500">Heure locale ({fuseau})</p>
      {libelleSansValeur && (
        <label className="flex min-h-8 items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            name={suffixeSansValeur(name)}
            value="1"
            checked={sansValeur}
            onChange={(evenement) => setSansValeur(evenement.target.checked)}
            className="h-4 w-4"
          />
          {libelleSansValeur}
        </label>
      )}
    </div>
  );
}
