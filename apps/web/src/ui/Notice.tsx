import type { ReactNode } from 'react';
import type { Tone } from './Badge';
import './ui.css';

export function Notice({
  tone = 'neutre',
  children,
}: {
  tone?: Exclude<Tone, 'accent'>;
  children: ReactNode;
}) {
  return (
    <p className={`ui-message ui-message-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
