"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Brand } from "./HomeDashboard";
import { useAccount } from "./AccountProvider";
import { MonetizationPanel } from "./MonetizationPanel";

export function AccountWorkspace() {
  const account = useAccount(); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setError(""); try { await account.signIn(email, password); setPassword(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "Connexion impossible."); } }
  return <main className="account-page"><header className="calculator-header shell"><Brand /><Link className="all-tools" href="/">Accueil <span>×</span></Link></header><section className="tool-hero"><div className="shell"><p className="eyebrow">COMPTE COMMUN ELSATIA</p><h1 className="projects-title">Compte ELSATIA</h1><p>Le compte est facultatif. Les calculs Free restent disponibles sans connexion.</p></div></section><section className="shell account-card">
    {account.user ? <><div className="account-identity"><span>{(account.user.email?.[0] ?? "E").toUpperCase()}</span><div><small>CONNECTÉ</small><strong>{account.user.user_metadata?.full_name ?? account.user.email}</strong><p>{account.access.tier === "pro" ? "Tools Pro" : "Tools Free"} · {account.message}</p><p>Synchronisation : {account.syncStatus === "syncing" ? "en cours" : account.syncStatus === "synced" ? "à jour" : account.syncStatus === "error" ? "erreur, les projets locaux sont conservés" : "locale uniquement"}</p></div></div><div className="account-actions"><button onClick={() => void account.syncNow()}>Synchroniser</button><button onClick={() => void account.refresh()}>Vérifier les droits</button><button className="secondary" onClick={() => void account.signOut()}>Se déconnecter</button></div></> : <form onSubmit={submit}><h2>Se connecter</h2><p>Utilisez le même compte que dans les autres applications ELSATIA.</p><label><span>Adresse e-mail</span><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label><span>Mot de passe</span><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label><button disabled={!account.configured || account.status === "loading"}>{account.status === "loading" ? "Connexion…" : "Se connecter"}</button>{!account.configured && <p className="account-warning">Compte cloud non configuré dans cet environnement local. Tools Free reste opérationnel.</p>}{error && <p className="account-error" role="alert">{error}</p>}</form>}
  </section><MonetizationPanel /></main>;
}
