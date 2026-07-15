"use client";

import { useState } from "react";
import { NAVIGATION_APPLICATION, NAVIGATION_GROUPES } from "@/lib/navigation";
import { GESTION_PERMISSION_PAR_CHEMIN, PERMISSIONS_MUTATION_ALTERNATIVES } from "@/lib/module-permissions";

type PermissionDetail = { cle: string; module: string; description: string };

function droitsGestion(href: string) {
  const alternatif = Object.keys(PERMISSIONS_MUTATION_ALTERNATIVES).find((chemin) => href === chemin || href.startsWith(`${chemin}/`));
  if (alternatif) return PERMISSIONS_MUTATION_ALTERNATIVES[alternatif];
  const droit = GESTION_PERMISSION_PAR_CHEMIN.find(([chemin]) => href === chemin || href.startsWith(`${chemin}/`))?.[1];
  return droit ? [droit] : [];
}

export function ApercuPoste({ poste, entrepriseNom, permissions, catalogue }: {
  poste: string;
  entrepriseNom: string;
  permissions: string[];
  catalogue: PermissionDetail[];
}) {
  const [mobile, setMobile] = useState(false);
  const autorise = new Set(permissions);
  const navigation = NAVIGATION_APPLICATION.filter((item) => !item.permission || autorise.has(item.permission));
  const peutVoirChiffres = autorise.has("voir_indicateurs_financiers");
  const peutPointer = autorise.has("saisir_son_pointage");
  const peutVoirPlanning = autorise.has("acces_planning");
  const groupes = [
    { titre: "Consultation", couleur: "bg-blue-100 text-blue-800", droits: catalogue.filter((p) => p.cle.startsWith("acces_") && autorise.has(p.cle)) },
    { titre: "Gestion", couleur: "bg-amber-100 text-amber-800", droits: catalogue.filter((p) => p.cle.startsWith("gerer_") && autorise.has(p.cle)) },
    { titre: "Personnel", couleur: "bg-green-100 text-green-800", droits: catalogue.filter((p) => (p.cle.startsWith("saisir_") || p.cle === "valider_pointages") && autorise.has(p.cle)) },
    { titre: "Chiffres", couleur: "bg-violet-100 text-violet-800", droits: catalogue.filter((p) => p.cle.startsWith("voir_") && autorise.has(p.cle)) },
  ];

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-neutral-50 p-3 dark:bg-neutral-900">
      <p className="text-sm"><strong>Aperçu en lecture seule.</strong> Les montants et noms ci-dessous sont fictifs.</p>
      <div className="flex rounded-md border bg-white p-1 dark:bg-neutral-950">
        <button type="button" onClick={() => setMobile(false)} className={`rounded px-3 py-1.5 text-sm ${!mobile ? "bg-[#0d1b2a] text-white" : "text-neutral-500"}`}>Ordinateur</button>
        <button type="button" onClick={() => setMobile(true)} className={`rounded px-3 py-1.5 text-sm ${mobile ? "bg-[#0d1b2a] text-white" : "text-neutral-500"}`}>Téléphone</button>
      </div>
    </div>

    <div className="overflow-x-auto rounded-xl bg-neutral-200 p-3 dark:bg-neutral-800">
      <div className={`mx-auto overflow-hidden rounded-lg border bg-white shadow-xl transition-[max-width] dark:bg-neutral-950 ${mobile ? "max-w-[390px]" : "max-w-[1050px]"}`}>
        {mobile && <div className="flex h-14 items-center justify-between bg-[#0d1b2a] px-4 text-white">
          <div><div className="text-xs font-semibold tracking-wide">LIRIA <span className="text-[#c9a24a]">GESTION PRO</span></div><div className="max-w-48 truncate text-[10px] text-white/60">{entrepriseNom}</div></div>
          <span className="rounded border border-white/30 px-3 py-1.5 text-xs">☰ Menu</span>
        </div>}
        <div className={`flex ${mobile ? "min-h-[650px]" : "min-h-[620px]"}`}>
          {!mobile && <aside className="w-52 shrink-0 bg-[#0d1b2a] p-3 text-white">
            <div className="border-b border-white/10 pb-3"><div className="text-sm font-semibold tracking-wide">LIRIA</div><div className="text-[10px] tracking-[0.16em] text-[#c9a24a]">GESTION PRO</div><div className="mt-2 truncate text-[10px] text-white/60">{entrepriseNom}</div></div>
            <nav className="mt-3 space-y-1">{NAVIGATION_GROUPES.map((groupe) => {
              const items = navigation.filter((item) => item.groupe === groupe.cle);
              if (!items.length) return null;
              return <div key={groupe.cle}><div className="px-2.5 py-1 text-[8px] font-semibold uppercase tracking-wider text-white/40">{groupe.label}</div>{items.map((item) => <div key={item.href} className={`ml-1 rounded px-2.5 py-1.5 text-xs ${item.href === "/dashboard" ? "bg-[#c9a24a] font-medium text-[#0d1b2a]" : "text-white/75"}`}>{item.label}</div>)}</div>;
            })}</nav>
          </aside>}
          <div className="min-w-0 flex-1 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-lg font-semibold">Bonjour {poste}</h2><p className="text-xs text-neutral-500">{entrepriseNom} · aperçu du poste</p></div><span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] text-neutral-600">Lecture seule</span></div>

            {mobile && <div className="mt-4 rounded-md border p-3"><div className="text-xs font-semibold">Menu visible</div><div className="mt-2 space-y-2">{NAVIGATION_GROUPES.map((groupe) => { const items = navigation.filter((item) => item.groupe === groupe.cle); return items.length ? <div key={groupe.cle}><div className="text-[9px] font-semibold uppercase tracking-wide text-neutral-400">{groupe.label}</div><div className="mt-1 flex flex-wrap gap-1.5">{items.map((item) => <span key={item.href} className="rounded bg-neutral-100 px-2 py-1 text-[10px] dark:bg-neutral-800">{item.label}</span>)}</div></div> : null; })}</div></div>}

            {peutVoirChiffres && <div className={`mt-4 grid gap-2 ${mobile ? "grid-cols-2" : "grid-cols-4"}`}>
              {["Total facturé", "Encaissé", "Reste à encaisser", "Devis acceptés"].map((titre) => <div key={titre} className="rounded-md border p-3"><div className="text-[10px] text-neutral-500">{titre}</div><div className="mt-1 font-mono text-sm font-semibold">•• ••• €</div></div>)}
            </div>}

            <div className={`mt-4 grid gap-3 ${mobile ? "grid-cols-1" : "grid-cols-2"}`}>
              {peutPointer && <section className="rounded-md border border-green-200 bg-green-50 p-3 text-green-950"><h3 className="text-sm font-semibold">Pointage personnel</h3><p className="mt-1 text-xs">Chantier, arrivée/départ, date/heure et GPS.</p><span className="mt-3 inline-block rounded bg-green-700 px-3 py-1.5 text-xs text-white">Pointer mon arrivée</span></section>}
              {peutVoirPlanning && <section className="rounded-md border p-3"><h3 className="text-sm font-semibold">Mon planning</h3><div className="mt-2 rounded bg-neutral-50 p-2 text-xs dark:bg-neutral-900"><strong>Lundi · 8 h</strong><div className="text-neutral-500">Chantier exemple · Pose et finitions</div></div></section>}
              {navigation.filter((item) => item.permission && !["/planning", "/pointage"].includes(item.href)).slice(0, 6).map((item) => {
                const droits = droitsGestion(item.href);
                const gestion = droits.filter((droit) => droit.startsWith("gerer_")).some((droit) => autorise.has(droit));
                const personnel = !gestion && droits.filter((droit) => droit.startsWith("saisir_")).some((droit) => autorise.has(droit));
                const libelle = gestion ? "Gérer" : personnel ? "Personnel" : "Consulter";
                const couleur = gestion ? "bg-amber-100 text-amber-800" : personnel ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800";
                const detail = gestion ? "Création et modification autorisées." : personnel ? "Actions autorisées uniquement en son propre nom." : "Informations visibles, actions masquées.";
                return <section key={item.href} className="rounded-md border p-3"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{item.label}</h3><span className={`rounded-full px-2 py-0.5 text-[9px] ${couleur}`}>{libelle}</span></div><p className="mt-1 text-xs text-neutral-500">{detail}</p></section>;
              })}
            </div>

            {!peutVoirChiffres && <p className="mt-4 rounded-md border border-violet-200 bg-violet-50 p-3 text-xs text-violet-900"><strong>Chiffres financiers masqués :</strong> total facturé, encaissé, reste à encaisser et devis acceptés.</p>}
          </div>
        </div>
      </div>
    </div>

    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{groupes.map((groupe) => <div key={groupe.titre} className="rounded-md border p-3"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{groupe.titre}</h3><span className={`rounded-full px-2 py-0.5 text-xs ${groupe.couleur}`}>{groupe.droits.length}</span></div>{groupe.droits.length ? <ul className="mt-2 space-y-1">{groupe.droits.map((droit) => <li key={droit.cle} className="text-xs text-neutral-600 dark:text-neutral-300">• {droit.description}</li>)}</ul> : <p className="mt-2 text-xs text-neutral-400">Aucun droit</p>}</div>)}</section>
  </div>;
}
