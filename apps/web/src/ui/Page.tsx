import type { ReactNode } from 'react';
import './ui.css';

export function Page({
  title,
  lede,
  narrow = false,
  children,
}: {
  title: ReactNode;
  lede?: ReactNode;
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
