"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BoutonDeconnexion } from "@/components/mobile/BoutonDeconnexion";
import { PwaInstallButton } from "@/components/PwaInstallButton";
import { NAVIGATION_APPLICATION, NAVIGATION_GROUPES, navigationAutorisee } from "@/lib/navigation";
import { Lien as Link } from "@/components/Lien";
import { featureForPath, type FeatureKey } from "@/lib/feature-catalogue";
import { BrandWordmark } from "@/components/BrandWordmark";
import { PRODUCT_NAME } from "@/lib/brand";
import { ApplicationSwitcherGestionPro } from "@/components/ApplicationSwitcherGestionPro";
import type { DestinationApplication } from "@/lib/multi-app";
import { libelleCompactEssai, type StatutEssai } from "@/lib/essai-statut";

/** Repli du menu gauche (ce navigateur), ordinateur et tablette (≥ 768 px) uniquement — le tiroir
    mobile garde son propre état (`ouvert`), indépendant de celui-ci. */
const CLE_ETAT_MENU = "elsatia.menu.etat.v1";
type EtatMenu = "ouvert" | "compact" | "masque";

/**
 * Badge deux lettres pour le mode compact : ce dépôt n'a pas de jeu d'icônes (voir la barre d'actions
 * contextuelle, § 39, même choix) — premières lettres des deux premiers mots, ou deux premières lettres
 * d'un libellé à un seul mot. Deux entrées peuvent partager un badge (« Congés »/« Commandes » → « Co ») ;
 * le libellé complet reste la seule source fiable, porté par le tooltip et `aria-label`, jamais le badge
 * seul — les entrées voisines d'un même groupe sont d'ailleurs rarement homonymes à deux lettres près.
 */
function badgeCompact(label: string): string {
  const mots = label.split(/[\s-]+/).filter(Boolean);
  if (mots.length >= 2) return (mots[0][0] + mots[1][0]).toUpperCase();
  return (mots[0] ?? "").slice(0, 2).toUpperCase();
}

