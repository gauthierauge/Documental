import { useEffect, useState } from 'react';
import { Collaborators } from '@/invitations/Collaborators';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Field';
import { usePopover } from '@/ui/usePopover';
import '@/invitations/invitations.css';

export function documentLink(documentId: string): string {
  return new URL(`/documents/${encodeURIComponent(documentId)}`, window.location.origin).toString();
}

export function SharePanel({
  documentId,
  documentName,
  userId,
  canWrite,
  online,
}: {
  documentId: string;
  documentName: string;
  userId: string;
  canWrite: boolean;
  online: ReadonlySet<string>;
}) {
  const popover = usePopover();
  const [copied, setCopied] = useState<'ok' | 'erreur' | null>(null);
  const link = documentLink(documentId);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2_500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied('ok');
    } catch {
      setCopied('erreur');
    }
  }

  return (
    <div className="inv-partage">
      <Button variant="primaire" {...popover.triggerProps}>
        Partager
      </Button>
      <div
        {...popover.panelProps}
        role="dialog"
        aria-label={`Partager « ${documentName} »`}
        className="inv-popover"
      >
        <div className="inv-entete">
          <h2 className="inv-popover-titre">Partager « {documentName} »</h2>
          <Button variant="discret" aria-label="Fermer" onClick={popover.close}>
            ✕
          </Button>
        </div>
        <div className="inv-lien">
          <Input
            readOnly
            value={link}
            aria-label="Lien du document"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button onClick={copy}>{copied === 'ok' ? 'Copié' : 'Copier le lien'}</Button>
        </div>
        <p className="inv-role" role="status">
          {copied === 'erreur'
            ? 'Copie impossible : sélectionnez le lien et copiez-le à la main.'
            : copied === 'ok'
              ? 'Lien copié.'
              : 'Toute personne qui a un compte peut ouvrir ce lien et lire. Pour écrire, il faut être invité.'}
        </p>
        {popover.open && (
          <Collaborators
            documentId={documentId}
            userId={userId}
            canWrite={canWrite}
            online={online}
          />
        )}
      </div>
    </div>
  );
}
