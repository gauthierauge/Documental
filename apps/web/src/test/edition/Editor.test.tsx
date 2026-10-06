import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Editor, presentPeople } from '@/edition/Editor';

interface FauxControleur {
  changes: [string, number][];
  curseurs: [number, number][];
}

const { controleurs, texteInitial } = vi.hoisted(() => ({
  controleurs: [] as FauxControleur[],
  texteInitial: { value: 'Avant après' },
}));

vi.mock('@/edition/controller', () => {
  class Fake {
    readonly changes: [string, number][] = [];
    readonly curseurs: [number, number][] = [];
    constructor(
      readonly documentId: string,
      readonly storageKey: string,
      readonly events: { status: (s: string) => void },
    ) {
      controleurs.push(this as FauxControleur);
    }
    get pending() {
      return false;
    }
    async start() {
      return { text: texteInitial.value, canEdit: true };
    }
    change(text: string, caret: number) {
      this.changes.push([text, caret]);
    }
    moveCursor(start: number, end: number) {
      this.curseurs.push([start, end]);
    }
    retryNow() {}
    stop() {}
  }
  return { EditionController: Fake };
});

describe('Personnes présentes', () => {
  it('liste les autres une seule fois chacun, sans moi', () => {
    const cursor = (key: string, id: string, name: string) => ({
      key,
      user: { id, name },
      start: 0,
      end: 0,
    });
    expect(
      presentPeople(
        [
          cursor('a', 'u2', 'Zoé'),
          cursor('b', 'u3', 'Bob'),
          cursor('c', 'u2', 'Zoé'),
          cursor('d', 'u1', 'Moi'),
        ],
        'u1',
      ),
    ).toEqual([
      { id: 'u3', name: 'Bob' },
      { id: 'u2', name: 'Zoé' },
    ]);
  });
});

function zone(): HTMLTextAreaElement {
  return screen.getByLabelText('Contenu du document') as HTMLTextAreaElement;
}

async function monter(props: Partial<Parameters<typeof Editor>[0]> = {}) {
  const view = render(<Editor documentId="d1" userId="u1" {...props} />);
  await waitFor(() => expect(zone()).toBeEnabled());
  return { view, controleur: controleurs[controleurs.length - 1] as FauxControleur };
}

describe('Insertion dans le texte', () => {
  beforeEach(() => {
    controleurs.length = 0;
    texteInitial.value = 'Avant après';
  });

  it('insère au curseur et passe par le contrôleur, jamais par une écriture directe', async () => {
    const { view, controleur } = await monter();
    zone().setSelectionRange(5, 5);

    view.rerender(<Editor documentId="d1" userId="u1" insert={{ text: ' ICI', nonce: 1 }} />);

    expect(zone()).toHaveValue('Avant ICI après');
    expect(controleur.changes).toEqual([['Avant ICI après', 9]]);
  });

  it('remplace la sélection et replace le curseur après le texte inséré', async () => {
    const { view } = await monter();
    zone().setSelectionRange(0, 5);

    view.rerender(<Editor documentId="d1" userId="u1" insert={{ text: 'Après', nonce: 1 }} />);

    expect(zone()).toHaveValue('Après après');
    expect(zone().selectionStart).toBe(5);
  });

  it('annonce la nouvelle position du curseur aux autres', async () => {
    const { view, controleur } = await monter();
    zone().setSelectionRange(0, 0);

    view.rerender(<Editor documentId="d1" userId="u1" insert={{ text: 'Hop', nonce: 1 }} />);

    expect(controleur.curseurs.at(-1)).toEqual([3, 3]);
  });

  it('n’insère rien dans un document en lecture seule', async () => {
    const { view, controleur } = await monter();
    zone().readOnly = true;

    view.rerender(<Editor documentId="d1" userId="u1" insert={{ text: 'Non', nonce: 1 }} />);

    expect(zone()).toHaveValue('Avant après');
    expect(controleur.changes).toEqual([]);
  });
});

describe('Images déposées ou collées', () => {
  beforeEach(() => {
    controleurs.length = 0;
    texteInitial.value = 'Avant après';
  });

  it('remonte une image collée, sans la laisser au navigateur', async () => {
    const onFiles = vi.fn();
    await monter({ onFiles });
    const image = new File([new Uint8Array(4) as BlobPart], 'a.png', { type: 'image/png' });

    fireEvent.paste(zone(), { clipboardData: { files: [image], items: [] } });

    expect(onFiles).toHaveBeenCalledWith([image]);
  });

  it('ignore un collage de texte', async () => {
    const onFiles = vi.fn();
    await monter({ onFiles });

    fireEvent.paste(zone(), { clipboardData: { files: [], items: [] } });

    expect(onFiles).not.toHaveBeenCalled();
  });

  it('remonte une image déposée', async () => {
    const onFiles = vi.fn();
    await monter({ onFiles });
    const image = new File([new Uint8Array(4) as BlobPart], 'a.png', { type: 'image/png' });

    fireEvent.drop(zone(), { dataTransfer: { files: [image], items: [] } });

    expect(onFiles).toHaveBeenCalledWith([image]);
  });

  it('ignore un dépôt de PDF : il se joint, il ne s’insère pas', async () => {
    const onFiles = vi.fn();
    await monter({ onFiles });
    const pdf = new File([new Uint8Array(4) as BlobPart], 'a.pdf', { type: 'application/pdf' });

    fireEvent.drop(zone(), { dataTransfer: { files: [pdf], items: [] } });

    expect(onFiles).not.toHaveBeenCalled();
  });
});