export function Sidebar({
  entrepriseNom,
  logoUrl,
  authDisabled = false,
  permissions = null,
  plateformeAdmin = false,
  boutiqueActive = true,
  activeFeatures,
  applications = [],
  essai = null,
}: {
  entrepriseNom: string;
  essai?: StatutEssai | null;
  logoUrl?: string | null;
  authDisabled?: boolean;
  permissions?: string[] | null;
  plateformeAdmin?: boolean;
  boutiqueActive?: boolean;
  activeFeatures: FeatureKey[];
  applications?: DestinationApplication[];
}) {
  const pathname = usePathname();
  const essaiCompact = essai ? libelleCompactEssai(essai) : null;
  const essaiUrgent = essai?.etat === "expire" || (essai?.etat === "essai" && essai.joursRestants <= 7);
  const [ouvert, setOuvert] = useState(false);
  // Le repli (compact/masqué) est un comportement de bureau : en dessous de 768 px, le tiroir mobile
  // (`ouvert`, ci-dessus) reste seul maître de la visibilité, quelle que soit la préférence mémorisée.
  const [estBureau, setEstBureau] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    // Application différée (même précaution que les préférences lues au montage ailleurs dans GP V1,
    // ex. l'en-tête repliable) : un rendu client synchrone sur `mq.matches` diffèrerait du HTML serveur
    // (sans `window`) et déclencherait un avertissement d'hydratation.
    const t = window.setTimeout(() => setEstBureau(mq.matches), 0);
    const suivre = (e: MediaQueryListEvent) => setEstBureau(e.matches);
    mq.addEventListener("change", suivre);
    return () => { window.clearTimeout(t); mq.removeEventListener("change", suivre); };
  }, []);
  const [etatMenu, setEtatMenu] = useState<EtatMenu>("ouvert");
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const v = window.localStorage.getItem(CLE_ETAT_MENU);
        if (v === "ouvert" || v === "compact" || v === "masque") setEtatMenu(v);
      } catch { /* stockage indisponible */ }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  const changerEtatMenu = (suivant: EtatMenu) => {
    setEtatMenu(suivant);
    try { window.localStorage.setItem(CLE_ETAT_MENU, suivant); } catch { /* idem */ }
  };
  const masqueBureau = estBureau && etatMenu === "masque";
  const compactBureau = estBureau && etatMenu === "compact";
  const compteDepot = permissions?.includes("mode_compte_depot") === true;
  const navigationBrute = compteDepot
    ? NAVIGATION_APPLICATION.filter((item) => ["/stock", "/stock/borne", "/depot"].includes(item.href))
    : NAVIGATION_APPLICATION;
  const navigation = navigationBrute.filter((item) => {
    if (!boutiqueActive && item.href === "/boutique") return false;
    const feature = featureForPath(item.href);
    return (!feature || activeFeatures.includes(feature)) && item.actif && navigationAutorisee(item.permission, permissions);
  });

  /**
   * Un menu court n'a rien à replier.
   *
   * Les groupes sont fermés par défaut, ce qui a du sens pour un administrateur dont la
   * navigation compte une cinquantaine d'entrées. Pour un salarié de terrain, elle en compte
   * quatre — et « Pointage », son geste le plus fréquent, se retrouvait enfermé dans un
   * accordéon replié nommé « Équipe & temps ». Constaté en recette mobile : ouvrir le menu,
   * deviner le bon groupe, le déplier, puis toucher le lien — quatre gestes pour pointer une
   * arrivée, sur un téléphone tenu d'une main.
   *
   * Au-delà de ce seuil, on garde le repliement : c'est là qu'il rend service.
   */
  const menuCourt = navigation.length <= 8;
  const largeurBureau = etatMenu === "ouvert" ? "md:w-60" : etatMenu === "compact" ? "md:w-16" : "md:w-0 md:min-w-0 md:overflow-hidden md:border-r-0";

  return (
    <>
    {/* Menu masqué (bureau) : seul ce petit bouton fixe reste — le réaffiche en un clic. */}
    {masqueBureau && (
      <button
        type="button"
        onClick={() => changerEtatMenu("ouvert")}
        title="Afficher le menu"
        aria-label="Afficher le menu"
        data-testid="menu-reafficher"
        className="fixed left-4 top-4 z-[65] hidden min-h-11 min-w-11 items-center justify-center rounded-md border border-neutral-300 bg-white text-lg shadow-sm hover:bg-neutral-50 md:flex dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
      >
        ☰
      </button>
    )}
    <header className="fixed inset-x-0 top-0 z-[60] flex h-16 items-center justify-between border-b border-[#243447] bg-[#0d1b2a] px-4 text-white md:hidden">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0"><BrandWordmark className="text-sm text-white" /><div className="text-[9px] text-[#c9a24a]">{PRODUCT_NAME}</div><div className="truncate text-[11px] text-white/60">{entrepriseNom}</div></div>
      </div>
      <button type="button" onClick={() => setOuvert((valeur) => !valeur)} aria-label="Ouvrir le menu" aria-expanded={ouvert} aria-controls="navigation-mobile" className="relative z-[65] touch-manipulation rounded-md border border-white/30 px-4 py-2 text-sm font-semibold active:bg-white/20">☰ Menu</button>
    </header>
    {ouvert && <button type="button" aria-label="Fermer le menu" onClick={() => setOuvert(false)} className="fixed inset-0 z-[70] touch-manipulation bg-black/50 md:hidden" />}
    <aside
      id="navigation-mobile"
      inert={masqueBureau || undefined}
      // `aria-hidden` en plus d'`inert` : `inert` retire déjà le clavier et le survol, mais son retrait de
      // l'arbre d'accessibilité n'est pas garanti par tous les moteurs de lecture de rôles (constaté avec
      // Playwright, qui continuait de trouver les liens du menu masqué) — les deux ensemble couvrent à la
      // fois les vrais lecteurs d'écran et les tests.
      aria-hidden={masqueBureau || undefined}
      // `max-md:w-[...]` plutôt que `w-[...]` + `md:w-*` pour écraser : les deux ciblaient sinon la même
      // propriété `width` avec la même spécificité, et l'ordre de Tailwind entre une valeur arbitraire et
      // un utilitaire préfixé n'est pas garanti — constaté ici (le repli restait bloqué à 240 px).
      className={`fixed inset-y-0 left-0 z-[80] flex max-md:w-[min(19rem,86vw)] flex-none transform flex-col border-r border-[#243447] bg-[#0d1b2a] text-white shadow-2xl transition-[transform,width] duration-200 md:static md:z-auto md:translate-x-0 md:shadow-none ${largeurBureau} ${ouvert?"translate-x-0":"-translate-x-full"}`}
    >
      <div className={`border-b border-white/10 ${compactBureau ? "p-2" : "p-4"}`}>
        <div className="flex items-center gap-3">
          {!compactBureau && (
            <div className="min-w-0">
              <BrandWordmark className="text-sm text-white" />
              <div className="text-[9px] text-[#c9a24a]">{PRODUCT_NAME}</div>
            </div>
          )}
          {compactBureau && (
            <div className="mx-auto text-lg font-bold text-[#c9a24a]" title={`${PRODUCT_NAME} — ${entrepriseNom}`} aria-hidden="true">E</div>
          )}
          <button type="button" onClick={() => setOuvert(false)} className="ml-auto rounded px-2 py-1 text-2xl text-white/70 md:hidden" aria-label="Fermer le menu">×</button>
          {/* Repli/déploiement (bureau, GP V1 — « barre repliable » étendue au menu gauche, 2026-09-14) :
              ‹ réduit en icônes, « masque complètement (réaffiché par le petit bouton fixe ci-dessus). */}
          {estBureau && !compactBureau && (
            <div className="ml-auto hidden gap-1 md:flex">
              <button type="button" onClick={() => changerEtatMenu("compact")} title="Réduire le menu en icônes" aria-label="Réduire le menu en icônes" data-testid="menu-reduire" className="flex min-h-8 min-w-8 items-center justify-center rounded-md border border-white/20 text-sm text-white/70 hover:bg-white/10 hover:text-white">‹</button>
              <button type="button" onClick={() => changerEtatMenu("masque")} title="Masquer le menu" aria-label="Masquer le menu" data-testid="menu-masquer" className="flex min-h-8 min-w-8 items-center justify-center rounded-md border border-white/20 text-sm text-white/70 hover:bg-white/10 hover:text-white">«</button>
            </div>
          )}
        </div>
        {compactBureau && (
          <button type="button" onClick={() => changerEtatMenu("ouvert")} title="Développer le menu" aria-label="Développer le menu" data-testid="menu-developper" className="mx-auto mt-2 hidden min-h-8 min-w-8 items-center justify-center rounded-md border border-white/20 text-sm text-white/70 hover:bg-white/10 hover:text-white md:flex">›</button>
        )}
        {!compactBureau && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-white/5 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL Supabase variable, miniature de contexte */}
            {logoUrl&&<img src={logoUrl} alt={`Logo de ${entrepriseNom}`} className="h-7 w-9 rounded bg-white object-contain p-0.5"/>}
            <div className="min-w-0"><div className="text-[9px] uppercase tracking-wider text-white/40">Entreprise active</div><div className="truncate text-xs text-white/75">{entrepriseNom}</div>{essaiCompact&&<div data-testid="essai-sidebar" className={`mt-0.5 text-[11px] ${essaiUrgent?"font-semibold text-[#f0b46a]":"text-white/60"}`}>{essaiCompact}</div>}</div>
          </div>
        )}
        {!compactBureau && <ApplicationSwitcherGestionPro applications={applications} />}
      </div>

      <nav className="flex-1 overflow-y-auto p-2" aria-label="Navigation principale">
        {compactBureau ? (
          // Mode compact : liste plate d'icônes-badges (pas de jeu d'icônes réel dans ce dépôt), sans
          // les groupes en accordéon — trop étroit pour un intitulé de groupe. Le libellé complet reste
          // accessible via le tooltip et `aria-label` de chaque lien.
          <ul className="space-y-1">
            {navigation.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOuvert(false)}
                    title={item.label}
                    aria-label={item.label}
                    className={`flex min-h-11 items-center justify-center rounded-md text-xs font-semibold ${active ? "bg-[#c9a24a] text-[#0d1b2a]" : "text-white/75 hover:bg-white/10 hover:text-white"}`}
                  >
                    {badgeCompact(item.label)}
                  </Link>
                </li>
              );
            })}
            {plateformeAdmin && !compteDepot && (
              <li>
                <Link href="/plateforme" onClick={() => setOuvert(false)} title="Plateforme" aria-label="Plateforme" className={`flex min-h-11 items-center justify-center rounded-md text-xs font-semibold ${pathname === "/plateforme" || pathname.startsWith("/plateforme/") ? "bg-[#c9a24a] text-[#0d1b2a]" : "text-[#c9a24a] hover:bg-white/10"}`}>★</Link>
              </li>
            )}
          </ul>
        ) : (
          <>
            {NAVIGATION_GROUPES.map((groupe) => {
              const items = navigation.filter((item) => item.groupe === groupe.cle);
              if (!items.length) return null;
              const groupeActif = items.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
              return <details key={groupe.cle} className="group mb-1" open={groupe.cle === "principal" || groupeActif || menuCourt}>
                <summary className={`flex cursor-pointer list-none items-center justify-between rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] ${groupeActif?"text-[#e5c978]":"text-white/45 hover:bg-white/5 hover:text-white/70"}`}>
                  <span>{groupe.label}</span><span className="text-sm transition group-open:rotate-90">›</span>
                </summary>
                <div className="ml-2 border-l border-white/10 pl-1">
                  {items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(item.href + "/");
                    return <Link key={item.href} href={item.href} onClick={() => setOuvert(false)} className={`block rounded-md px-3 py-2 text-sm ${active?"bg-[#c9a24a] font-medium text-[#0d1b2a]":"text-white/80 hover:bg-white/10 hover:text-white"}`}>{item.label}</Link>;
                  })}
                </div>
              </details>;
            })}

            {plateformeAdmin && !compteDepot && (
              <>
                <div className="my-2 border-t border-white/10" />
                <Link
                  href="/plateforme"
                  onClick={() => setOuvert(false)}
                  className={`block rounded-md px-3 py-2 text-sm ${
                    pathname === "/plateforme" || pathname.startsWith("/plateforme/")
                      ? "bg-[#c9a24a] font-medium text-[#0d1b2a]"
                      : "text-[#c9a24a] hover:bg-white/10"
                  }`}
                >
                  ★ Plateforme
                </Link>
              </>
            )}
          </>
        )}
      </nav>

      {!compactBureau && compteDepot&&<div className="border-t border-white/10 px-4 py-3 text-xs text-white/65"><strong className="block text-[#c9a24a]">Compte dépôt prioritaire</strong>Les salariés s’identifient dans la borne pour chaque mouvement.</div>}
      {!compactBureau && !compteDepot&&<div className="border-t border-white/10 p-2">
        <Link
          href="/aide"
          onClick={() => setOuvert(false)}
          className="flex items-center justify-between rounded-md border border-[#c9a24a]/50 px-3 py-2 text-sm font-medium text-[#e5c978] hover:bg-white/10"
        >
          <span>Guide d&apos;utilisation</span>
          <span className="rounded bg-[#c9a24a] px-1.5 py-0.5 text-[9px] font-bold text-[#0d1b2a]">PDF</span>
        </Link>
      </div>}
      {compactBureau && (
        <Link href="/aide" onClick={() => setOuvert(false)} title="Guide d'utilisation" aria-label="Guide d'utilisation" className="flex min-h-11 items-center justify-center border-t border-white/10 text-sm font-medium text-[#e5c978] hover:bg-white/10">?</Link>
      )}
      {!compactBureau && <PwaInstallButton />}
      {!authDisabled && (
        <div className={`border-t border-white/10 ${compactBureau ? "p-1" : "p-2"}`} title={compactBureau ? (compteDepot?"Déconnecter le compte dépôt":"Se déconnecter") : undefined}>
          <BoutonDeconnexion libelle={compteDepot?"Déconnecter le compte dépôt":"Se déconnecter"} />
        </div>
      )}
    </aside>
    </>
  );
}
