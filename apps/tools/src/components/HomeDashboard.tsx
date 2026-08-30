"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import { activeTools, type ToolDefinition, type ToolId } from "@/lib/catalog";
import { categories, getCategory, type CategoryId } from "@/lib/categories";
import { revealFilteredTools, toggleCategoryFilter } from "@/lib/home-navigation";
import { createPersistentStorage, migratePersistentStorage, readPersistentIds, STORAGE_KEYS } from "@/lib/storage";
import { ToolIcon } from "./ToolIcon";
import { ProFeaturePreview } from "./ProFeaturePreview";

const visibleCategories = categories.filter((category) => activeTools.some((tool) => tool.categoryId === category.id)).sort((a, b) => a.order - b.order);

export function HomeDashboard() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryId | null>(null);
  const [favorites, setFavorites] = useState<ToolId[]>([]);
  const [recent, setRecent] = useState<ToolId[]>([]);
  const filteredToolsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    const storage = createPersistentStorage(localStorage);
    void migratePersistentStorage(storage, localStorage).then(async () => {
      const [storedFavorites, storedRecent] = await Promise.all([readPersistentIds<ToolId>(storage, STORAGE_KEYS.favorites), readPersistentIds<ToolId>(storage, STORAGE_KEYS.recent)]);
      if (active) { setFavorites(storedFavorites); setRecent(storedRecent); }
    });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.toLocaleLowerCase("fr").trim();
    return activeTools.filter((tool) => (!activeCategory || tool.categoryId === activeCategory) && (!needle || [tool.name, tool.description, ...tool.keywords].join(" ").toLocaleLowerCase("fr").includes(needle)));
  }, [query, activeCategory]);

  useEffect(() => {
    if (!activeCategory && !query.trim()) return;
    const frame = window.requestAnimationFrame(() => revealFilteredTools(filteredToolsRef.current));
    return () => window.cancelAnimationFrame(frame);
  }, [activeCategory, query]);

  function toggleFavorite(id: ToolId) {
    setFavorites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      void createPersistentStorage(localStorage).setItem(STORAGE_KEYS.favorites, JSON.stringify(next));
      return next;
    });
  }

  const favoriteTools = favorites.map((id) => activeTools.find((tool) => tool.id === id)).filter((tool): tool is ToolDefinition => tool !== undefined);
  const recentTools = recent.map((id) => activeTools.find((tool) => tool.id === id)).filter((tool): tool is ToolDefinition => tool !== undefined);

  return (
    <main>
      <section className="hero shell">
        <div className="topline"><Brand /><div className="home-actions"><Link href="/projets">Mes projets</Link><span className="free-pill">Free · sans compte</span></div></div>
        <div className="hero-copy">
          <p className="eyebrow">LA BOÎTE À OUTILS NUMÉRIQUE DU CHANTIER</p>
          <h1>Que voulez-vous<br /><em>faire aujourd’hui&nbsp;?</em></h1>
          <p>Des calculs fiables et des tracés clairs, sans formule à connaître.</p>
        </div>
        <label className="searchbox">
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un calcul ou un tracé" aria-label="Rechercher un outil" />
          <kbd>⌘ K</kbd>
        </label>
      </section>

      <section className="shell content-section">
        <div className="section-title"><div><p className="eyebrow">ACCÈS RAPIDE</p><h2>Choisissez votre besoin</h2></div><button className="text-button" onClick={() => { setActiveCategory(null); setQuery(""); }}>Tout voir <span>→</span></button></div>
        <div className="category-grid">
          {visibleCategories.map((category) => <button key={category.id} className={`category-card ${activeCategory === category.id ? "active" : ""}`} aria-pressed={activeCategory === category.id} onClick={() => setActiveCategory(toggleCategoryFilter(activeCategory, category.id))}><span className="category-glyph">{category.icon}</span><span>{category.name}</span><small>Explorer <b>→</b></small></button>)}
        </div>
      </section>

      {(query || activeCategory) && <ToolSection id="filtered-tools" sectionRef={filteredToolsRef} title={`${filtered.length} outil${filtered.length > 1 ? "s" : ""} trouvé${filtered.length > 1 ? "s" : ""}`} toolsToShow={filtered} favorites={favorites} toggleFavorite={toggleFavorite} />}
      {!query && !activeCategory && <>
        {favoriteTools.length > 0 && <ToolSection eyebrow="VOS RACCOURCIS" title="Favoris" toolsToShow={favoriteTools} favorites={favorites} toggleFavorite={toggleFavorite} />}
        {recentTools.length > 0 && <ToolSection eyebrow="REPRENDRE" title="Utilisés récemment" toolsToShow={recentTools} favorites={favorites} toggleFavorite={toggleFavorite} />}
        <ToolSection eyebrow="LES INCONTOURNABLES" title="Outils populaires" toolsToShow={activeTools.filter((tool) => tool.popular)} favorites={favorites} toggleFavorite={toggleFavorite} />
      </>}

      <section id="tools-pro" className="shell content-section pro-preview-section"><div className="section-title"><div><p className="eyebrow">BIENTÔT AVEC TOOLS PRO</p><h2>Allez plus loin sur vos ouvrages</h2></div><span className="pro-section-note">Les outils essentiels restent gratuits</span></div><div className="pro-preview-grid">
        <ProFeaturePreview name="Plans cotés avancés" description="Composez plusieurs formes et retrouvez toutes les cotes de construction." capability="dimensioned-plan" preview="Aperçu sans engagement" />
        <ProFeaturePreview name="Exports PDF & SVG" description="Emportez vos plans à l’atelier ou partagez-les avec votre équipe." capability="export-pdf" preview="Prévu dans une prochaine version" />
        <ProFeaturePreview name="Projets locaux" description="Retrouvez vos tracés et mesures hors ligne sur cet appareil." capability="saved-projects" preview="Sans compte ni cloud" />
      </div></section>

      <section className="shell guided-card">
        <div className="guided-icon">✦</div><div><p className="eyebrow">ASSISTANT GUIDÉ</p><h2>Je veux faire…</h2><p>Décrivez votre besoin avec vos mots. On vous guide vers le bon outil.</p></div>
        <div className="guided-links">{["Mettre ma cloison d’équerre", "Répartir mes spots", "Tracer une arche", "Calculer une pente"].map((label) => <button key={label} onClick={() => setQuery(label)}>{label}<span>→</span></button>)}</div>
      </section>
      <Footer />
    </main>
  );
}

