import type { ReactNode } from 'react';
import './ui.css';

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ui-vide">
      <p className="ui-vide-titre">{title}</p>
      {children && <p className="ui-vide-texte">{children}</p>}
      {action}
    </div>
  );
}
