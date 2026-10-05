import { useEffect, useId, useRef, useState } from 'react';

export function usePopover() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('input, button, a[href], [tabindex]')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || panel.current?.contains(target) || button.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return {
    open,
    button,
    panel,
    triggerProps: {
      ref: button,
      'aria-expanded': open,
      'aria-controls': id,
      onClick: () => setOpen((value) => !value),
    },
    panelProps: { ref: panel, id, hidden: !open },
    close: () => setOpen(false),
  };
}

export type Popover = ReturnType<typeof usePopover>;
