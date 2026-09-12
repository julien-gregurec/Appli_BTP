import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ELSATIA Studio",
  description: "Votre espace de création, indépendant et personnel.",
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <a className="skip" href="#main">
          Aller au contenu
        </a>
        {children}
      </body>
    </html>
  );
}
