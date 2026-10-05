import type { ReactNode } from 'react';
import './ui.css';

// Un tableau de données : défile horizontalement sur téléphone plutôt que de casser la page.
// Les colonnes de nombres prennent la classe `ui-num` (alignées à droite, chiffres tabulaires).

export function Table({ label, children }: { label: string; children: ReactNode }) {
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- le cadre défile au clavier quand le tableau déborde.
    <section className="ui-tableau-cadre" tabIndex={0} aria-label={label}>
      <table className="ui-tableau">{children}</table>
    </section>
  );
}
