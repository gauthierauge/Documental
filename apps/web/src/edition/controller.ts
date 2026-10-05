import type {
  DocumentContent,
  OperationsSince,
  SubmissionResult,
} from '@documental/contracts/edition';
import { diff, type TextOperation } from '@documental/contracts/text-operation';
import { api, ApiError } from '@/api';
import { EditionSession, OutOfSyncError, type SessionState } from '@/edition/session';

export type EditionStatus =
  | 'chargement'
  | 'enregistre'
  | 'enregistrement'
  | 'hors-ligne'
  | 'erreur';

export interface EditionEvents {
  status(status: EditionStatus, message?: string): void;
  remote(text: string, operations: TextOperation[]): void;
}

export type EditionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface ControllerOptions {
  storage?: EditionStorage | null;
  delayMs?: number;
  retryMs?: readonly number[];
}

const FATAL = new Set([400, 401, 403, 404, 409, 413]);
const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 15_000];

export function browserStorage(): EditionStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export class EditionController {
  private session: EditionSession | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private stopped = false;
  private failures = 0;
  private readonly storage: EditionStorage | null;
  private readonly delayMs: number;
  private readonly retryMs: readonly number[];

  constructor(
    private readonly documentId: string,
    private readonly storageKey: string,
    private readonly events: EditionEvents,
    options: ControllerOptions = {},
  ) {
    this.storage = options.storage === undefined ? browserStorage() : options.storage;
    this.delayMs = options.delayMs ?? 400;
    this.retryMs = options.retryMs ?? RETRY_MS;
  }

  get pending(): boolean {
    return this.session?.pending ?? false;
  }

  async start(): Promise<{ text: string; canEdit: boolean }> {
    this.events.status('chargement');
    const path = `/documents/${encodeURIComponent(this.documentId)}`;
    const server = await api<DocumentContent>(`${path}/contenu`);
    this.session = EditionSession.fresh(server.content, server.revision);
    const stored = this.read();
    if (stored && stored.revision <= server.revision) {
      try {
        const restored = new EditionSession(stored);
        const { operations } = await api<OperationsSince>(
          `${path}/operations?depuis=${stored.revision}`,
        );
        for (const operation of operations) restored.remote(operation);
        this.session = restored;
      } catch {
        this.forget();
      }
    } else {
      this.forget();
    }
    this.events.status(this.session.pending ? 'enregistrement' : 'enregistre');
    if (this.session.pending) this.schedule(0);
    return { text: this.session.text, canEdit: server.canEdit };
  }

  change(text: string, caret: number): void {
    const session = this.session;
    if (!session || this.stopped) return;
    const grown = Math.max(0, text.length - session.text.length);
    session.local(diff(session.text, text, caret - grown));
    this.save();
    if (!this.inFlight) this.events.status('enregistrement');
    this.schedule(this.delayMs);
  }

  retryNow(): void {
    this.failures = 0;
    this.schedule(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(ms: number): void {
    if (this.stopped || this.inFlight) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  private async flush(): Promise<void> {
    const session = this.session;
    if (!session || this.stopped || this.inFlight) return;
    const submission = session.nextSubmission();
    if (!submission) {
      this.events.status('enregistre');
      return;
    }
    this.save();
    this.inFlight = true;
    this.events.status('enregistrement');
    try {
      const result = await api<SubmissionResult>(
        `/documents/${encodeURIComponent(this.documentId)}/operations`,
        { method: 'POST', body: JSON.stringify(submission) },
      );
      const applied = session.settle(result);
      if (applied.length) this.events.remote(session.text, applied);
      this.failures = 0;
      this.save();
    } catch (error) {
      this.inFlight = false;
      if (error instanceof OutOfSyncError) {
        this.fail('Le document a changé entre-temps : rechargez la page.');
        return;
      }
      if (error instanceof ApiError && FATAL.has(error.status)) {
        this.fail(error.message);
        return;
      }
      const wait = this.retryMs[Math.min(this.failures, this.retryMs.length - 1)] ?? 15_000;
      this.failures += 1;
      this.events.status('hors-ligne');
      this.schedule(wait);
      return;
    }
    this.inFlight = false;
    if (session.pending) this.schedule(this.delayMs);
    else this.events.status('enregistre');
  }

  private fail(message: string): void {
    this.stop();
    this.events.status('erreur', message);
  }

  private read(): SessionState | null {
    try {
      const raw = this.storage?.getItem(this.storageKey);
      return raw ? (JSON.parse(raw) as SessionState) : null;
    } catch {
      return null;
    }
  }

  private save(): void {
    try {
      if (this.session?.pending) {
        this.storage?.setItem(this.storageKey, JSON.stringify(this.session.snapshot()));
      } else {
        this.storage?.removeItem(this.storageKey);
      }
    } catch {
      return;
    }
  }

  private forget(): void {
    try {
      this.storage?.removeItem(this.storageKey);
    } catch {
      return;
    }
  }
}
