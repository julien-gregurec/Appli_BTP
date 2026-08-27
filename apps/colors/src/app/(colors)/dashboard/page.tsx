import type { Metadata } from "next";
import Link from "next/link";
import { NavIcon } from "@/components/NavIcon";
import { getContexteColors } from "@/lib/contexte";

export const metadata: Metadata = { title: "Tableau de bord" };

export default async function DashboardPage() {
  const contexte = await getContexteColors();
  const prenom = contexte.prenom?.trim() || "à vous";
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">Tableau de bord</span>
          <h1>Bonjour {prenom}.</h1>
          <p>L’enveloppe ELSATIA Colors est prête. Les données métier seront connectées lors du prochain jalon.</p>
        </div>
        <Link className="outline-button" href="/inventaire">Voir la structure d’inventaire</Link>
      </header>

      <div className="status-banner">
        <span className="signal" aria-hidden="true"/>
        <div><strong>Accès Colors vérifié côté serveur</strong><span>{contexte.estAdminPlateforme ? "Accès administrateur plateforme global actif." : "Organisation et habilitation individuelle actives pour cette session."}</span></div>
        <small>{contexte.estAdminPlateforme ? "Administration ELSATIA" : "Socle opérationnel"}</small>
      </div>

      <section className="metric-grid" aria-label="Fonctions préparées">
        <article className="metric-card coral"><span><NavIcon name="inventory"/></span><span className="state">À connecter</span><h2>Inventaire</h2><p>Structure prête pour les futurs seaux individualisés.</p></article>
        <article className="metric-card yellow"><span><NavIcon name="palette"/></span><span className="state">À connecter</span><h2>Nuanciers</h2><p>Aucun catalogue ni référence n’est encore importé.</p></article>
        <article className="metric-card mint"><span><NavIcon name="location"/></span><span className="state">À connecter</span><h2>Dépôts</h2><p>Navigation préparée pour les emplacements Colors.</p></article>
        <article className="metric-card purple"><span><NavIcon name="camera"/></span><span className="state">Interface seule</span><h2>Ajout par photo</h2><p>Le port visuel existe, sans OCR réel ni simulation.</p></article>
      </section>

      <section className="workspace-grid">
        <article className="panel">
          <div className="panel-head"><div><h2>Prochaines fondations métier</h2><p>Ordre recommandé après validation du shell</p></div><span>Feuille de route</span></div>
          <div className="roadmap-list">
            <div className="roadmap-item"><span><NavIcon name="location"/></span><div><strong>Dépôts et emplacements</strong><small>Structure multi-organisation dédiée à Colors</small></div><small>Jalon suivant</small></div>
            <div className="roadmap-item"><span><NavIcon name="inventory"/></span><div><strong>Seaux individualisés</strong><small>Quantité, état et identification propres</small></div><small>Jalon suivant</small></div>
            <div className="roadmap-item"><span><NavIcon name="movement"/></span><div><strong>Mouvements de stock</strong><small>Entrées, sorties et transferts auditables</small></div><small>Jalon suivant</small></div>
          </div>
        </article>
        <article className="panel">
          <div className="panel-head"><div><h2>Identité Colors</h2><p>Une expérience sœur, clairement autonome</p></div></div>
          <div className="swatches" aria-label="Palette ELSATIA Colors"><span/><span/><span/><span/></div>
          <p className="color-note">Les couleurs affichées à l’écran sont indicatives. Elles ne remplacent jamais une référence fabricant ou un échantillon physique.</p>
        </article>
      </section>
    </>
  );
}
