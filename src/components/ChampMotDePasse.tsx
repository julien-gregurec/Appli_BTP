"use client";

import { useState } from "react";

/**
 * Champ mot de passe avec bouton Afficher/Masquer. Masqué par défaut.
 * Ne rend que l'input + le bouton : le label et son éventuel lien
 * associé (ex. "Mot de passe oublié ?") restent à la charge de l'appelant.
 */
export function ChampMotDePasse({
  id,
  name,
  autoComplete,
  required,
  minLength,
}: {
  id: string;
  name: string;
  autoComplete: string;
  required?: boolean;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 pr-16 text-sm"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        className="absolute inset-y-0 right-2 text-xs font-medium text-neutral-500 hover:text-neutral-800"
      >
        {visible ? "Masquer" : "Afficher"}
      </button>
    </div>
  );
}
