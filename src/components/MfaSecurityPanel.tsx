"use client";

import type { Factor } from "@supabase/supabase-js";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avecDelai, codeTotpValide, facteursTotp } from "@/lib/auth/mfa";
import { destinationInterneSure } from "@/lib/security/redirects";

type Enrolement = { id: string; qrCode: string; secret: string };

const MESSAGE_ERREUR = "L’opération MFA n’a pas abouti. Vérifiez le code puis réessayez.";
const champ = "w-full rounded-md border border-neutral-300 px-3 py-2 text-base tracking-[0.2em] dark:border-neutral-700 dark:bg-neutral-950";

export function MfaSecurityPanel({ facteursInitiaux, aalInitial, erreurInitiale = false, prochain, requisPlateforme = false }: { facteursInitiaux: Factor[]; aalInitial: string | null; erreurInitiale?: boolean; prochain?: string; requisPlateforme?: boolean }) {
  const [supabase] = useState(createClient);
  const router = useRouter();
  const [facteurs, setFacteurs] = useState<Factor[]>(facteursInitiaux);
  const [aal, setAal] = useState<string | null>(aalInitial);
  const [enrolement, setEnrolement] = useState<Enrolement | null>(null);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [secretVisible, setSecretVisible] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(erreurInitiale ? "Impossible de vérifier l’état MFA. L’accès sensible reste bloqué." : null);
  const destination = destinationInterneSure(prochain, "/plateforme");

  const actualiser = useCallback(async () => {
    try {
      const [liste, niveau] = await avecDelai(Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]));
      if (liste.error || niveau.error || !liste.data || !niveau.data) throw new Error("MFA_UNAVAILABLE");
      setFacteurs(facteursTotp(liste.data.all));
      setAal(niveau.data.currentLevel);
    } catch {
      setMessage("Impossible de vérifier l’état MFA. L’accès sensible reste bloqué.");
    }
  }, [supabase]);

  async function activer() {
    setAction("enroll");
    setMessage(null);
    try {
      const { data, error } = await avecDelai(supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `ELSATIA ${new Date().toLocaleDateString("fr-FR")}`,
        issuer: "ELSATIA",
      }));
      if (error || !data || data.type !== "totp") throw new Error("MFA_ENROLL_FAILED");
      setEnrolement({ id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
      await actualiser();
    } catch {
      setMessage(MESSAGE_ERREUR);
    }
    setAction(null);
  }

  async function verifier(facteurId: string) {
    const code = codes[facteurId]?.trim() ?? "";
    if (!codeTotpValide(code)) {
      setMessage("Saisissez les 6 chiffres affichés par votre application d’authentification.");
      return;
    }
    setAction(facteurId);
    setMessage(null);
    try {
      const challenge = await avecDelai(supabase.auth.mfa.challenge({ factorId: facteurId }));
      if (challenge.error || !challenge.data) throw new Error("MFA_CHALLENGE_FAILED");
      const verification = await avecDelai(supabase.auth.mfa.verify({ factorId: facteurId, challengeId: challenge.data.id, code }));
      setCodes((etat) => ({ ...etat, [facteurId]: "" }));
      if (verification.error) throw new Error("MFA_VERIFY_FAILED");
      setEnrolement(null);
      setSecretVisible(false);
      setMessage("Facteur vérifié. Cette session est maintenant protégée au niveau AAL2.");
      await actualiser();
      router.refresh();
      if (requisPlateforme) router.push(destination);
    } catch {
      setCodes((etat) => ({ ...etat, [facteurId]: "" }));
      setMessage(MESSAGE_ERREUR);
    }
    setAction(null);
  }

  async function supprimer(facteurId: string) {
    setAction(`delete:${facteurId}`);
    setMessage(null);
    try {
      const reponse = await avecDelai(fetch("/api/auth/mfa/unenroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factorId: facteurId }),
      }));
      const resultat = (await reponse.json().catch(() => ({}))) as { error?: string };
      if (!reponse.ok) throw new Error(resultat.error ?? MESSAGE_ERREUR);
      if (enrolement?.id === facteurId) setEnrolement(null);
      setMessage("Facteur supprimé.");
      await actualiser();
      router.refresh();
    } catch (erreur) {
      setMessage(erreur instanceof Error && erreur.message !== "MFA_TIMEOUT" ? erreur.message : MESSAGE_ERREUR);
    }
    setAction(null);
  }

  const verifies = facteurs.filter((facteur) => facteur.status === "verified");
  const statut = verifies.length > 0 ? "Active" : facteurs.length > 0 ? "Configuration en cours" : "Non configurée";

  return (
    <div className="space-y-5">
      {requisPlateforme && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          Un facteur vérifié est obligatoire avant d’accéder à l’administration de la plateforme.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-semibold">Authentification à deux facteurs</h2><p className="text-sm text-neutral-600">État : <strong>{statut}</strong> · Session : <strong>{aal?.toUpperCase() ?? "indisponible"}</strong></p></div>
        <button type="button" disabled={Boolean(action)} onClick={activer} className="min-h-11 rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Activer un facteur TOTP</button>
      </div>

      {enrolement && (
        <section className="space-y-4 rounded-md border border-blue-200 bg-blue-50/40 p-4" aria-labelledby="mfa-enrolement">
          <div><h3 id="mfa-enrolement" className="font-semibold">1. Scanner le QR code</h3><p className="text-sm text-neutral-700">Utilisez Google Authenticator, Microsoft Authenticator, 1Password ou une application TOTP compatible.</p></div>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR éphémère fourni directement par Supabase Auth */}
          <img src={enrolement.qrCode} alt="QR code temporaire d’enrôlement MFA ELSATIA" className="mx-auto h-auto w-full max-w-64 rounded bg-white p-3" />
          <div>
            <button type="button" onClick={() => setSecretVisible((visible) => !visible)} className="text-sm font-medium underline">{secretVisible ? "Masquer" : "Afficher"} la clé de saisie manuelle</button>
            {secretVisible && <p className="mt-2 break-all rounded bg-white p-2 font-mono text-sm" aria-label="Clé TOTP temporaire">{enrolement.secret}</p>}
          </div>
        </section>
      )}

      <div className="space-y-3">
        {facteurs.map((facteur, index) => (
          <section key={facteur.id} className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="font-medium">{facteur.friendly_name || `Application TOTP ${index + 1}`}</h3><p className="text-xs text-neutral-500">TOTP · {facteur.status === "verified" ? "Vérifié" : "Non vérifié"}</p></div>
              <button type="button" disabled={Boolean(action)} onClick={() => void supprimer(facteur.id)} className="min-h-11 rounded-md border border-red-200 px-3 py-2 text-sm text-red-700 disabled:opacity-50">{facteur.status === "verified" ? "Désactiver" : "Annuler la configuration"}</button>
            </div>
            {facteur.status === "unverified" && (
              <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(evenement) => { evenement.preventDefault(); void verifier(facteur.id); }}>
                <label className="min-w-0 flex-1 text-sm font-medium" htmlFor={`totp-${facteur.id}`}>2. Code à 6 chiffres
                  <input id={`totp-${facteur.id}`} value={codes[facteur.id] ?? ""} onChange={(evenement) => setCodes((etat) => ({ ...etat, [facteur.id]: evenement.target.value.replace(/\D/g, "").slice(0, 6) }))} className={`${champ} mt-1`} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
                </label>
                <button disabled={Boolean(action)} className="min-h-11 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Vérifier</button>
              </form>
            )}
          </section>
        ))}
        {facteurs.length === 0 && <p className="rounded-md bg-neutral-50 p-4 text-sm text-neutral-600">Aucun facteur TOTP n’est configuré.</p>}
      </div>
      <p aria-live="polite" className="min-h-5 text-sm text-neutral-700">{message}</p>
      <aside className="rounded-md border border-neutral-200 p-4 text-sm text-neutral-600">
        <strong className="text-neutral-900">Récupération ELSATIA</strong>
        <p className="mt-1">Supabase ne fournit pas de codes de secours TOTP. La continuité repose sur deux administrateurs total protégés par MFA, la récupération email et une procédure opérateur avec vérification d’identité. Aucun contournement SQL manuel n’est admis.</p>
      </aside>
    </div>
  );
}
