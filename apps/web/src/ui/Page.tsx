import type { ReactNode } from 'react';
import './ui.css';

// Une page de l'app : un seul titre de niveau 1, un chapô facultatif, puis le contenu.

export function Page({
  title,
  lede,
  narrow = false,
  children,
}: {
  title: ReactNode;
  lede?: ReactNode;
  /** Colonne étroite, pour un formulaire seul (connexion, mot de passe…). */
  narrow?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={narrow ? 'ui-page ui-page-etroite' : 'ui-page'}>
      <header className="ui-page-entete">
        <h1>{title}</h1>
        {lede && <p className="ui-chapo">{lede}</p>}
      </header>
      {children}
    </div>
  );
}
