import { type ReactNode, useId } from 'react';
import './ui.css';

// Une carte : un bloc de contenu sur une surface, avec un titre et des actions facultatifs.

interface CardProps {
  title?: ReactNode;
  /** Niveau du titre dans la page : 2 sous le titre de page, 3 dans une section. */
  level?: 2 | 3;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Card({ title, level = 2, actions, className, children }: CardProps) {
  const Heading = level === 2 ? 'h2' : 'h3';
  const id = useId();
  return (
    <section
      className={className ? `ui-carte ${className}` : 'ui-carte'}
      aria-labelledby={title ? id : undefined}
    >
      {(title || actions) && (
        <div className="ui-carte-entete">
          {title && (
            <Heading id={id} className="ui-carte-titre">
              {title}
            </Heading>
          )}
          {actions && <div className="ui-carte-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
