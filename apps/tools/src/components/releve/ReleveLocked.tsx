import Link from "next/link";
import styles from "./releve.module.css";

const MESSAGES = {
  account: { title: "Connectez votre compte ELSATIA", body: "Relevé & Métré enregistre vos relevés dans l'espace de votre entreprise : un compte ELSATIA est nécessaire." },
  company: { title: "Aucune entreprise Tools active", body: "Votre compte n'est rattaché à aucune entreprise disposant d'ELSATIA Tools." },
  entitlement: {
    title: "Module premium en préversion",
    body: "Relevé & Métré est un module premium de Tools, ouvert pour l'instant sur invitation aux entreprises pilotes. Il n'est pas encore proposé à l'achat.",
  },
} as const;

/** État verrouillé. Aucun prix ni bouton d'achat : le module n'est pas commercialisé. */
export function ReleveLocked({ reason }: { reason: keyof typeof MESSAGES }) {
  const message = MESSAGES[reason];
  return <section className={styles.locked} aria-label="Relevé & Métré indisponible">
    <span className={styles.premium}>PREMIUM · PRÉVERSION</span>
    <h2>{message.title}</h2>
    <p>{message.body}</p>
    {reason === "account" && <Link className={styles.open} href="/compte">Se connecter</Link>}
  </section>;
}
