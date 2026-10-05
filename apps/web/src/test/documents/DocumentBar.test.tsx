import { render, screen } from '@testing-library/react';
import { SaveState } from '@/documents/DocumentBar';

describe('État d’enregistrement', () => {
  it('dit que tout est enregistré', () => {
    render(
      <SaveState state={{ status: 'enregistre', message: null, canEdit: true, ready: true }} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Enregistré');
  });

  it('rassure hors ligne et signale la lecture seule', () => {
    render(
      <SaveState state={{ status: 'hors-ligne', message: null, canEdit: false, ready: true }} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Hors ligne · modifications gardées');
    expect(screen.getByText('Lecture seule')).toBeInTheDocument();
  });

  it('propose de recharger après une erreur', () => {
    render(
      <SaveState
        state={{ status: 'erreur', message: 'Le document a changé', canEdit: true, ready: true }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Le document a changé');
    expect(screen.getByRole('button', { name: 'Recharger' })).toBeInTheDocument();
  });
});
