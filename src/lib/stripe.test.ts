import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { lienPaiementStripeEstActif, verifierSignatureStripe } from "./stripe";

describe("signature webhook Stripe",()=>{
 afterEach(()=>vi.unstubAllEnvs());
 it("accepte une signature HMAC valide",()=>{vi.stubEnv("STRIPE_WEBHOOK_SECRET","whsec_test");const corps='{"id":"evt_test"}',timestamp=Math.floor(Date.now()/1000);const signature=createHmac("sha256","whsec_test").update(`${timestamp}.${corps}`).digest("hex");expect(verifierSignatureStripe(corps,`t=${timestamp},v1=${signature}`)).toBe(true);});
 it("refuse un contenu modifié",()=>{vi.stubEnv("STRIPE_WEBHOOK_SECRET","whsec_test");const timestamp=Math.floor(Date.now()/1000);const signature=createHmac("sha256","whsec_test").update(`${timestamp}.original`).digest("hex");expect(verifierSignatureStripe("modifie",`t=${timestamp},v1=${signature}`)).toBe(false);});
 it("refuse une signature trop ancienne",()=>{vi.stubEnv("STRIPE_WEBHOOK_SECRET","whsec_test");const timestamp=Math.floor(Date.now()/1000)-600;const signature=createHmac("sha256","whsec_test").update(`${timestamp}.corps`).digest("hex");expect(verifierSignatureStripe("corps",`t=${timestamp},v1=${signature}`)).toBe(false);});
 it("isole le secret abonnement du secret Stripe Connect",()=>{vi.stubEnv("STRIPE_WEBHOOK_SECRET","whsec_connect");const corps='{"id":"evt_abonnement"}',timestamp=Math.floor(Date.now()/1000);const signature=createHmac("sha256","whsec_abonnement").update(`${timestamp}.${corps}`).digest("hex");expect(verifierSignatureStripe(corps,`t=${timestamp},v1=${signature}`,"whsec_abonnement")).toBe(true);expect(verifierSignatureStripe(corps,`t=${timestamp},v1=${signature}`)).toBe(false);});
});

describe("lien de paiement client",()=>{
 it("accepte uniquement un lien non expiré",()=>{vi.useFakeTimers();vi.setSystemTime(new Date("2026-07-16T18:00:00Z"));expect(lienPaiementStripeEstActif("https://checkout.stripe.com/test","2026-07-16T19:00:00Z")).toBe(true);expect(lienPaiementStripeEstActif("https://checkout.stripe.com/test","2026-07-16T17:00:00Z")).toBe(false);vi.useRealTimers();});
});
