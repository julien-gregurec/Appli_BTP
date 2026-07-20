"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

export type SearchableOption = { value: string; label: string; search?: string };

const normaliser = (valeur: string) => valeur.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function SearchableSelect({
  name,
  options,
  value,
  defaultValue = "",
  onValueChange,
  placeholder = "Rechercher…",
  emptyLabel,
  required = false,
  disabled = false,
  className = "",
}: {
  name?: string;
  options: SearchableOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const controle = value !== undefined;
  const [valeurInterne, setValeurInterne] = useState(defaultValue);
  const valeur = controle ? value : valeurInterne;
  const optionSelectionnee = options.find((option) => option.value === valeur);
  const [recherche, setRecherche] = useState(optionSelectionnee?.label ?? "");
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const conteneur = useRef<HTMLDivElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    const fermer = (event: PointerEvent) => {
      if (!conteneur.current?.contains(event.target as Node)) setOuvert(false);
    };
    document.addEventListener("pointerdown", fermer);
    return () => document.removeEventListener("pointerdown", fermer);
  }, []);

  const filtres = useMemo(() => {
    const termes = normaliser(recherche).split(/\s+/).filter(Boolean);
    const resultat = termes.length === 0 ? options : options.filter((option) => {
      const texte = normaliser(`${option.label} ${option.search ?? ""}`);
      return termes.every((terme) => texte.includes(terme));
    });
    return resultat.slice(0, 80);
  }, [options, recherche]);

  const choisir = (nouvelleValeur: string) => {
    if (!controle) setValeurInterne(nouvelleValeur);
    onValueChange?.(nouvelleValeur);
    setRecherche(options.find((option) => option.value === nouvelleValeur)?.label ?? "");
    setOuvert(false);
  };

  // Éléments réellement navigables : l'option « vide » éventuelle, puis les résultats.
  const navigables = useMemo(
    () => [...(emptyLabel ? [{ value: "", label: emptyLabel }] : []), ...filtres],
    [emptyLabel, filtres],
  );

  // La saisie ou l'ouverture repositionne la sélection en tête de liste.
  useEffect(() => { setActif(0); }, [recherche, ouvert]);

  // Garde l'option active visible quand on parcourt une longue liste.
  useEffect(() => {
    if (!ouvert) return;
    liste.current?.querySelector<HTMLElement>(`[data-index="${actif}"]`)?.scrollIntoView({ block: "nearest" });
  }, [actif, ouvert]);

  const surTouche = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!ouvert) { setOuvert(true); return; }
      const pas = event.key === "ArrowDown" ? 1 : -1;
      setActif((index) => Math.min(Math.max(index + pas, 0), Math.max(navigables.length - 1, 0)));
      return;
    }
    if (event.key === "Enter") {
      // Sans cela, Entrée soumettrait le formulaire au lieu de choisir l'option.
      if (ouvert && navigables[actif]) {
        event.preventDefault();
        choisir(navigables[actif].value);
      }
      return;
    }
    if (event.key === "Escape" && ouvert) {
      event.preventDefault();
      setOuvert(false);
      return;
    }
    if (event.key === "Tab") setOuvert(false);
  };

  return <div ref={conteneur} className={`relative ${className}`}>
    {name && <input type="hidden" name={name} value={valeur} />}
    <div className="relative">
      <input
        type="search"
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={ouvert}
        aria-autocomplete="list"
        aria-activedescendant={ouvert && navigables[actif] ? `${listboxId}-${actif}` : undefined}
        required={required}
        disabled={disabled}
        value={recherche}
        placeholder={options.length ? placeholder : "Aucun élément accessible"}
        onKeyDown={surTouche}
        onFocus={() => setOuvert(true)}
        onChange={(event) => {
          setRecherche(event.target.value);
          if (valeur) {
            if (!controle) setValeurInterne("");
            onValueChange?.("");
          }
          setOuvert(true);
        }}
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 pr-9 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button type="button" disabled={disabled} onClick={() => setOuvert((etat) => !etat)} aria-label="Ouvrir la liste" className="absolute inset-y-0 right-0 px-3 text-neutral-500">⌄</button>
    </div>
    {ouvert && !disabled && <div ref={liste} id={listboxId} role="listbox" className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-white p-1 shadow-xl dark:border-neutral-700 dark:bg-neutral-950">
      {navigables.map((option, index) => {
        const estActif = index === actif;
        const estChoisi = option.value === valeur;
        return <button
          key={option.value || "__vide"}
          id={`${listboxId}-${index}`}
          data-index={index}
          type="button"
          role="option"
          aria-selected={estChoisi}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActif(index)}
          onClick={() => choisir(option.value)}
          className={`block w-full rounded px-3 py-2 text-left text-sm ${estActif ? "bg-neutral-100 dark:bg-neutral-800" : ""} ${estChoisi ? "font-medium text-blue-800 dark:text-blue-200" : ""}`}
        >{option.label}</button>;
      })}
      {!filtres.length && <p className="px-3 py-4 text-center text-sm text-neutral-500">Aucun résultat pour « {recherche} »</p>}
      {filtres.length === 80 && <p className="px-3 py-2 text-xs text-neutral-500">Affinez la recherche pour afficher les autres résultats.</p>}
    </div>}
  </div>;
}
