"use client";

import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleAlert,
  Columns3,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Heart,
  History,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Moon,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Volume2,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { analyzeAmbigram } from "@/lib/ambigram";
import { candidatesToCsv } from "@/lib/csv";
import {
  DEFAULT_AMBIGRAM_MAPPINGS,
  DEFAULT_BRIEF,
  DEFAULT_WEIGHTS,
  STYLE_LABELS,
} from "@/lib/defaults";
import { generateCandidates } from "@/lib/generator";
import type {
  AmbigramMapping,
  Candidate,
  CompanyCheck,
  DomainCheck,
  NameStyle,
  NamingBrief,
  ScoreWeights,
} from "@/lib/types";

type View =
  | "studio"
  | "alphabet"
  | "compare"
  | "favorites"
  | "rejected"
  | "history"
  | "settings";
type VerificationState = {
  domains?: DomainCheck[];
  company?: CompanyCheck;
  loading?: boolean;
  error?: string;
  warning?: string;
};
type VerificationHistoryEntry = {
  id: string;
  candidate: string;
  checkedAt: string;
  registeredDomains: number;
  availableDomains: number;
  unverifiedDomains: number;
  crowdingScore: number | null;
  domainProvider: string;
  companyProvider: string | null;
};

const TLD_LIST = ["fr", "com", "app", "io", "ai", "dev"];
const STORAGE_KEY = "nomena-mvp-state-v1";
const VIEW_LABELS: Record<View, string> = {
  studio: "Marque mère SaaS",
  alphabet: "Alphabet ambigramme",
  compare: "Comparateur",
  favorites: "Favoris",
  rejected: "Rejets",
  history: "Vérifications",
  settings: "Sources & clés API",
};

function ScoreRing({ score }: { score: number }) {
  return (
    <div
      className="score-ring"
      style={{ "--score-angle": `${score * 3.6}deg` } as React.CSSProperties}
      aria-label={`Score ${score} sur 100`}
    >
      <div>
        <strong>{score}</strong>
        <span>/100</span>
      </div>
    </div>
  );
}

function StatusPill({ check }: { check: DomainCheck }) {
  const labels: Record<DomainCheck["status"], string> = {
    available: "Disponible*",
    registered: "Enregistré",
    premium: "Premium",
    unavailable: "Non enregistrable",
    manual: "À confirmer",
    unverified: "Non vérifié",
  };
  return (
    <span className={`status-pill status-${check.status}`} title={check.detail}>
      <span className="status-dot" />
      {labels[check.status]}
    </span>
  );
}

function Sidebar({
  view,
  setView,
  compareCount,
  favoriteCount,
  rejectedCount,
  historyCount,
  mobileOpen,
  closeMobile,
}: {
  view: View;
  setView: (view: View) => void;
  compareCount: number;
  favoriteCount: number;
  rejectedCount: number;
  historyCount: number;
  mobileOpen: boolean;
  closeMobile: () => void;
}) {
  const items: Array<{ id: View; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: "studio", label: "Studio de naming", icon: <WandSparkles size={18} /> },
    { id: "compare", label: "Comparateur", icon: <Columns3 size={18} />, badge: compareCount },
    { id: "alphabet", label: "Alphabet ambigramme", icon: <Eye size={18} /> },
    { id: "favorites", label: "Favoris", icon: <Heart size={18} />, badge: favoriteCount },
    { id: "rejected", label: "Rejets", icon: <Trash2 size={18} />, badge: rejectedCount },
    { id: "history", label: "Vérifications", icon: <History size={18} />, badge: historyCount },
    { id: "settings", label: "Sources & clés API", icon: <KeyRound size={18} /> },
  ];
  return (
    <>
      {mobileOpen && <button className="sidebar-backdrop" onClick={closeMobile} aria-label="Fermer" />}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">N</div>
          <div>
            <strong>Nomena</strong>
            <span>Brand intelligence</span>
          </div>
          <button className="mobile-close" onClick={closeMobile} aria-label="Fermer le menu">
            <X size={18} />
          </button>
        </div>
        <nav>
          <p className="nav-label">Espace de travail</p>
          <button className="nav-static">
            <LayoutDashboard size={18} />
            Tableau de bord
          </button>
          {items.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() => {
                setView(item.id);
                closeMobile();
              }}
            >
              {item.icon}
              <span>{item.label}</span>
              {Boolean(item.badge) && <em>{item.badge}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-project">
          <p>Projet actuel</p>
          <strong>Marque mère SaaS</strong>
          <span>Brief MVP · session locale</span>
          <div><span style={{ width: "68%" }} /></div>
        </div>
        <div className="legal-mini">
          <ShieldCheck size={18} />
          <p><strong>Premier filtrage</strong><br />Une recherche professionnelle reste nécessaire.</p>
        </div>
      </aside>
    </>
  );
}

