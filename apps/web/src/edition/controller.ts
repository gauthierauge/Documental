import type {
  CommittedOperation,
  DocumentContent,
  OperationsSince,
  ServerMessage,
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

export interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export type Connect = (path: string) => SocketLike;

export interface ControllerOptions {
  storage?: EditionStorage | null;
  connect?: Connect | null;
  delayMs?: number;
  retryMs?: readonly number[];
  ackTimeoutMs?: number;
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

export function browserConnect(): Connect | null {
  if (!('WebSocket' in globalThis) || !('location' in globalThis)) return null;
  return (path) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return new window.WebSocket(`${protocol}//${window.location.host}${path}`) as SocketLike;
  };
}

export class EditionController {
  private session: EditionSession | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private stopped = false;
  private failures = 0;
  private socket: SocketLike | null = null;
  private live = false;
  private sentId: string | null = null;
  private ackTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly storage: EditionStorage | null;
  private readonly connect: Connect | null;
  private readonly delayMs: number;
  private readonly retryMs: readonly number[];
  private readonly ackTimeoutMs: number;

  constructor(
    private readonly documentId: string,
    private readonly storageKey: string,
    private readonly events: EditionEvents,
    options: ControllerOptions = {},
  ) {
    this.storage = options.storage === undefined ? browserStorage() : options.storage;
    this.connect = options.connect === undefined ? browserConnect() : options.connect;
    this.delayMs = options.delayMs ?? (this.connect ? 100 : 400);
    this.retryMs = options.retryMs ?? RETRY_MS;
    this.ackTimeoutMs = options.ackTimeoutMs ?? 10_000;
  }

  get pending(): boolean {
    return this.session?.pending ?? false;
  }

  private get path(): string {
    return `/documents/${encodeURIComponent(this.documentId)}`;
  }

  async start(): Promise<{ text: string; canEdit: boolean }> {
    this.events.status('chargement');
    const server = await api<DocumentContent>(`${this.path}/contenu`);
    this.session = EditionSession.fresh(server.content, server.revision);
    const stored = this.read();
    if (stored && stored.revision <= server.revision) {
      try {
        const restored = new EditionSession(stored);
        const { operations } = await api<OperationsSince>(
          `${this.path}/operations?depuis=${stored.revision}`,
        );
        for (const operation of operations) restored.remote(operation);
        this.session = restored;
      } catch {
        this.forget();
      }
    } else {
      this.forget();
    }
    if (this.connect) {
      this.events.status(this.session.pending ? 'hors-ligne' : 'enregistre');
      this.open();
    } else {
      this.events.status(this.session.pending ? 'enregistrement' : 'enregistre');
      if (this.session.pending) this.schedule(0);
    }
    return { text: this.session.text, canEdit: server.canEdit };
  }

  change(text: string, caret: number): void {
    const session = this.session;
    if (!session || this.stopped) return;
    const grown = Math.max(0, text.length - session.text.length);
    session.local(diff(session.text, text, caret - grown));
    this.save();
    if (this.connect && !this.live) {
      this.events.status('hors-ligne');
      return;
    }
    if (!this.inFlight && !this.sentId) this.events.status('enregistrement');
    this.schedule(this.delayMs);
  }

  retryNow(): void {
    this.failures = 0;
    if (this.connect) {
      if (!this.socket) this.open();
    } else {
      this.schedule(0);
    }
  }

  stop(): void {
    this.stopped = true;
    for (const timer of [this.timer, this.ackTimer, this.reconnectTimer]) {
      if (timer) clearTimeout(timer);
    }
    this.timer = null;
    this.ackTimer = null;
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onclose = null;
      socket.onmessage = null;
      socket.close();
    }
  }

  private retryDelay(): number {
    const wait = this.retryMs[Math.min(this.failures, this.retryMs.length - 1)] ?? 15_000;
    this.failures += 1;
    return wait;
  }

  private open(): void {
    const session = this.session;
    if (!this.connect || !session || this.stopped || this.socket) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.connect(`/api${this.path}/direct?depuis=${session.revision}`);
    this.socket = socket;
    socket.onmessage = (event) => {
      if (this.socket === socket && typeof event.data === 'string') this.handle(event.data);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.live = false;
      this.sentId = null;
      if (this.ackTimer) clearTimeout(this.ackTimer);
      this.ackTimer = null;
      if (this.stopped) return;
      this.events.status('hors-ligne');
      this.reconnectTimer = setTimeout(() => this.open(), this.retryDelay());
    };
  }

  private restart(): void {
    this.socket?.close();
  }

  private handle(raw: string): void {
    const session = this.session;
    if (!session) return;
    let message: ServerMessage;
    try {
      message = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }
    if (message.type === 'pret') {
      this.live = true;
      this.failures = 0;
      this.events.status(session.pending ? 'enregistrement' : 'enregistre');
      this.schedule(0);
      return;
    }
    if (message.type === 'erreur') {
      if (FATAL.has(message.status)) this.fail(message.message);
      return;
    }
    this.receive(session, message);
  }

  private receive(session: EditionSession, committed: CommittedOperation): void {
    if (committed.revision <= session.revision) return;
    let applied: TextOperation | null;
    try {
      applied = session.remote(committed);
    } catch (error) {
      if (error instanceof OutOfSyncError) this.restart();
      else this.fail('Le document a changé entre-temps : rechargez la page.');
      return;
    }
    if (applied) {
      this.events.remote(session.text, [applied]);
    } else {
      this.sentId = null;
      if (this.ackTimer) clearTimeout(this.ackTimer);
      this.ackTimer = null;
    }
    this.save();
    if (session.pending) this.schedule(this.delayMs);
    else if (this.live) this.events.status('enregistre');
  }

  private schedule(ms: number): void {
    if (this.stopped || this.inFlight) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.connect) this.send();
      else void this.post();
    }, ms);
  }

  private send(): void {
    const session = this.session;
    const socket = this.socket;
    if (!session || !socket || !this.live || this.stopped) return;
    const submission = session.nextSubmission();
    if (!submission) {
      this.events.status('enregistre');
      return;
    }
    if (this.sentId === submission.id) return;
    this.save();
    socket.send(JSON.stringify({ type: 'modification', ...submission }));
    this.sentId = submission.id;
    this.events.status('enregistrement');
    if (this.ackTimer) clearTimeout(this.ackTimer);
    this.ackTimer = setTimeout(() => this.restart(), this.ackTimeoutMs);
  }

  private async post(): Promise<void> {
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
      const result = await api<SubmissionResult>(`${this.path}/operations`, {
        method: 'POST',
        body: JSON.stringify(submission),
      });
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
      this.events.status('hors-ligne');
      this.schedule(this.retryDelay());
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
