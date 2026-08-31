"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "./AccountProvider";
import { TOOLS_PRODUCTS, type StoreProduct, type ToolsProductSku } from "@/lib/monetization";
import { loadStoreProducts, monetizationConfigured } from "@/lib/monetization-client";
import { getRuntimePlatform } from "@/lib/platform";
import { EXTERNAL_URLS } from "@/lib/site";

const SOURCE_LABELS = { web: "Web · Stripe", apple: "Apple App Store", google: "Google Play", elsatia: "ELSATIA", internal: "Interne", "free-default": "Free" } as const;

export function MonetizationPanel() {
  const account = useAccount();
  const platform = getRuntimePlatform();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [busy, setBusy] = useState<ToolsProductSku | "restore" | "manage" | null>(null);
  const [feedback, setFeedback] = useState("");
  useEffect(() => { if (account.user && monetizationConfigured()) void loadStoreProducts().then(setProducts).catch(() => setProducts([])); }, [account.user, platform]);
  const offers = useMemo(() => Object.values(TOOLS_PRODUCTS).map((definition) => {
    const productId = platform === "ios" ? definition.appleProductId : platform === "android" ? definition.googleProductId : definition.stripePriceEnv;
    return { definition, store: products.find((product) => product.productId === productId) };
  }), [platform, products]);

  async function run(key: typeof busy, action: () => Promise<void>) {
    setBusy(key); setFeedback(""); try { await action(); setFeedback("Droits Tools Pro actualisés."); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Opération impossible."); } finally { setBusy(null); }
  }

  if (!account.user) return <section className="shell monetization-panel"><p className="eyebrow">TOOLS PRO</p><h2>Un seul abonnement, vos trois plateformes</h2><p>Tools Free reste disponible sans compte. Connectez un compte ELSATIA uniquement si vous souhaitez acheter ou restaurer Tools Pro.</p></section>;
  if (account.access.tier === "pro") return <section className="shell monetization-panel pro-active"><p className="eyebrow">TOOLS PRO ACTIF</p><h2>Votre compte possède déjà Tools Pro</h2><div className="active-sources">{account.activeSources.map((source) => <span key={`${source.source}-${source.expires_at}`}>{SOURCE_LABELS[source.source]}{source.expires_at ? ` · jusqu’au ${new Date(source.expires_at).toLocaleDateString("fr-FR")}` : ""}</span>)}</div><div className="account-actions">{account.activeSources.filter((source): source is typeof source & { source: "web" | "apple" | "google" } => ["web", "apple", "google"].includes(source.source)).map((source) => <button key={source.source} disabled={busy !== null} onClick={() => void run("manage", () => account.manageSubscription(source.source))}>Gérer via {SOURCE_LABELS[source.source]}</button>)}<button className="secondary" disabled={busy !== null} onClick={() => void run("restore", account.refresh)}>Actualiser mes droits</button></div>{feedback && <p className="monetization-feedback">{feedback}</p>}<p className="double-source-note">Si plusieurs sources sont actives, elles restent indépendantes. Annulez chaque abonnement depuis son fournisseur pour éviter un double paiement.</p></section>;

  return <section className="shell monetization-panel"><p className="eyebrow">TOOLS FREE / TOOLS PRO</p><h2>Passez à Pro quand votre chantier l’exige</h2><p>Le compte ELSATIA est requis pour relier l’achat à Web, iOS et Android. Aucun paiement n’est traité directement par ELSATIA Tools.</p><div className="pricing-grid">
    {offers.map(({ definition, store }) => { const available = Boolean(store?.available); return <article key={definition.sku}><small>{definition.period === "monthly" ? "MENSUEL" : "ANNUEL"}</small><h3>Tools Pro</h3><strong>{store?.displayPrice ?? "Tarif non configuré"}</strong><span>/{definition.period === "monthly" ? "mois" : "an"}</span><ul><li>Projets synchronisés</li><li>Tracés avancés</li><li>PDF, SVG et partage natif</li></ul><button disabled={!available || busy !== null} onClick={() => void run(definition.sku, () => account.startPurchase(definition.sku))}>{busy === definition.sku ? "Ouverture…" : available ? "Choisir cette offre" : "Produit indisponible"}</button></article>; })}
  </div>{platform !== "web" && <button className="restore-purchases" disabled={busy !== null} onClick={() => void run("restore", account.restorePurchases)}>{busy === "restore" ? "Vérification…" : platform === "ios" ? "Restaurer mes achats" : "Vérifier mes achats"}</button>}{feedback && <p className="monetization-feedback">{feedback}</p>}<p className="legal-links"><a href={EXTERNAL_URLS.terms}>Conditions d’utilisation</a><a href={EXTERNAL_URLS.privacy}>Confidentialité</a><a href={EXTERNAL_URLS.support}>Support</a></p></section>;
}
