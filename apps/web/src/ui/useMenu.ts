import { useEffect, useRef, useState } from 'react';
import { usePath } from '@/router';

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
