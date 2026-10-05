import type { ReactNode } from 'react';
import './ui.css';

// Ce qui s'affiche quand il n'y a rien : dire pourquoi, et quoi faire.

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
