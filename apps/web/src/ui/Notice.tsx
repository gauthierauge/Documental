import type { ReactNode } from 'react';
import type { Tone } from './Badge';
import './ui.css';

// Un message dans la page (envoi réussi, erreur…). Une erreur est annoncée tout de suite aux
// lecteurs d'écran (role="alert") ; le reste, poliment (role="status").

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
