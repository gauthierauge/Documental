import { useEffect, useRef, useState } from 'react';
import { usePath } from '@/router';

/**
 * Le menu sur téléphone. Son bouton l'ouvre et le ferme ; Échap le ferme et rend le focus au
 * bouton. Il n'est ouvert que sur la page où on l'a ouvert : changer de page (lien du menu,
 * bouton Précédent) le referme sans rien de plus ; `close` sert au lien de la page déjà ouverte.
 */
export function useMenu() {
  const path = usePath();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const open = openOn === path;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpenOn(null);
      button.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return {
    open,
    button,
    toggle: () => setOpenOn(open ? null : path),
    close: () => setOpenOn(null),
  };
}

export type Menu = ReturnType<typeof useMenu>;
