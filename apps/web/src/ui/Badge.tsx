import type { ReactNode } from 'react';
import './ui.css';

// Une pastille d'état. Le texte porte le sens : la couleur ne fait que le souligner.

export type Tone = 'neutre' | 'accent' | 'succes' | 'attention' | 'danger';

export function Badge({ tone = 'neutre', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`ui-badge ui-badge-${tone}`}>{children}</span>;
}
