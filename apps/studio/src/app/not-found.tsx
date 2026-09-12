import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="auth">
      <h1>Espace inaccessible.</h1>
      <p>Cet espace n’existe pas ou vous n’en êtes plus membre.</p>
      <Link href="/dashboard">Retour à mes espaces</Link>
    </main>
  );
}
