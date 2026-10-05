import type { ReactNode } from 'react';
import { Badge, type Tone } from '@/ui/Badge';
import { Card } from '@/ui/Card';

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
