"use client";
import { useFormStatus } from "react-dom";
export default function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending}>
      {pending ? "Veuillez patienter…" : children}
    </button>
  );
}
