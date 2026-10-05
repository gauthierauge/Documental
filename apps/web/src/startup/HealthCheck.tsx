import { type ReactNode, useEffect, useState } from 'react';
import { api } from '@/api';
import { CHECKING, CheckCard, type CheckStatus } from './CheckCard';

export function HealthCheck({
  title,
  path,
  children,
}: {
  title: string;
  path: string;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<CheckStatus>(CHECKING);

  useEffect(() => {
    api(path).then(
      () => setStatus({ tone: 'succes', label: 'En marche' }),
      () => setStatus({ tone: 'danger', label: 'Injoignable' }),
    );
  }, [path]);

  return (
    <CheckCard
      title={title}
      status={status}
      how={
        <p>
          Ouvrir <a href={`/api${path}`}>/api{path}</a>
        </p>
      }
    >
      {children}
    </CheckCard>
  );
}