export function NamingStudio() {
  const [view, setView] = useState<View>("studio");
  const [brief, setBrief] = useState<NamingBrief>(DEFAULT_BRIEF);
  const [mappings, setMappings] = useState<AmbigramMapping[]>(DEFAULT_AMBIGRAM_MAPPINGS);
  const [weights, setWeights] = useState<ScoreWeights>(DEFAULT_WEIGHTS);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [compare, setCompare] = useState<string[]>([]);
  const [verification, setVerification] = useState<Record<string, VerificationState>>({});
  const [verificationHistory, setVerificationHistory] = useState<VerificationHistoryEntry[]>([]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generatedCount, setGeneratedCount] = useState(0);
  const [query, setQuery] = useState("");
  const [showBrief, setShowBrief] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dark, setDark] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [ambigramWord, setAmbigramWord] = useState("SAVAS");
  const [ambigramExample, setAmbigramExample] = useState<Candidate | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as {
          brief?: NamingBrief;
          mappings?: AmbigramMapping[];
          weights?: ScoreWeights;
          favorites?: string[];
          rejected?: string[];
          compare?: string[];
          verificationHistory?: VerificationHistoryEntry[];
          dark?: boolean;
        };
        if (parsed.brief) setBrief(parsed.brief);
        if (parsed.mappings) setMappings(parsed.mappings);
        if (parsed.weights) setWeights(parsed.weights);
        setFavorites(parsed.favorites ?? []);
        setRejected(parsed.rejected ?? []);
        setCompare(parsed.compare ?? []);
        setVerificationHistory(parsed.verificationHistory ?? []);
        setDark(Boolean(parsed.dark));
      }
    } catch {
      // Invalid local state is ignored deliberately.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    if (!hydrated) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        brief,
        mappings,
        weights,
        favorites,
        rejected,
        compare,
        verificationHistory,
        dark,
      }),
    );
  }, [brief, mappings, weights, favorites, rejected, compare, verificationHistory, dark, hydrated]);

  const displayed = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return candidates.filter((candidate) => {
      if (rejected.includes(candidate.name)) return false;
      if (candidate.score.total < brief.threshold) return false;
      if (normalizedQuery && !candidate.name.toLowerCase().includes(normalizedQuery)) return false;
      return true;
    }).slice(0, 50);
  }, [candidates, rejected, brief.threshold, query]);

  const favoriteCandidates = candidates.filter((candidate) => favorites.includes(candidate.name));
  const comparedCandidates = compare
    .map((name) => candidates.find((candidate) => candidate.name === name))
    .filter((candidate): candidate is Candidate => Boolean(candidate));
  const ambigramAnalysis = analyzeAmbigram(ambigramWord, mappings);

  async function generate() {
    setGenerating(true);
    setProgress(8);
    setVerification({});
    const timer = window.setInterval(() => {
      setProgress((current) => Math.min(88, current + Math.ceil(Math.random() * 12)));
    }, 120);
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    const generated = generateCandidates(brief, {
      rejected,
      mappings,
      weights,
      seed: `${Date.now()}-${brief.styles.join("-")}`,
    });
    window.clearInterval(timer);
    setCandidates(generated);
    setGeneratedCount(generated.length);
    setProgress(100);
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    setGenerating(false);
    setShowBrief(false);
  }

  function toggleFavorite(name: string) {
    setFavorites((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    );
  }

  function rejectCandidate(name: string) {
    setRejected((current) => (current.includes(name) ? current : [...current, name]));
    setFavorites((current) => current.filter((item) => item !== name));
    setCompare((current) => current.filter((item) => item !== name));
  }

  function restoreCandidate(name: string) {
    setRejected((current) => current.filter((item) => item !== name));
  }

  function toggleCompare(name: string) {
    setCompare((current) => {
      if (current.includes(name)) return current.filter((item) => item !== name);
      if (current.length >= 5) return current;
      return [...current, name];
    });
  }

  function generateVariants(candidate: Candidate) {
    const variants = generateCandidates(
      {
        ...brief,
        count: 180,
        minLength: Math.max(3, candidate.letters - 1),
        maxLength: Math.min(10, candidate.letters + 1),
        styles: [candidate.origin.style],
        threshold: Math.max(55, brief.threshold - 8),
      },
      {
        rejected,
        mappings,
        weights,
        seed: `variants-${candidate.name}-${Date.now()}`,
      },
    ).slice(0, 8);

    setCandidates((current) => {
      const known = new Set(current.map((item) => item.name.toLowerCase()));
      const additions = variants.filter((item) => !known.has(item.name.toLowerCase()));
      return [candidate, ...additions, ...current.filter((item) => item.id !== candidate.id)];
    });
    setQuery("");
    setView("studio");
  }

  async function verify(candidate: Candidate) {
    setVerification((current) => ({
      ...current,
      [candidate.name]: { ...current[candidate.name], loading: true, error: undefined },
    }));
    const domains = TLD_LIST.map((tld) => `${candidate.name.toLowerCase()}.${tld}`);
    try {
      const [domainResponse, companyResponse] = await Promise.all([
        fetch("/api/domain-check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ domains }),
        }),
        fetch("/api/company-search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: candidate.name }),
        }),
      ]);
      const domainPayload = await domainResponse.json() as {
        checks?: DomainCheck[];
        warning?: string;
        error?: string;
      };
      const companyPayload = await companyResponse.json() as CompanyCheck & { error?: string };
      const domainChecks = domainPayload.checks ?? [];
      if (domainChecks.length > 0 || companyResponse.ok) {
        const checkedAt =
          domainChecks[0]?.checkedAt ??
          (companyResponse.ok ? companyPayload.checkedAt : new Date().toISOString());
        setVerificationHistory((current) => [
          {
            id: `${candidate.id}-${checkedAt}`,
            candidate: candidate.name,
            checkedAt,
            registeredDomains: domainChecks.filter((item) =>
              item.status === "registered" || item.status === "unavailable"
            ).length,
            availableDomains: domainChecks.filter((item) => item.status === "available").length,
            unverifiedDomains: domainChecks.filter((item) =>
              item.status === "manual" || item.status === "unverified"
            ).length,
            crowdingScore: companyResponse.ok ? companyPayload.crowdingScore : null,
            domainProvider: domainChecks[0]?.provider ?? "Non disponible",
            companyProvider: companyResponse.ok ? companyPayload.provider : null,
          },
          ...current,
        ].slice(0, 100));
      }
      setVerification((current) => ({
        ...current,
        [candidate.name]: {
          domains: domainPayload.checks ?? [],
          company: companyResponse.ok ? companyPayload : undefined,
          warning: domainPayload.warning,
          error:
            !domainResponse.ok || !companyResponse.ok
              ? [domainPayload.error, companyPayload.error].filter(Boolean).join(" ")
              : undefined,
          loading: false,
        },
      }));
    } catch {
      setVerification((current) => ({
        ...current,
        [candidate.name]: {
          ...current[candidate.name],
          loading: false,
          error: "Les sources externes ne sont pas joignables. Aucun résultat n’a été inventé.",
        },
      }));
    }
  }

  function speak(name: string, language: "fr-FR" | "en-US") {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(name);
    utterance.lang = language;
    utterance.rate = 0.82;
    window.speechSynthesis.speak(utterance);
  }

  function exportCsv(list = displayed) {
    const blob = new Blob([candidatesToCsv(list)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nomena-shortlist-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function renderCandidate(candidate: Candidate) {
    const check = verification[candidate.name];
    const fr = check?.domains?.find((item) => item.domain.endsWith(".fr"));
    const com = check?.domains?.find((item) => item.domain.endsWith(".com"));
    const legalRisk =
      check?.company && check.company.crowdingScore >= 7
        ? "Risque apparent élevé"
        : check?.company
          ? "Vérification approfondie recommandée"
          : "Résultat non vérifié";
    return (
      <article className="candidate-card" key={candidate.id}>
        <div className="candidate-main">
          <div className="candidate-title">
            <div>
              <div className="eyebrow-row">
                <span className="rank">#{displayed.indexOf(candidate) + 1 || "—"}</span>
                <span>{STYLE_LABELS[candidate.origin.style]}</span>
                <span className="confidence">{candidate.score.confidence}</span>
              </div>
              <h3>{candidate.name}</h3>
              <p className="pronunciation">/{candidate.pronunciation}/ · {candidate.letters} lettres · {candidate.syllableCount} syllabes</p>
            </div>
            <ScoreRing score={candidate.score.total} />
          </div>
          <p className="origin">{candidate.origin.explanation}</p>
          <div className="product-tests">
            {["Gestion Pro", "Colors", "Planning", "RH"].map((suffix) => (
              <span key={suffix}>{candidate.name} {suffix}</span>
            ))}
            <span>Groupe {candidate.name}</span>
          </div>
          <div className="metric-row">
            <div><span>Phonétique</span><strong>{candidate.phoneticScore}</strong><i><b style={{ width: `${candidate.phoneticScore}%` }} /></i></div>
            <div><span>International</span><strong>{candidate.internationalScore}</strong><i><b style={{ width: `${candidate.internationalScore}%` }} /></i></div>
            <div><span>Graphique</span><strong>{candidate.score.graphic}</strong><i><b style={{ width: `${candidate.score.graphic}%` }} /></i></div>
          </div>
          <div className="ambigram-note">
            <Eye size={16} />
            <span>{candidate.ambigram.label}</span>
            {candidate.ambigram.palindrome && <em>Palindrome</em>}
            <button onClick={() => setAmbigramExample(candidate)}>Voir un exemple</button>
          </div>
        </div>
        <div className="candidate-checks">
          <div className="check-heading">
            <div>
              <span>Contrôles externes</span>
              <strong>{check?.domains?.[0]?.checkedAt ? new Date(check.domains[0].checkedAt).toLocaleString("fr-FR") : "Pas encore lancés"}</strong>
            </div>
            {check?.domains?.[0]?.sourceUrl && (
              <a href={check.domains[0].sourceUrl} target="_blank" rel="noreferrer" title="Voir la source">
                <ExternalLink size={15} />
              </a>
            )}
          </div>
          <div className="domain-grid">
            <div><span>.fr</span>{fr ? <StatusPill check={fr} /> : <small>Non vérifié</small>}</div>
            <div><span>.com</span>{com ? <StatusPill check={com} /> : <small>Non vérifié</small>}</div>
          </div>
          {check?.domains && (
            <div className="other-tlds">
              {check.domains.filter((item) => !item.domain.endsWith(".fr") && !item.domain.endsWith(".com")).map((item) => (
                <span key={item.domain}>.{item.domain.split(".").pop()} <StatusPill check={item} /></span>
              ))}
            </div>
          )}
          <div className="company-result">
            <span>Entreprises françaises</span>
            {check?.company ? (
              <>
                <strong>{check.company.matches.length} correspondance(s)</strong>
                <small>Encombrement {check.company.crowdingScore}/10 · {check.company.provider}</small>
              </>
            ) : <small>Source non interrogée</small>}
          </div>
          <div className={`risk risk-${check?.company?.crowdingScore && check.company.crowdingScore >= 7 ? "high" : "neutral"}`}>
            <CircleAlert size={15} />
            <span>{legalRisk}</span>
          </div>
          {check?.warning && <p className="warning-text">{check.warning}</p>}
          {check?.error && <p className="error-text">{check.error}</p>}
          <button className="verify-button" onClick={() => verify(candidate)} disabled={check?.loading}>
            {check?.loading ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={16} />}
            {check?.domains ? "Vérifier à nouveau" : "Vérifier maintenant"}
          </button>
        </div>
        <div className="candidate-actions">
          <button className={favorites.includes(candidate.name) ? "selected" : ""} onClick={() => toggleFavorite(candidate.name)}>
            <Heart size={17} fill={favorites.includes(candidate.name) ? "currentColor" : "none"} />
            {favorites.includes(candidate.name) ? "Favori" : "Ajouter aux favoris"}
          </button>
          <button className={compare.includes(candidate.name) ? "selected" : ""} onClick={() => toggleCompare(candidate.name)} disabled={!compare.includes(candidate.name) && compare.length >= 5}>
            <Columns3 size={17} /> {compare.includes(candidate.name) ? "Sélectionné" : "Comparer"}
          </button>
          <button onClick={() => generateVariants(candidate)}>
            <Sparkles size={17} /> Générer des variantes
          </button>
          <button onClick={() => speak(candidate.name, "fr-FR")}><Volume2 size={17} /> Écouter FR</button>
          <button onClick={() => rejectCandidate(candidate.name)} className="danger-action"><X size={17} /> Rejeter</button>
        </div>
      </article>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        view={view}
        setView={setView}
        compareCount={compare.length}
        favoriteCount={favorites.length}
        rejectedCount={rejected.length}
        historyCount={verificationHistory.length}
        mobileOpen={mobileOpen}
        closeMobile={() => setMobileOpen(false)}
      />
      <main className="main">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>Nomena</span><ArrowRight size={13} /><strong>{VIEW_LABELS[view]}</strong></div>
          <div className="top-actions">
            <button title="Historique" onClick={() => setView("history")}><History size={18} /></button>
            <button onClick={() => setDark((value) => !value)} title="Changer de thème">{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
            <div className="avatar">JG</div>
          </div>
        </header>

        {view === "studio" && (
          <>
            <section className="hero">
              <div>
                <span className="hero-kicker"><Sparkles size={15} /> Générateur raisonné</span>
                <h1>Trouvez un nom qui mérite<br />d’aller plus loin.</h1>
                <p>Générez largement, filtrez sans complaisance et vérifiez chaque signal à sa source.</p>
              </div>
              <div className="hero-stats">
                <div><span>Candidats produits</span><strong>{generatedCount || "—"}</strong></div>
                <div><span>Shortlist actuelle</span><strong>{displayed.length || "—"}</strong></div>
                <div><span>Seuil de qualité</span><strong>{brief.threshold}<small>/100</small></strong></div>
              </div>
            </section>

            <section className="brief-card">
              <button className="brief-heading" onClick={() => setShowBrief((value) => !value)}>
                <div className="step-number">01</div>
                <div><span>Brief de marque</span><strong>Marque mère pour un éditeur SaaS</strong></div>
                <ChevronDown className={showBrief ? "rotated" : ""} size={20} />
              </button>
              {showBrief && (
                <div className="brief-content">
                  <div className="field field-wide">
                    <label>Secteur et positionnement</label>
                    <input value={brief.sector} onChange={(event) => setBrief({ ...brief, sector: event.target.value })} />
                  </div>
                  <div className="field">
                    <label>Longueur souhaitée</label>
                    <div className="inline-inputs">
                      <input type="number" min={3} max={12} value={brief.minLength} onChange={(event) => setBrief({ ...brief, minLength: Number(event.target.value) })} />
                      <span>à</span>
                      <input type="number" min={3} max={12} value={brief.maxLength} onChange={(event) => setBrief({ ...brief, maxLength: Number(event.target.value) })} />
                      <span>lettres</span>
                    </div>
                  </div>
                  <div className="field">
                    <label>Seuil d’affichage : {brief.threshold}/100</label>
                    <input type="range" min={50} max={90} value={brief.threshold} onChange={(event) => setBrief({ ...brief, threshold: Number(event.target.value) })} />
                  </div>
                  <div className="field field-wide">
                    <label>Familles de noms</label>
                    <div className="style-grid">
                      {Object.entries(STYLE_LABELS).map(([style, label]) => (
                        <button
                          key={style}
                          className={brief.styles.includes(style as NameStyle) ? "selected" : ""}
                          onClick={() => setBrief({
                            ...brief,
                            styles: brief.styles.includes(style as NameStyle)
                              ? brief.styles.filter((item) => item !== style)
                              : [...brief.styles, style as NameStyle],
                          })}
                        >
                          {brief.styles.includes(style as NameStyle) && <Check size={14} />}
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="field field-wide">
                    <label>Termes et sonorités interdits</label>
                    <textarea
                      value={brief.forbiddenPatterns.join(", ")}
                      onChange={(event) => setBrief({
                        ...brief,
                        forbiddenPatterns: event.target.value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean),
                      })}
                    />
                    <small>Les variantes orthographiques proches sont également pénalisées ou exclues.</small>
                  </div>
                  <div className="advanced-settings field-wide">
                    <button
                      className="advanced-toggle"
                      onClick={() => setShowAdvanced((current) => !current)}
                    >
                      <SlidersHorizontal size={16} />
                      <span>Réglages avancés</span>
                      <small>Banque syllabique et pondérations</small>
                      <ChevronDown className={showAdvanced ? "rotated" : ""} size={17} />
                    </button>
                    {showAdvanced && (
                      <div className="advanced-content">
                        <div className="field field-wide">
                          <label>Banque de syllabes personnalisée</label>
                          <textarea
                            value={brief.syllables.join(", ")}
                            onChange={(event) => setBrief({
                              ...brief,
                              syllables: event.target.value
                                .split(",")
                                .map((item) => item.trim().toLowerCase())
                                .filter(Boolean),
                            })}
                          />
                          <small>{brief.syllables.length} syllabes actives.</small>
                        </div>
                        <div className="weights-heading">
                          <div>
                            <strong>Pondérations du score</strong>
                            <span>Le total peut différer de 100 : il est normalisé automatiquement.</span>
                          </div>
                          <button onClick={() => setWeights(DEFAULT_WEIGHTS)}>
                            <RefreshCw size={14} /> Valeurs par défaut
                          </button>
                        </div>
                        <div className="weights-grid">
                          {([
                            ["memorability", "Mémorisation"],
                            ["french", "Prononciation française"],
                            ["international", "International"],
                            ["elegance", "Élégance"],
                            ["distinctiveness", "Distinctivité"],
                            ["domains", "Domaines"],
                            ["crowding", "Faible encombrement"],
                            ["trademark", "Risque de marque"],
                            ["graphic", "Potentiel graphique"],
                          ] as Array<[keyof ScoreWeights, string]>).map(([key, label]) => (
                            <label key={key}>
                              <span>{label}</span>
                              <input
                                type="range"
                                min={0}
                                max={30}
                                value={weights[key]}
                                onChange={(event) => setWeights({
                                  ...weights,
                                  [key]: Number(event.target.value),
                                })}
                              />
                              <strong>{weights[key]}</strong>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="brief-footer">
                    <div><ShieldCheck size={18} /><span>Les noms rejetés pendant cette session ne seront pas reproposés.</span></div>
                    <button className="primary-button" onClick={generate} disabled={generating || brief.styles.length === 0}>
                      {generating ? <LoaderCircle className="spin" size={18} /> : <WandSparkles size={18} />}
                      Générer {brief.count.toLocaleString("fr-FR")} candidats
                    </button>
                  </div>
                </div>
              )}
              {generating && (
                <div className="generation-progress">
                  <div><span>Moteurs de génération et filtres phonétiques</span><strong>{progress}%</strong></div>
                  <i><b style={{ width: `${progress}%` }} /></i>
                </div>
              )}
            </section>

            {candidates.length > 0 && (
              <section className="results-section">
                <div className="section-heading">
                  <div>
                    <span className="section-index">02</span>
                    <div><h2>Shortlist qualifiée</h2><p>Les {displayed.length} meilleurs candidats au-dessus du seuil, sur {generatedCount} générés.</p></div>
                  </div>
                  <div className="result-actions">
                    <label className="search-box"><Search size={17} /><input placeholder="Filtrer les noms…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
                    <button onClick={() => exportCsv()}><Download size={17} /> CSV</button>
                    <button onClick={() => setShowBrief(true)}><Settings2 size={17} /> Ajuster</button>
                  </div>
                </div>
                <div className="notice">
                  <ShieldCheck size={20} />
                  <p><strong>Lecture prudente des résultats.</strong> Cette recherche constitue un premier filtrage et ne remplace pas une recherche d’antériorité réalisée par un professionnel de la propriété industrielle.</p>
                </div>
                <div className="candidate-list">
                  {displayed.map(renderCandidate)}
                </div>
              </section>
            )}
            {!candidates.length && !generating && (
              <section className="empty-state">
                <div><Sparkles size={26} /></div>
                <h2>Votre shortlist commence par un brief exigeant.</h2>
                <p>Les 1 000 propositions brutes resteront en coulisses. Seuls les candidats dépassant votre seuil seront présentés.</p>
                <button onClick={generate}><Play size={17} /> Lancer la première génération</button>
              </section>
            )}
          </>
        )}

        {view === "alphabet" && (
          <section className="subpage">
            <div className="page-title"><span><Eye size={19} /></span><div><h1>Alphabet ambigramme</h1><p>Analyse structurelle uniquement — la réussite finale dépendra du dessin typographique.</p></div></div>
            <div className="ambigram-layout">
              <div className="analysis-card">
                <label>Tester un nom</label>
                <input value={ambigramWord} onChange={(event) => setAmbigramWord(event.target.value.replace(/[^a-z]/gi, "").slice(0, 20))} />
                <div className="ambigram-preview">
                  <span>{ambigramWord || "NOM"}</span>
                  <span className="rotated-word">{ambigramWord || "NOM"}</span>
                </div>
                <div className="analysis-result">
                  <strong>{ambigramAnalysis.label}</strong>
                  <div><span>Palindrome textuel</span><em>{ambigramAnalysis.palindrome ? "Oui" : "Non"}</em></div>
                  <div><span>Rotation 180°</span><em>{Math.round(ambigramAnalysis.rotationRatio * 100)}%</em></div>
                  <div><span>Lecture miroir</span><em>{Math.round(ambigramAnalysis.mirrorRatio * 100)}%</em></div>
                </div>
              </div>
              <div className="mapping-card">
                <div className="mapping-header"><div><h2>Correspondances actives</h2><p>Activez les couples admis par votre alphabet personnalisé.</p></div><button onClick={() => setMappings(DEFAULT_AMBIGRAM_MAPPINGS)}><RefreshCw size={16} /> Réinitialiser</button></div>
                <div className="mapping-grid">
                  {mappings.map((mapping) => (
                    <label key={mapping.id} className={mapping.enabled ? "mapping-active" : ""}>
                      <input
                        type="checkbox"
                        checked={mapping.enabled}
                        onChange={() => setMappings((current) => current.map((item) => item.id === mapping.id ? { ...item, enabled: !item.enabled } : item))}
                      />
                      <strong>{mapping.from}</strong><RefreshCw size={14} /><strong>{mapping.to}</strong>
                      {mapping.optional && <small>variante</small>}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {view === "compare" && (
          <section className="subpage">
            <div className="page-title"><span><Columns3 size={19} /></span><div><h1>Comparateur</h1><p>Jusqu’à cinq candidats, évalués avec les mêmes critères et les mêmes réserves.</p></div></div>
            {comparedCandidates.length ? (
              <>
                <div className="compare-toolbar"><span>{comparedCandidates.length}/5 sélectionnés</span><button onClick={() => exportCsv(comparedCandidates)}><Download size={16} /> Exporter la sélection</button></div>
                <div className="compare-wrap">
                  <table>
                    <thead><tr><th>Critère</th>{comparedCandidates.map((candidate) => <th key={candidate.id}>{candidate.name}<button onClick={() => toggleCompare(candidate.name)}><X size={14} /></button></th>)}</tr></thead>
                    <tbody>
                      <tr><td>Score global</td>{comparedCandidates.map((candidate) => <td key={candidate.id}><strong className="big-score">{candidate.score.total}</strong>/100</td>)}</tr>
                      <tr><td>Prononciation FR</td>{comparedCandidates.map((candidate) => <td key={candidate.id}>{candidate.phoneticScore}/100</td>)}</tr>
                      <tr><td>International</td>{comparedCandidates.map((candidate) => <td key={candidate.id}>{candidate.internationalScore}/100</td>)}</tr>
                      <tr><td>Ambigramme</td>{comparedCandidates.map((candidate) => <td key={candidate.id}>{candidate.ambigram.label}</td>)}</tr>
                      <tr><td>Domaine .com</td>{comparedCandidates.map((candidate) => { const item = verification[candidate.name]?.domains?.find((domain) => domain.domain.endsWith(".com")); return <td key={candidate.id}>{item ? <StatusPill check={item} /> : "Non vérifié"}</td>; })}</tr>
                      <tr><td>Entreprises</td>{comparedCandidates.map((candidate) => <td key={candidate.id}>{verification[candidate.name]?.company ? `${verification[candidate.name]?.company?.crowdingScore}/10` : "Non vérifié"}</td>)}</tr>
                      <tr><td>Déclinaison</td>{comparedCandidates.map((candidate) => <td key={candidate.id}>{candidate.name} Gestion Pro<br />Groupe {candidate.name}</td>)}</tr>
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="empty-state compact"><Columns3 size={28} /><h2>Aucun candidat à comparer</h2><p>Ajoutez jusqu’à cinq noms depuis la shortlist.</p><button onClick={() => setView("studio")}>Voir la shortlist</button></div>
            )}
          </section>
        )}

        {view === "favorites" && (
          <section className="subpage">
            <div className="page-title"><span><Heart size={19} /></span><div><h1>Favoris</h1><p>Votre sélection personnelle, conservée localement dans cette version.</p></div></div>
            {favoriteCandidates.length ? <div className="candidate-list">{favoriteCandidates.map(renderCandidate)}</div> : <div className="empty-state compact"><Heart size={28} /><h2>Aucun favori</h2><p>Les noms que vous retenez apparaîtront ici.</p><button onClick={() => setView("studio")}>Explorer les résultats</button></div>}
          </section>
        )}

        {view === "rejected" && (
          <section className="subpage">
            <div className="page-title"><span><Trash2 size={19} /></span><div><h1>Noms rejetés</h1><p>Ces noms et leurs variantes proches sont exclus des prochaines générations.</p></div></div>
            <div className="rejected-list">
              {rejected.map((name) => <div key={name}><span>{name}</span><small>Exclu de la génération</small><button onClick={() => restoreCandidate(name)}><RefreshCw size={15} /> Restaurer</button></div>)}
              {!rejected.length && <div className="empty-state compact"><Trash2 size={28} /><h2>Aucun rejet</h2><p>Les décisions négatives alimentent les filtres de la session.</p></div>}
            </div>
          </section>
        )}

        {view === "history" && (
          <section className="subpage">
            <div className="page-title">
              <span><History size={19} /></span>
              <div>
                <h1>Historique des vérifications</h1>
                <p>Chaque contrôle est conservé séparément afin de suivre les changements dans le temps.</p>
              </div>
            </div>
            {verificationHistory.length ? (
              <>
                <div className="history-toolbar">
                  <span>{verificationHistory.length} contrôle(s) conservé(s) localement</span>
                  <button onClick={() => setVerificationHistory([])}>
                    <Trash2 size={15} /> Effacer l’historique
                  </button>
                </div>
                <div className="history-list">
                  {verificationHistory.map((entry) => (
                    <article key={entry.id}>
                      <div>
                        <strong>{entry.candidate}</strong>
                        <span>{new Date(entry.checkedAt).toLocaleString("fr-FR")}</span>
                      </div>
                      <div>
                        <small>Domaines</small>
                        <span>{entry.registeredDomains} enregistré(s)</span>
                        <span>{entry.availableDomains} disponible(s)*</span>
                        <span>{entry.unverifiedDomains} non vérifié(s)</span>
                      </div>
                      <div>
                        <small>Encombrement</small>
                        <strong>{entry.crowdingScore === null ? "Non vérifié" : `${entry.crowdingScore}/10`}</strong>
                      </div>
                      <div>
                        <small>Sources</small>
                        <span>{entry.domainProvider}</span>
                        <span>{entry.companyProvider ?? "Sociétés non disponibles"}</span>
                      </div>
                    </article>
                  ))}
                </div>
                <p className="history-disclaimer">
                  * Une disponibilité constatée n’est jamais une réservation et peut changer immédiatement.
                </p>
              </>
            ) : (
              <div className="empty-state compact">
                <History size={28} />
                <h2>Aucune vérification conservée</h2>
                <p>Lancez un contrôle depuis une fiche candidat pour créer la première entrée.</p>
                <button onClick={() => setView("studio")}>Retour à la shortlist</button>
              </div>
            )}
          </section>
        )}

        {view === "settings" && (
          <section className="subpage">
            <div className="page-title"><span><KeyRound size={19} /></span><div><h1>Sources et clés API</h1><p>Les secrets restent côté serveur et ne sont jamais exposés dans l’interface.</p></div></div>
            <div className="settings-grid">
              <div className="provider-card"><div className="provider-icon">CF</div><div><span>Domaines</span><h2>Cloudflare Registrar</h2><p>Fournisseur principal pour confirmer une disponibilité et le tarif au moment du contrôle.</p><code>CLOUDFLARE_ACCOUNT_ID · CLOUDFLARE_API_TOKEN</code></div><span className="provider-status">Optionnel</span></div>
              <div className="provider-card"><div className="provider-icon">RD</div><div><span>Domaines</span><h2>RDAP</h2><p>Repli sans clé. Confirme un enregistrement existant, mais jamais une disponibilité.</p></div><span className="provider-status connected">Actif</span></div>
              <div className="provider-card"><div className="provider-icon">RF</div><div><span>Entreprises</span><h2>API Recherche d’entreprises</h2><p>Source publique française, utilisée pour le score indicatif d’encombrement.</p></div><span className="provider-status connected">Actif</span></div>
              <div className="provider-card disabled"><div className="provider-icon">TM</div><div><span>Marques</span><h2>INPI / EUIPO</h2><p>Connecteurs prévus après obtention et validation des accès officiels. Aucun résultat simulé.</p></div><span className="provider-status">À connecter</span></div>
            </div>
            <div className="source-policy"><FileText size={20} /><div><strong>Politique de fiabilité</strong><p>Chaque réponse est horodatée et attribuée à sa source. Un échec reste un échec : l’application ne le transforme jamais en disponibilité ou en absence de conflit.</p></div></div>
          </section>
        )}
      </main>
      {ambigramExample && (
        <div className="example-modal" role="dialog" aria-modal="true" aria-label={`Exemple ambigramme pour ${ambigramExample.name}`}>
          <button className="example-backdrop" onClick={() => setAmbigramExample(null)} aria-label="Fermer l’exemple" />
          <div className="example-dialog">
            <button className="example-close" onClick={() => setAmbigramExample(null)} aria-label="Fermer">
              <X size={18} />
            </button>
            <span className="example-kicker"><Eye size={15} /> Simulation structurelle</span>
            <h2>Une piste pour « {ambigramExample.name} »</h2>
            <p>
              Le mot ci-dessous est simplement retourné avec la typographie actuelle. Un designer
              devrait ensuite redessiner les lettres incompatibles pour conserver une lecture cohérente.
            </p>
            <div className="example-stage">
              <div>
                <small>Lecture à 0°</small>
                <strong>{ambigramExample.name}</strong>
              </div>
              <RefreshCw size={22} />
              <div>
                <small>Lecture à 180°</small>
                <strong className="example-rotated">{ambigramExample.name}</strong>
              </div>
            </div>
            <div className="example-analysis">
              <div>
                <span>Compatibilité de structure</span>
                <strong>{Math.round(ambigramExample.ambigram.rotationRatio * 100)}%</strong>
              </div>
              <i><b style={{ width: `${ambigramExample.ambigram.rotationRatio * 100}%` }} /></i>
            </div>
            <div className="example-guidance">
              <strong>Exemple de travail typographique</strong>
              <p>
                Conserver les lettres déjà symétriques, rapprocher les proportions des caractères
                opposés, puis créer des glyphes hybrides pour les lettres restantes. Le résultat
                devra être validé visuellement à 0° et à 180°.
              </p>
            </div>
            <button className="primary-button" onClick={() => {
              setAmbigramWord(ambigramExample.name);
              setAmbigramExample(null);
              setView("alphabet");
            }}>
              Ouvrir dans l’analyseur
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
