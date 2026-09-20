import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="auth">
      <h1>Page ou espace inaccessible.</h1>
      <p>
        Cette page n’existe pas, ou l’espace ou le projet demandé est
        inaccessible avec votre compte.
      </p>
      <Link href="/dashboard">Retour à mes espaces</Link>
    </main>
  );
}
