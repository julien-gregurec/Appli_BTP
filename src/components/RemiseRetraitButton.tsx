"use client";

import { useFormStatus } from "react-dom";

export function RemiseRetraitButton({ message, className }: { message: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {pending ? "Retrait en cours…" : "Retirer la remise"}
    </button>
  );
}
