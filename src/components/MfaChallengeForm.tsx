"use client";

import type { Factor } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avecDelai, codeTotpValide, facteurTotpPourChallenge } from "@/lib/auth/mfa";
import { destinationInterneSure } from "@/lib/security/redirects";

export function MfaChallengeForm({ prochain, controleIndisponible = false }: { prochain?: string; controleIndisponible?: boolean }) {
  const [supabase] = useState(createClient);
  const router = useRouter();
  const destination = destinationInterneSure(prochain, "/plateforme");
  const [facteurs, setFacteurs] = useState<Factor[]>([]);
  const [facteurId, setFacteurId] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState(controleIndisponible ? "Le niveau de sécurité n’a pas pu être vérifié. L’accès reste bloqué." : "");
  const [chargement, setChargement] = useState(true);
  const [verification, setVerification] = useState(false);

  useEffect(() => {
    let actif = true;
    void (async () => {
      try {
        const [liste, niveau] = await avecDelai(Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()]));
        if (!actif) return;
        if (liste.error || niveau.error || !liste.data || !niveau.data) throw new Error("MFA_UNAVAILABLE");
        if (niveau.data.currentLevel === "aal2") {
          router.replace(destination);
          return;
        }
        const verifies = liste.data.totp;
        setFacteurs(verifies);
        setFacteurId(facteurTotpPourChallenge(verifies)?.id ?? "");
        if (verifies.length === 0) setMessage("Aucun facteur vérifié. Configurez d’abord l’authentification à deux facteurs.");
      } catch {
        if (!actif) return;
        setMessage("Impossible de vérifier le niveau de sécurité. L’accès reste bloqué.");
      }
      setChargement(false);
    })();
    return () => { actif = false; setCode(""); };
  }, [destination, router, supabase]);

  async function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (!facteurId || !codeTotpValide(code)) {
      setMessage("Saisissez les 6 chiffres affichés par votre application d’authentification.");
      return;
    }
    setVerification(true);
    setMessage("");
    try {
      const challenge = await avecDelai(supabase.auth.mfa.challenge({ factorId: facteurId }));
      if (challenge.error || !challenge.data) throw new Error("MFA_CHALLENGE_FAILED");
      const resultat = await avecDelai(supabase.auth.mfa.verify({ factorId: facteurId, challengeId: challenge.data.id, code }));
      setCode("");
      if (resultat.error) throw new Error("MFA_VERIFY_FAILED");
      router.replace(destination);
      router.refresh();
    } catch {
      setCode("");
      setMessage("Code incorrect, expiré ou service indisponible. Réessayez avec le code actuel.");
    }
    setVerification(false);
  }

  if (chargement) return <p role="status" className="text-sm text-neutral-600">Vérification de la session…</p>;
  if (facteurs.length === 0) return <a href={`/parametres/securite?requis=plateforme&next=${encodeURIComponent(destination)}`} className="inline-flex min-h-11 items-center rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Configurer MFA</a>;

  return (
    <form onSubmit={soumettre} className="space-y-4">
      {facteurs.length > 1 && <label className="block text-sm font-medium" htmlFor="facteur">Application d’authentification<select id="facteur" value={facteurId} onChange={(e) => setFacteurId(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-base">{facteurs.map((facteur, index) => <option key={facteur.id} value={facteur.id}>{facteur.friendly_name || `Application TOTP ${index + 1}`}</option>)}</select></label>}
      <label className="block text-sm font-medium" htmlFor="code-mfa">Code à 6 chiffres<input id="code-mfa" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus className="mt-1 w-full rounded-md border px-3 py-3 text-center text-xl tracking-[0.35em]" /></label>
      <button disabled={verification} className="min-h-11 w-full rounded-md bg-[#0d1b2a] px-4 py-2 font-semibold text-white disabled:opacity-50">{verification ? "Vérification…" : "Valider et continuer"}</button>
      <p aria-live="assertive" className="min-h-5 text-sm text-red-700">{message}</p>
    </form>
  );
}
