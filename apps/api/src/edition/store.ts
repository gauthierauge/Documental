import { and, asc, eq, gt, lt } from 'drizzle-orm';
import {
  type CommittedOperation,
  DOCUMENT_CONTENT_MAX,
  type OperationSubmission,
  type SubmissionResult,
} from '@documental/contracts/edition';
import {
  apply,
  baseLength,
  isWellFormed,
  OperationError,
  transform,
} from '@documental/contracts/text-operation';
import type { Db } from '@/db/client';
import { document, documentOperation, user } from '@/db/schema';

export class EditionError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 413,
    message: string,
  ) {
    super(message);
  }
}

const committedColumns = {
  id: documentOperation.operationId,
  revision: documentOperation.revision,
  operation: documentOperation.operation,
  authorId: user.id,
  authorName: user.name,
};

type CommittedRow = {
  id: string;
  revision: number;
  operation: (number | string)[];
  authorId: string | null;
  authorName: string | null;
};

function toCommitted(row: CommittedRow): CommittedOperation {
  return {
    id: row.id,
    revision: row.revision,
    operation: row.operation,
    author: row.authorId && row.authorName ? { id: row.authorId, name: row.authorName } : null,
  };
}

type Executor = Pick<Db, 'select'>;

function operationsBetween(
  db: Executor,
  documentId: string,
  after: number,
  before?: number,
): Promise<CommittedRow[]> {
  const range = [
    eq(documentOperation.documentId, documentId),
    gt(documentOperation.revision, after),
  ];
  if (before !== undefined) range.push(lt(documentOperation.revision, before));
  return db
    .select(committedColumns)
    .from(documentOperation)
    .leftJoin(user, eq(user.id, documentOperation.userId))
    .where(and(...range))
    .orderBy(asc(documentOperation.revision));
}

export class EditionStore {
  constructor(private readonly db: Db) {}

  async content(documentId: string): Promise<{ content: string; revision: number } | null> {
    const [row] = await this.db
      .select({ content: document.content, revision: document.revision })
      .from(document)
      .where(and(eq(document.id, documentId), eq(document.kind, 'text')));
    return row ?? null;
  }

  async since(documentId: string, revision: number): Promise<CommittedOperation[]> {
    return (await operationsBetween(this.db, documentId, revision)).map(toCommitted);
  }

  submit(
    documentId: string,
    submission: OperationSubmission,
    userId: string,
  ): Promise<SubmissionResult> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ content: document.content, revision: document.revision })
        .from(document)
        .where(and(eq(document.id, documentId), eq(document.kind, 'text')))
        .for('update');
      if (!current) throw new EditionError(404, 'Document introuvable');
      if (submission.base > current.revision) {
        throw new EditionError(409, 'Version inconnue : rechargez le document.');
      }

      const [already] = await tx
        .select({ revision: documentOperation.revision })
        .from(documentOperation)
        .where(
          and(
            eq(documentOperation.documentId, documentId),
            eq(documentOperation.operationId, submission.id),
          ),
        );
      if (already) {
        const missed = await operationsBetween(tx, documentId, submission.base, already.revision);
        return { revision: already.revision, missed: missed.map(toCommitted) };
      }

      const concurrent = await operationsBetween(tx, documentId, submission.base);
      let operation = submission.operation;
      let content: string;
      try {
        for (const other of concurrent) operation = transform(other.operation, operation)[1];
        if (baseLength(operation) !== current.content.length) {
          throw new OperationError('Modification incompatible avec le texte.');
        }
        content = apply(current.content, operation);
      } catch (error) {
        if (error instanceof OperationError) throw new EditionError(409, error.message);
        throw error;
      }
      if (!isWellFormed(content)) throw new EditionError(400, 'Texte invalide.');
      if (content.length > DOCUMENT_CONTENT_MAX) {
        throw new EditionError(413, `Le document dépasse ${DOCUMENT_CONTENT_MAX} caractères.`);
      }

      const revision = current.revision + 1;
      await tx.insert(documentOperation).values({
        documentId,
        revision,
        operationId: submission.id,
        operation,
        userId,
      });
      await tx
        .update(document)
        .set({ content, revision, updatedBy: userId, updatedAt: new Date() })
        .where(eq(document.id, documentId));
      return { revision, missed: concurrent.map(toCommitted) };
    });
  }
}