function ToolSection({ eyebrow, id, sectionRef, title, toolsToShow, favorites, toggleFavorite }: { eyebrow?: string; id?: string; sectionRef?: Ref<HTMLElement>; title: string; toolsToShow: readonly ToolDefinition[]; favorites: ToolId[]; toggleFavorite: (id: ToolId) => void }) {
  return <section className="shell content-section" id={id} ref={sectionRef}><div className="section-title"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div></div><div className="tool-grid">{toolsToShow.map((tool) => <article className={`tool-card ${tool.access === "pro" ? "pro-tool-card" : ""}`} key={tool.id}><Link href={`/outils/${tool.slug}`} className="tool-card-main"><span className="tool-icon"><ToolIcon id={tool.id} /></span><span><small>{getCategory(tool.categoryId).name}{tool.access === "pro" ? " · PRO" : ""}</small><strong>{tool.name}</strong><p>{tool.description}</p></span></Link><button className={`favorite ${favorites.includes(tool.id) ? "selected" : ""}`} onClick={() => toggleFavorite(tool.id)} aria-label={favorites.includes(tool.id) ? `Retirer ${tool.name} des favoris` : `Ajouter ${tool.name} aux favoris`}>☆</button><Link href={`/outils/${tool.slug}`} className="open-tool" aria-label={`Ouvrir ${tool.name}`}>→</Link></article>)}</div></section>;
}

export function Brand() { return <Link className="brand" href="/"><span className="brand-mark">E</span><span><b>ELSATIA</b><small>TOOLS</small></span></Link>; }
function Footer() { return <footer><div className="shell footer-inner"><Brand /><p>Des outils précis. Des gestes plus sûrs.<br />Pensé pour le chantier, fait pour tous.</p><span className="offline-badge"><i /> Disponible hors connexion</span></div><div className="footer-bottom shell"><span>© 2026 ELSATIA</span><span>Outils essentiels gratuits · Sans compte</span></div></footer>; }
