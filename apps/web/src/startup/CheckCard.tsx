import type { ReactNode } from 'react';
import { Badge, type Tone } from '@/ui/Badge';
import { Card } from '@/ui/Card';

// Une carte de la page « Démarrage » : un élément installé, son état réel, et comment le vérifier.

export interface CheckStatus {
  tone: Tone;
  label: string;
}

export const CHECKING: CheckStatus = { tone: 'neutre', label: 'Vérification…' };

export function CheckCard({
  title,
  status,
  how,
  children,
}: {
  title: string;
  status: CheckStatus;
  /** Le geste qui prouve que ça marche : un lien, une commande, un bouton. */
  how?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card title={title} actions={<Badge tone={status.tone}>{status.label}</Badge>}>
      {children}
      {how && <div className="demarrage-verifier">{how}</div>}
    </Card>
  );
}
