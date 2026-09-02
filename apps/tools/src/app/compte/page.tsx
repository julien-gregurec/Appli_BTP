import type { Metadata } from "next";
import { AccountWorkspace } from "@/components/AccountWorkspace";

export const metadata: Metadata = { title: "Compte ELSATIA", description: "Connexion facultative au compte commun ELSATIA pour les droits Tools Pro et la synchronisation." };
export default function AccountPage() { return <AccountWorkspace />; }
