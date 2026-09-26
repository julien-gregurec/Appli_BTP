import type { IconeNavigation } from "@/lib/navigation";

const chemins: Record<IconeNavigation, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  inventory: <><path d="M4 7h16v13H4z"/><path d="M8 7V4h8v3M9 12h6"/></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3"/></>,
  location: <><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11z"/><circle cx="12" cy="10" r="2"/></>,
  movement: <><path d="M5 8h12M14 5l3 3-3 3M19 16H7M10 13l-3 3 3 3"/></>,
  palette: <><path d="M12 3a9 9 0 0 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h4a4 4 0 0 0 4-4c0-3.3-4-6-9-6z"/><circle cx="8" cy="8" r="1"/><circle cx="12" cy="7" r="1"/><circle cx="16" cy="9" r="1"/></>,
  catalog: <><path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z"/><path d="M7 4v16M10 8h6M10 12h6"/></>,
  upload: <><path d="M12 16V4M8 8l4-4 4 4"/><path d="M5 14v6h14v-6"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 2-6 6-6s6 2 6 6M16 5a3 3 0 0 1 0 6M17 14c2.7.4 4 2.4 4 6"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1a8 8 0 0 0-1.7-1L14.3 3h-4.1L9.8 6a8 8 0 0 0-1.7 1L5.6 6 3.5 9.4 5.6 11a7 7 0 0 0 0 2l-2.1 1.6L5.6 18l2.5-1a8 8 0 0 0 1.7 1l.4 3h4.1l.4-3a8 8 0 0 0 1.7-1l2.5 1 2-3.4-2-1.6a7 7 0 0 0 .1-1z"/></>,
};

export function NavIcon({ name }: { name: IconeNavigation }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{chemins[name]}</svg>;
}
