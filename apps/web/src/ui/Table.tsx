import type { ReactNode } from 'react';
import './ui.css';

export function Table({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="ui-tableau-cadre" tabIndex={0} aria-label={label}>
      <table className="ui-tableau">{children}</table>
    </section>
  );
}
