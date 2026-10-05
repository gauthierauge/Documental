import type { ReactNode } from 'react';
import './ui.css';

export type Tone = 'neutre' | 'accent' | 'succes' | 'attention' | 'danger';

export function Badge({ tone = 'neutre', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`ui-badge ui-badge-${tone}`}>{children}</span>;
}
