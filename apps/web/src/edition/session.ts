import type {
  CommittedOperation,
  OperationSubmission,
  SubmissionResult,
} from '@documental/contracts/edition';
import {
  apply,
  compose,
  isNoop,
  type TextOperation,
  transform,
} from '@documental/contracts/text-operation';

export interface SessionState {
  text: string;
  revision: number;
  outstanding: { id: string; operation: TextOperation } | null;
  buffer: TextOperation | null;
}

export class OutOfSyncError extends Error {}

export class EditionSession {
  private state: SessionState;

  constructor(
    initial: SessionState,
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {
    this.state = structuredClone(initial);
  }

  static fresh(text: string, revision: number): EditionSession {
    return new EditionSession({ text, revision, outstanding: null, buffer: null });
  }

  get text(): string {
    return this.state.text;
  }

  get revision(): number {
    return this.state.revision;
  }

  get pending(): boolean {
    return this.state.outstanding !== null || this.state.buffer !== null;
  }

  get sending(): boolean {
    return this.state.outstanding !== null;
  }

  snapshot(): SessionState {
    return structuredClone(this.state);
  }

  local(operation: TextOperation): void {
    if (isNoop(operation)) return;
    this.state.text = apply(this.state.text, operation);
    this.state.buffer = this.state.buffer ? compose(this.state.buffer, operation) : operation;
  }

  nextSubmission(): OperationSubmission | null {
    if (!this.state.outstanding && this.state.buffer) {
      this.state.outstanding = { id: this.newId(), operation: this.state.buffer };
      this.state.buffer = null;
    }
    const { outstanding } = this.state;
    return outstanding
      ? { id: outstanding.id, base: this.state.revision, operation: outstanding.operation }
      : null;
  }

  remote(committed: CommittedOperation): TextOperation | null {
    if (committed.revision !== this.state.revision + 1) {
      throw new OutOfSyncError('Version inattendue.');
    }
    if (this.state.outstanding?.id === committed.id) {
      this.acknowledge(committed.revision);
      return null;
    }
    let operation = committed.operation;
    if (this.state.outstanding) {
      const [theirs, mine] = transform(operation, this.state.outstanding.operation);
      operation = theirs;
      this.state.outstanding.operation = mine;
    }
    if (this.state.buffer) {
      const [theirs, mine] = transform(operation, this.state.buffer);
      operation = theirs;
      this.state.buffer = mine;
    }
    this.state.text = apply(this.state.text, operation);
    this.state.revision = committed.revision;
    return operation;
  }

  acknowledge(revision: number): void {
    this.state.outstanding = null;
    this.state.revision = revision;
  }

  settle(result: SubmissionResult): TextOperation[] {
    const applied: TextOperation[] = [];
    for (const missed of result.missed) {
      const operation = this.remote(missed);
      if (operation) applied.push(operation);
    }
    if (result.revision !== this.state.revision + 1) {
      throw new OutOfSyncError('Version inattendue.');
    }
    this.acknowledge(result.revision);
    return applied;
  }
}
