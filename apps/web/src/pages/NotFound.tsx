import { ButtonLink } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Page } from '@/ui/Page';

export function NotFound() {
  return (
    <Page title="Page introuvable">
      <EmptyState
        title="Cette adresse ne mène nulle part."
        action={<ButtonLink href="/documents">Revenir aux documents</ButtonLink>}
      >
        Le lien est peut-être ancien, ou mal recopié.
      </EmptyState>
    </Page>
  );
}
