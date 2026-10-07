import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DocumentFile } from '@documental/contracts/documents';
import { Attachments } from '@/documents/Attachments';

function joint(over: Partial<DocumentFile> = {}): DocumentFile {
  return {
    id: 'f1',
    documentId: 'd1',
    name: 'plan.pdf',
    mime: 'application/pdf',
    size: 240_000,
    usage: 'attachment',
    createdAt: '2026-10-05T08:00:00.000Z',
    createdBy: { id: 'u1', name: 'Éa' },
    ...over,
  };
}

function serve(status = 201, body: unknown = { file: joint({ id: 'f2', name: 'note.pdf' }) }) {
  const fetchMock = vi.fn(
    async () =>
      new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function pdf(name = 'note.pdf', size = 10) {
  const file = new File([new Uint8Array(size) as BlobPart], name, { type: 'application/pdf' });
  return file;
}

function champ(): HTMLInputElement {
  return screen.getByLabelText(/PDF, PNG, JPEG/) as HTMLInputElement;
}

describe('Fichiers joints', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('liste les fichiers avec un lien de téléchargement', () => {
    render(<Attachments documentId="d1" files={[joint()]} canWrite canManage onChange={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'plan.pdf' })).toHaveAttribute(
      'href',
      '/api/documents/fichiers/f1',
    );
    expect(screen.getByText(/PDF · 240 ko/)).toBeInTheDocument();
  });

  it('dit ce qu’il faut faire quand il n’y a rien', () => {
    render(<Attachments documentId="d1" files={[]} canWrite canManage onChange={vi.fn()} />);
    expect(screen.getByText('Aucun fichier joint.')).toBeInTheDocument();
  });

  it('n’offre ni envoi ni suppression à un lecteur', () => {
    render(
      <Attachments
        documentId="d1"
        files={[joint()]}
        canWrite={false}
        canManage={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/PDF, PNG, JPEG/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Supprimer/ })).toBeNull();
  });

  it('laisse envoyer sans pouvoir supprimer quand on écrit sans gérer', () => {
    render(
      <Attachments
        documentId="d1"
        files={[joint()]}
        canWrite
        canManage={false}
        onChange={vi.fn()}
      />,
    );
    expect(champ()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer/ })).toBeNull();
  });

  it('envoie le fichier choisi et remonte la liste à jour', async () => {
    const fetchMock = serve();
    const onChange = vi.fn();
    render(<Attachments documentId="d1" files={[]} canWrite canManage onChange={onChange} />);

    fireEvent.change(champ(), { target: { files: [pdf()] } });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/documents/fichiers/d1');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(onChange.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ name: 'note.pdf' })]);
  });

  it('refuse un fichier trop gros sans appeler l’API', async () => {
    const fetchMock = serve();
    render(<Attachments documentId="d1" files={[]} canWrite canManage onChange={vi.fn()} />);

    fireEvent.change(champ(), { target: { files: [pdf('enorme.pdf', 25_000_001)] } });

    expect(await screen.findByRole('alert')).toHaveTextContent(/dépasse 25 Mo/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('affiche le refus de l’API', async () => {
    serve(415, { error: 'Type de fichier non accepté : PDF, PNG, JPEG, WebP ou GIF.' });
    render(<Attachments documentId="d1" files={[]} canWrite canManage onChange={vi.fn()} />);

    fireEvent.change(champ(), { target: { files: [pdf()] } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Type de fichier non accepté');
  });

  it('supprime un fichier et le retire de la liste', async () => {
    const fetchMock = serve(204);
    const onChange = vi.fn();
    render(
      <Attachments documentId="d1" files={[joint()]} canWrite canManage onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer plan.pdf' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith([]));
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/documents/fichiers/f1');
    expect(init.method).toBe('DELETE');
  });

  it('envoie aussi un fichier déposé', async () => {
    const fetchMock = serve();
    render(<Attachments documentId="d1" files={[]} canWrite canManage onChange={vi.fn()} />);

    const zone = screen.getByText(/PDF, PNG, JPEG/).parentElement as HTMLElement;
    fireEvent.drop(zone, { dataTransfer: { files: [pdf()] } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});
