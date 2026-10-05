import { eq, isNull, type SQL } from 'drizzle-orm';
import {
  compareDocuments,
  type DocumentCrumb,
  type DocumentItem,
  type DocumentKind,
  type FolderSummary,
} from '@documental/contracts/documents';
import type { Db } from '@/db/client';
import { document, user } from '@/db/schema';

const MAX_DEPTH = 64;

export class NameTakenError extends Error {
  constructor() {
    super('Un élément porte déjà ce nom dans ce dossier.');
  }
}

function isUniqueViolation(error: unknown): boolean {
  for (let e: unknown = error; e; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === '23505') return true;
  }
  return false;
}

const columns = {
  id: document.id,
  kind: document.kind,
  name: document.name,
  parentId: document.parentId,
  createdAt: document.createdAt,
  updatedAt: document.updatedAt,
  updatedById: document.updatedBy,
  updatedByName: user.name,
};

type Row = {
  id: string;
  kind: DocumentKind;
  name: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  updatedById: string | null;
  updatedByName: string | null;
};

function toItem(row: Row): DocumentItem {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    parentId: row.parentId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    updatedBy:
      row.updatedById && row.updatedByName
        ? { id: row.updatedById, name: row.updatedByName }
        : null,
  };
}

export class DocumentStore {
  constructor(private readonly db: Db) {}

  private select(where: SQL | undefined) {
    return this.db
      .select(columns)
      .from(document)
      .leftJoin(user, eq(user.id, document.updatedBy))
      .where(where);
  }

  async get(id: string): Promise<DocumentItem | null> {
    const [row] = await this.select(eq(document.id, id));
    return row ? toItem(row) : null;
  }

  async list(parentId: string | null): Promise<DocumentItem[]> {
    const rows = await this.select(
      parentId ? eq(document.parentId, parentId) : isNull(document.parentId),
    );
    return rows.map(toItem).sort(compareDocuments);
  }

  async folders(): Promise<FolderSummary[]> {
    const rows = await this.db
      .select({ id: document.id, name: document.name, parentId: document.parentId })
      .from(document)
      .where(eq(document.kind, 'folder'));
    return rows.sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
  }

  async path(id: string | null): Promise<DocumentCrumb[]> {
    const crumbs: DocumentCrumb[] = [];
    let current = id;
    while (current && crumbs.length < MAX_DEPTH) {
      const [row] = await this.db
        .select({ id: document.id, name: document.name, parentId: document.parentId })
        .from(document)
        .where(eq(document.id, current));
      if (!row) break;
      crumbs.unshift({ id: row.id, name: row.name });
      current = row.parentId;
    }
    return crumbs;
  }

  async isInside(folderId: string | null, ancestorId: string): Promise<boolean> {
    const path = await this.path(folderId);
    return path.some((crumb) => crumb.id === ancestorId);
  }

  async create(input: {
    parentId: string | null;
    kind: DocumentKind;
    name: string;
    userId: string;
  }): Promise<DocumentItem> {
    const now = new Date();
    try {
      const [created] = await this.db
        .insert(document)
        .values({
          parentId: input.parentId,
          kind: input.kind,
          name: input.name,
          createdBy: input.userId,
          createdAt: now,
          updatedBy: input.userId,
          updatedAt: now,
        })
        .returning({ id: document.id });
      return (await this.get(created?.id ?? '')) as DocumentItem;
    } catch (error) {
      if (isUniqueViolation(error)) throw new NameTakenError();
      throw error;
    }
  }

  async update(
    id: string,
    changes: { name?: string | undefined; parentId?: string | null | undefined },
    userId: string,
  ): Promise<DocumentItem | null> {
    try {
      await this.db
        .update(document)
        .set({
          ...(changes.name === undefined ? {} : { name: changes.name }),
          ...(changes.parentId === undefined ? {} : { parentId: changes.parentId }),
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(document.id, id));
    } catch (error) {
      if (isUniqueViolation(error)) throw new NameTakenError();
      throw error;
    }
    return this.get(id);
  }

  async remove(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(document)
      .where(eq(document.id, id))
      .returning({ id: document.id });
    return deleted.length > 0;
  }
}
