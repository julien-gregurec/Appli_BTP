"use client";

import { useEffect, useRef, useState } from "react";
import { euros } from "@/lib/devis";
import { chargerOuvrageAction, rechercherOuvragesAction, type OuvrageTrouve } from "@/app/actions/devis-v2";
import {
  ajouterLigne,
  comparerAvecVersion,
  instancierOuvrage,
  MODES_PRESENTATION,
  modifierLigne,
  montantsInstance,
  NATURES_COMPOSANT,
  recalculerInstance,
  reappliquerVersion,
  retirerLigne,
  type ComparaisonVersions,
  type InstanceOuvrage,
  type LigneOuvrage,
  type ModePresentation,
  type NatureComposant,
  type VersionOuvrage,
} from "@/lib/devis/ouvrages";
import { avertissementsPrix, indicateursPrix, TAUX_TVA_ADMIS } from "@/lib/devis/prix";

/**
 * Insérer un ouvrage composé dans un devis — ou modifier une instance déjà insérée.
 *
 * Tout ce qui est modifié ici l'est SUR L'INSTANCE du devis : la bibliothèque n'est jamais touchée.
 * Réappliquer une version plus récente du modèle est un geste explicite, précédé d'une comparaison.
 */
export function InsertionOuvrageDialog({
  instanceInitiale,
  genererCle,
  peutVoirCouts,
  peutModifierPrix,
  seuilTauxMarquePct,
  onFermer,
  onValider,
}: {
  instanceInitiale: InstanceOuvrage | null;
  genererCle: () => string;
  peutVoirCouts: boolean;
  peutModifierPrix: boolean;
  seuilTauxMarquePct: number | null;
  onFermer: () => void;
  onValider: (instance: InstanceOuvrage) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const champRecherche = useRef<HTMLInputElement>(null);
  const [recherche, setRecherche] = useState("");
  const [trouves, setTrouves] = useState<OuvrageTrouve[]>([]);
  const [version, setVersion] = useState<VersionOuvrage | null>(null);
  const [instance, setInstance] = useState<InstanceOuvrage | null>(instanceInitiale);
  const [quantite, setQuantite] = useState(String(instanceInitiale?.quantitePrincipale ?? ""));
  const [confirmeArchive, setConfirmeArchive] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nouvelle, setNouvelle] = useState<{ version: VersionOuvrage; comparaison: ComparaisonVersions } | null>(null);
  const [conserver, setConserver] = useState(true);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    champRecherche.current?.focus();
  }, []);

  // Instance existante : une version plus récente du modèle existe-t-elle ?
  useEffect(() => {
    if (!instanceInitiale?.ouvrageId) return;
    let actif = true;
    void chargerOuvrageAction(instanceInitiale.ouvrageId).then((r) => {
      if (!actif || "error" in r || r.version.version <= instanceInitiale.version) return;
      setNouvelle({ version: r.version, comparaison: comparerAvecVersion(instanceInitiale, r.version) });
    });
    return () => { actif = false; };
  }, [instanceInitiale]);

  useEffect(() => {
    if (instanceInitiale) return;
    const texte = recherche.trim();
    // Recherche vide : liste masquée par dérivation (`trouvesAffiches`), sans écrire d'état ici.
    if (!texte) return;
    let actif = true;
    const minuterie = setTimeout(async () => {
      const r = await rechercherOuvragesAction(texte);
      if (!actif) return;
      if ("error" in r) setErreur(r.error);
      else { setErreur(null); setTrouves(r.ouvrages); }
    }, 220);
    return () => { actif = false; clearTimeout(minuterie); };
  }, [recherche, instanceInitiale]);

  const choisir = async (id: string) => {
    const r = await chargerOuvrageAction(id);
    if ("error" in r) { setErreur(r.error); return; }
    setVersion(r.version);
    setQuantite(String(r.version.quantitePrincipale));
    preparer(r.version, r.version.quantitePrincipale, undefined, undefined, false);
  };

  const preparer = (v: VersionOuvrage, qp: number, options?: string[], saisies?: Record<string, number>, confirme = confirmeArchive) => {
    const issue = instancierOuvrage(v, { cle: genererCle(), ordre: 0, quantitePrincipale: qp, options, saisies, confirmeArchive: confirme });
    if (issue.etat === "refuse") { setErreur(issue.motif); setInstance(null); return; }
    setErreur(null);
    setInstance(issue.instance);
  };

  const qp = Number(quantite.replace(",", "."));
  const majQuantite = (valeur: string) => {
    setQuantite(valeur);
    const q = Number(valeur.replace(",", "."));
    if (!(q > 0) || !instance) return;
    setInstance(recalculerInstance(instance, { quantitePrincipale: q }));
  };
  const majLigne = (cle: string, patch: Parameters<typeof modifierLigne>[2]) => {
    if (!instance) return;
    try { setInstance(modifierLigne(instance, cle, patch)); setErreur(null); } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); }
  };
  const retirer = (cle: string) => {
    if (!instance) return;
    try { setInstance(retirerLigne(instance, cle)); setErreur(null); } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); }
  };
  const options = (instance ? instance.modele.composants : version?.composants ?? [])
    .flatMap((c) => (c.condition.type === "option" ? [c.condition] : []))
    .filter((o, i, t) => t.findIndex((x) => x.cle === o.cle) === i);
  const aSaisir = (instance ? instance.modele.composants : version?.composants ?? []).filter((c) => c.saisieRequise);

  const trouvesAffiches = recherche.trim() ? trouves : [];
  const montants = instance ? montantsInstance(instance) : null;
  const ind = instance ? indicateursPrix(instance) : null;
  const alertes = instance ? avertissementsPrix(instance, { seuilTauxMarquePct }).filter((a) => peutVoirCouts || !["prix_inferieur_cout", "marge_sous_seuil", "cout_inconnu"].includes(a.code)) : [];
  const champ = "min-h-11 rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
  const num = (v: string) => Number(v.replace(",", "."));

  return (
    <dialog
      ref={dialog}
      aria-labelledby="ouvrage-titre"
      onCancel={(e) => { e.preventDefault(); onFermer(); }}
      className="m-0 h-full max-h-none w-full max-w-none bg-white p-0 backdrop:bg-black/40 dark:bg-neutral-950 md:m-auto md:h-[90vh] md:w-[min(1200px,96vw)] md:rounded-lg"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h2 id="ouvrage-titre" className="text-base font-semibold">{instanceInitiale ? `Modifier l’ouvrage — ${instanceInitiale.nom}` : "Insérer un ouvrage"}</h2>
          <button type="button" onClick={onFermer} className="ml-auto min-h-11 min-w-11 text-xl" aria-label="Fermer">×</button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 text-sm">
          {erreur && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-red-700">{erreur}</p>}

          {!instanceInitiale && !version && (
            <div className="space-y-2">
              <label htmlFor="recherche-ouvrage" className="font-medium">Référence, nom, catégorie, référence ou fabricant d’un composant</label>
              <input id="recherche-ouvrage" ref={champRecherche} value={recherche} onChange={(e) => setRecherche(e.target.value)} className={`${champ} w-full text-base`} placeholder="ex. PC-001, plancher, FAB-ISO-30…" />
              <ul className="space-y-1">
                {trouvesAffiches.map((o) => (
                  <li key={o.id}>
                    <button type="button" onClick={() => void choisir(o.id)} className="flex min-h-11 w-full items-center gap-3 rounded-md border border-neutral-200 px-3 py-2 text-left hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900">
                      <span className="font-mono text-xs">{o.referenceInterne ?? "—"}</span>
                      <span className="flex-1 font-medium">{o.nom}</span>
                      <span className="text-xs text-neutral-500">{o.categorie ?? ""} · v{o.versionCourante} · {o.correspondance}</span>
                      {o.statut === "archive" && <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-900">Archivé</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {version?.statut === "archive" && !instance && (
            <label className="flex min-h-11 items-center gap-2 text-amber-900">
              <input type="checkbox" checked={confirmeArchive} onChange={(e) => { setConfirmeArchive(e.target.checked); if (e.target.checked) preparer(version, qp, undefined, undefined, true); }} />
              Cet ouvrage est archivé : je confirme vouloir l’insérer
            </label>
          )}

          {nouvelle && (
            <section className="space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-blue-950">
              <p className="font-medium">La version {nouvelle.version.version} du modèle est disponible (ce devis utilise la version {instanceInitiale?.version}).</p>
              <ul className="list-disc pl-5">
                {nouvelle.comparaison.ajoutes.map((a) => <li key={`a-${a.cle}`}>Ajouté : {a.designation}</li>)}
                {nouvelle.comparaison.retires.map((r) => <li key={`r-${r.cle}`}>Retiré : {r.designation}</li>)}
                {nouvelle.comparaison.modifies.map((m) => <li key={`m-${m.cle}`}>Modifié : {m.designation} ({m.changements.map((c) => c.champ).join(", ")})</li>)}
              </ul>
              <p>Montant HT : {euros(nouvelle.comparaison.venteHtAvant)} → {euros(nouvelle.comparaison.venteHtApres)}</p>
              {nouvelle.comparaison.modificationsManuelles.length > 0 && (
                <label className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" checked={conserver} onChange={(e) => setConserver(e.target.checked)} />
                  Conserver mes {nouvelle.comparaison.modificationsManuelles.length} modification(s) faites dans ce devis
                </label>
              )}
              <button
                type="button"
                className="min-h-11 rounded-md bg-blue-900 px-4 font-medium text-white"
                onClick={() => {
                  if (!instance) return;
                  const r = reappliquerVersion(instance, nouvelle.version, { statutDevis: "brouillon", confirmer: true, conserverModificationsManuelles: conserver });
                  if (r.etat === "refuse") setErreur(r.motif);
                  else { setInstance(r.instance); setNouvelle(null); }
                }}
              >
                Réappliquer la version {nouvelle.version.version}
              </button>
            </section>
          )}

          {instance && (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <label className="flex flex-col gap-1 sm:col-span-2">
                  Libellé pour le client
                  <input value={instance.libelleClient} onChange={(e) => setInstance({ ...instance, libelleClient: e.target.value })} className={champ} />
                </label>
                <label className="flex flex-col gap-1">
                  Quantité ({instance.unitePrincipale})
                  <input inputMode="decimal" value={quantite} onChange={(e) => majQuantite(e.target.value)} className={champ} />
                </label>
                <label className="flex flex-col gap-1">
                  Présentation client
                  <select value={instance.mode} onChange={(e) => setInstance({ ...instance, mode: e.target.value as ModePresentation })} className={champ}>
                    {MODES_PRESENTATION.map((m) => <option key={m.cle} value={m.cle}>{m.libelle}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 sm:col-span-4">
                  Description pour le client
                  <textarea rows={2} value={instance.descriptionClient ?? ""} onChange={(e) => setInstance({ ...instance, descriptionClient: e.target.value || null })} className={`${champ} py-1`} />
                </label>
              </div>
              <p className="text-xs text-neutral-500">{MODES_PRESENTATION.find((m) => m.cle === instance.mode)?.aide}</p>

              {(options.length > 0 || aSaisir.length > 0) && (
                <div className="flex flex-wrap gap-3 rounded-md bg-neutral-50 p-3 dark:bg-neutral-900">
                  {options.map((o) => (
                    <label key={o.cle} className="flex min-h-11 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={instance.options.includes(o.cle)}
                        onChange={(e) => setInstance(recalculerInstance(instance, { options: e.target.checked ? [...instance.options, o.cle] : instance.options.filter((x) => x !== o.cle) }))}
                      />
                      {o.libelle}
                    </label>
                  ))}
                  {aSaisir.map((c) => (
                    <label key={c.cle} className="flex items-center gap-2">
                      {c.designation} ({c.unite}) à saisir
                      <input
                        inputMode="decimal"
                        className={`${champ} w-24`}
                        defaultValue={instance.saisies[c.cle] ?? ""}
                        onBlur={(e) => { const v = num(e.target.value); if (v >= 0) setInstance(recalculerInstance(instance, { saisies: { [c.cle]: v } })); }}
                      />
                    </label>
                  ))}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead className="text-xs uppercase text-neutral-500">
                    <tr>
                      <th className="py-2">Composant</th><th>Quantité</th><th>Coef.</th><th>Perte %</th><th>PU HT</th><th>TVA</th>
                      {peutVoirCouts && <th>Achat</th>}
                      <th>Client</th><th className="sr-only">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instance.lignes.map((l: LigneOuvrage) => (
                      <tr key={l.cle} className="border-t border-neutral-200 align-top dark:border-neutral-800">
                        <td className="py-2 pr-2">
                          <input aria-label="Désignation" value={l.designation} onChange={(e) => majLigne(l.cle, { designation: e.target.value })} className={`${champ} w-full`} />
                          <div className="mt-1 text-xs text-neutral-500" title={l.detailCalcul}>{l.referenceInterne ?? ""} {l.detailCalcul}</div>
                          {instance.mode === "personnalise" && (
                            <input aria-label="Description personnalisée" placeholder="Description pour le client" value={l.descriptionPersonnalisee ?? ""} onChange={(e) => majLigne(l.cle, { descriptionPersonnalisee: e.target.value || null })} className={`${champ} mt-1 w-full`} />
                          )}
                        </td>
                        <td className="pr-2">
                          <input aria-label="Quantité" inputMode="decimal" defaultValue={l.quantite} key={`q-${l.quantite}`} onBlur={(e) => { const v = num(e.target.value); if (v >= 0 && v !== l.quantite) majLigne(l.cle, { quantite: v }); }} className={`${champ} w-24`} />
                          <div className="text-xs text-neutral-500">{l.unite}{l.quantiteForcee ? " · saisie" : ""}</div>
                        </td>
                        <td className="pr-2">
                          {l.origine === "ajustement" ? "—" : (
                            <input aria-label="Coefficient" inputMode="decimal" defaultValue={l.coefficient ?? ""} key={`c-${l.coefficient}`} onBlur={(e) => { const v = e.target.value.trim() === "" ? null : num(e.target.value); if (v === null || v >= 0) majLigne(l.cle, { coefficient: v }); }} className={`${champ} w-20`} />
                          )}
                        </td>
                        <td className="pr-2">
                          {l.origine === "ajustement" ? "—" : (
                            <input aria-label="Perte en %" inputMode="decimal" defaultValue={l.pertePct} key={`p-${l.pertePct}`} onBlur={(e) => { const v = num(e.target.value); if (v >= 0 && v <= 100) majLigne(l.cle, { pertePct: v }); }} className={`${champ} w-16`} />
                          )}
                        </td>
                        <td className="pr-2">
                          <input aria-label="Prix unitaire HT" inputMode="decimal" disabled={!peutModifierPrix} defaultValue={l.prixVenteHt} key={`v-${l.prixVenteHt}`} onBlur={(e) => { const v = num(e.target.value); if (Number.isFinite(v)) majLigne(l.cle, { prixVenteHt: v }); }} className={`${champ} w-24`} />
                        </td>
                        <td className="pr-2">
                          <select aria-label="Taux de TVA" value={l.tauxTva} onChange={(e) => majLigne(l.cle, { tauxTva: Number(e.target.value) })} className={champ}>
                            {[...new Set([...TAUX_TVA_ADMIS, l.tauxTva])].map((t) => <option key={t} value={t}>{t} %</option>)}
                          </select>
                        </td>
                        {peutVoirCouts && (
                          <td className="pr-2 tabular-nums">{l.prixAchatHt === null ? "—" : euros(l.prixAchatHt)}</td>
                        )}
                        <td className="pr-2">
                          <label className="flex min-h-11 items-center gap-1 text-xs">
                            <input type="checkbox" checked={l.visibleClient} onChange={(e) => majLigne(l.cle, { visibleClient: e.target.checked })} />
                            visible
                          </label>
                          {instance.mode === "personnalise" && (
                            <>
                              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={l.afficherQuantite} onChange={(e) => majLigne(l.cle, { afficherQuantite: e.target.checked })} />quantité</label>
                              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={l.afficherPrix} onChange={(e) => majLigne(l.cle, { afficherPrix: e.target.checked })} />prix</label>
                            </>
                          )}
                        </td>
                        <td>
                          <button type="button" onClick={() => retirer(l.cle)} className="min-h-11 min-w-11 text-neutral-500 hover:text-red-700" aria-label={`Retirer ${l.designation}`}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <AjoutComposant
                onAjouter={(nature, designation, unite, quantiteSaisie, prix) => {
                  try {
                    setInstance(ajouterLigne(instance, { cle: genererCle(), designation, unite, nature, quantite: quantiteSaisie, prixVenteHt: prix, tauxTva: 20 }));
                  } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); }
                }}
              />

              {montants && ind && (
                <div className="grid gap-1 rounded-md bg-neutral-50 p-3 dark:bg-neutral-900 sm:grid-cols-2">
                  <div>Montant HT de l’ouvrage : <strong className="tabular-nums">{euros(ind.prixVenteRetenuHt)}</strong></div>
                  <div>Taux de TVA : {montants.tauxTva.join(" %, ")} %</div>
                  {peutVoirCouts && (
                    <>
                      <div>Coût d’achat estimé : {ind.coutAchatHt === null ? "incomplet" : euros(ind.coutAchatHt)}</div>
                      <div>Marge : {ind.margeHt === null ? "—" : `${euros(ind.margeHt)} · marque ${ind.tauxMarquePct ?? "—"} %`}</div>
                    </>
                  )}
                  {alertes.map((a, i) => (
                    <p key={i} className={`sm:col-span-2 ${a.gravite === "attention" ? "text-amber-800" : "text-neutral-500"}`}>{a.message}</p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <footer className="flex gap-2 border-t border-neutral-200 p-3 dark:border-neutral-800">
          <button type="button" onClick={onFermer} className="min-h-11 rounded-md border px-4 text-sm">Annuler</button>
          <button
            type="button"
            disabled={!instance || !(qp > 0)}
            onClick={() => instance && onValider(instance)}
            className="ml-auto min-h-11 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
          >
            {instanceInitiale ? "Enregistrer l’ouvrage dans le devis" : "Insérer tout l’ouvrage"}
          </button>
        </footer>
      </div>
    </dialog>
  );
}

function AjoutComposant({ onAjouter }: { onAjouter: (nature: NatureComposant, designation: string, unite: string, quantite: number, prix: number) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [nature, setNature] = useState<NatureComposant>("libre");
  const [designation, setDesignation] = useState("");
  const [unite, setUnite] = useState("u");
  const [quantite, setQuantite] = useState("1");
  const [prix, setPrix] = useState("0");
  const champ = "min-h-11 rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
  if (!ouvert) return <button type="button" onClick={() => setOuvert(true)} className="min-h-11 rounded-md border border-dashed px-3 text-sm">+ Ajouter un composant à cet ouvrage</button>;
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
      <label className="flex flex-col text-xs">Nature
        <select value={nature} onChange={(e) => setNature(e.target.value as NatureComposant)} className={champ}>
          {NATURES_COMPOSANT.map((n) => <option key={n.cle} value={n.cle}>{n.libelle}</option>)}
        </select>
      </label>
      <label className="flex flex-1 flex-col text-xs">Désignation<input value={designation} onChange={(e) => setDesignation(e.target.value)} className={champ} /></label>
      <label className="flex flex-col text-xs">Unité<input value={unite} onChange={(e) => setUnite(e.target.value)} className={`${champ} w-20`} /></label>
      <label className="flex flex-col text-xs">Quantité<input inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value)} className={`${champ} w-24`} /></label>
      <label className="flex flex-col text-xs">PU HT<input inputMode="decimal" value={prix} onChange={(e) => setPrix(e.target.value)} className={`${champ} w-24`} /></label>
      <button
        type="button"
        disabled={!designation.trim()}
        onClick={() => {
          onAjouter(nature, designation.trim(), unite.trim() || "u", Number(quantite.replace(",", ".")) || 0, Number(prix.replace(",", ".")) || 0);
          setDesignation("");
          setOuvert(false);
        }}
        className="min-h-11 rounded-md bg-neutral-900 px-3 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
      >
        Ajouter
      </button>
    </div>
  );
}
