import { createHash } from 'node:crypto';
import { and, count, eq, sql, sum } from 'drizzle-orm';
import type { DocumentFile, FileMime, FileUsage } from '@documental/contracts/documents';
import type { Db } from '@/db/client';
import { document, documentFile, user } from '@/db/schema';

export class FileNameTakenError extends Error {
  constructor() {
    super('Un fichier porte déjà ce nom sur ce document.');
  }
}

export class TooManyFilesError extends Error {
  constructor(max: number) {
    super(`Ce document a déjà ${max} fichiers.`);
  }
}

function isUniqueViolation(error: unknown): boolean {
  for (let e: unknown = error; e; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === '23505') return true;
  }
  return false;
}

const columns = {
  id: documentFile.id,
  documentId: documentFile.documentId,
  name: documentFile.name,
  mime: documentFile.mime,
  size: documentFile.size,
  usage: documentFile.usage,
  createdAt: documentFile.createdAt,
  createdById: documentFile.createdBy,
  createdByName: user.name,
};

type Row = {
  id: string;
  documentId: string;
  name: string;
  mime: string;
  size: number;
  usage: FileUsage;
  createdAt: Date;
  createdById: string | null;
  createdByName: string | null;
};

function toFile(row: Row): DocumentFile {
  return {
    id: row.id,
    documentId: row.documentId,
    name: row.name,
    mime: row.mime as FileMime,
    size: row.size,
    usage: row.usage,
    createdAt: row.createdAt.toISOString(),
    createdBy:
      row.createdById && row.createdByName
        ? { id: row.createdById, name: row.createdByName }
        : null,
  };
}

export class DocumentFileStore {
  constructor(private readonly db: Db) {}

  async list(documentId: string): Promise<DocumentFile[]> {
    const rows = await this.db
      .select(columns)
      .from(documentFile)
      .leftJoin(user, eq(user.id, documentFile.createdBy))
      .where(eq(documentFile.documentId, documentId));
    return rows.map(toFile).sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
  }

  async get(id: string): Promise<DocumentFile | null> {
    const [row] = await this.db
      .select(columns)
      .from(documentFile)
      .leftJoin(user, eq(user.id, documentFile.createdBy))
      .where(eq(documentFile.id, id));
    return row ? toFile(row) : null;
  }

  async bytes(id: string): Promise<{ bytes: Uint8Array; sha256: string } | null> {
    const [row] = await this.db
      .select({ bytes: documentFile.bytes, sha256: documentFile.sha256 })
      .from(documentFile)
      .where(eq(documentFile.id, id));
    return row ? { bytes: row.bytes, sha256: row.sha256 } : null;
  }

  async bytesFor(documentId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: sum(documentFile.size) })
      .from(documentFile)
      .where(eq(documentFile.documentId, documentId));
    return Number(row?.total ?? 0);
  }

  async countFor(documentId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(documentFile)
      .where(eq(documentFile.documentId, documentId));
    return row?.total ?? 0;
  }

  async findByDigest(documentId: string, sha256: string): Promise<DocumentFile | null> {
    const [row] = await this.db
      .select(columns)
      .from(documentFile)
      .leftJoin(user, eq(user.id, documentFile.createdBy))
      .where(and(eq(documentFile.documentId, documentId), eq(documentFile.sha256, sha256)));
    return row ? toFile(row) : null;
  }

  async add(input: {
    documentId: string;
    name: string;
    mime: FileMime;
    usage: FileUsage;
    bytes: Uint8Array;
    userId: string;
  }): Promise<DocumentFile> {
    const sha256 = createHash('sha256').update(input.bytes).digest('hex');
    try {
      const [created] = await this.db
        .insert(documentFile)
        .values({
          documentId: input.documentId,
          name: input.name,
          mime: input.mime,
          size: input.bytes.byteLength,
          sha256,
          usage: input.usage,
          bytes: input.bytes,
          createdBy: input.userId,
          createdAt: new Date(),
        })
        .returning({ id: documentFile.id });
      return (await this.get(created?.id ?? '')) as DocumentFile;
    } catch (error) {
      if (isUniqueViolation(error)) throw new FileNameTakenError();
      throw error;
    }
  }

  async remove(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(documentFile)
      .where(eq(documentFile.id, id))
      .returning({ id: documentFile.id });
    return deleted.length > 0;
  }

  async collectOrphans(before: Date): Promise<number> {
    const deleted = await this.db
      .delete(documentFile)
      .where(
        and(
          eq(documentFile.usage, 'inline'),
          sql`${documentFile.createdAt} < ${before}`,
          sql`not exists (select 1 from ${document} d
            where d.id = ${documentFile.documentId} and strpos(d.content, ${documentFile.id}) > 0)`,
        ),
      )
      .returning({ id: documentFile.id });
    return deleted.length;
  }
}

export function freeName(taken: Set<string>, name: string): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base} (${n})${extension}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base} (${crypto.randomUUID().slice(0, 8)})${extension}`;
}
