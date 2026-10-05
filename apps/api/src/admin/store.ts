import { and, asc, count, desc, eq, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { contentTables } from '@/db/schema';
import type { EntityConfig } from '@documental/contracts/admin-types';
import { titleField } from '@documental/contracts/admin-types';

type AnyTable = any;
type AnyDb = any;

export type Row = Record<string, unknown> & { id: string };

export interface ListQuery {
  q?: string;
  page?: number;
  perPage?: number;
  sort?: string;
  dir?: 'asc' | 'desc';
  archived?: boolean;
  filters?: Record<string, string>;
}

const SEARCHABLE = new Set(['texte', 'texte_long', 'email', 'telephone', 'liste']);

export class ContentStore {
  private readonly db: AnyDb;

  constructor(db: Db) {
    this.db = db;
  }

  private table(entity: EntityConfig): AnyTable {
    const table = (contentTables as Record<string, AnyTable>)[entity.key];
    if (!table) throw new Error(`Table absente du schéma : ${entity.key}`);
    return table;
  }

  private where(entity: EntityConfig, query: ListQuery): SQL | undefined {
    const t = this.table(entity);
    const parts: (SQL | undefined)[] = [
      query.archived ? isNotNull(t.archived_at) : isNull(t.archived_at),
    ];
    const q = query.q?.trim().toLowerCase();
    if (q) {
      const pattern = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      const fields = entity.fields.filter((f) => SEARCHABLE.has(f.type));
      if (fields.length)
        parts.push(or(...fields.map((f) => sql`lower(${t[f.key]}) like ${pattern} escape '\\'`)));
    }
    for (const [key, value] of Object.entries(query.filters ?? {})) {
      const field = entity.fields.find((f) => f.key === key);
      if (field?.type === 'liste' || field?.type === 'lien') parts.push(eq(t[key], value));
      if (field?.type === 'oui_non') parts.push(eq(t[key], value === 'true'));
    }
    return and(...parts);
  }

  async list(entity: EntityConfig, query: ListQuery = {}): Promise<{ rows: Row[]; total: number }> {
    const t = this.table(entity);
    const perPage = Math.min(Math.max(query.perPage ?? 25, 1), 100);
    const page = Math.max(query.page ?? 1, 1);
    const dateField = entity.fields.find((f) => f.type === 'date')?.key;
    const requested =
      query.sort && entity.fields.some((f) => f.key === query.sort) ? query.sort : undefined;
    const sortable = requested ?? dateField ?? 'created_at';
    const order = (query.dir ?? (requested ? 'asc' : 'desc')) === 'asc' ? asc : desc;
    const where = this.where(entity, query);
    const rows = await this.db
      .select()
      .from(t)
      .where(where)
      .orderBy(order(t[sortable]), desc(t.created_at), desc(t.id))
      .limit(perPage)
      .offset((page - 1) * perPage);
    const [counted] = await this.db.select({ n: count() }).from(t).where(where);
    return { rows, total: Number(counted?.n ?? 0) };
  }

  async get(entity: EntityConfig, id: string): Promise<Row | null> {
    const t = this.table(entity);
    const [row] = await this.db.select().from(t).where(eq(t.id, id)).limit(1);
    return row ?? null;
  }

  async exists(entityKey: string, id: string): Promise<boolean> {
    const t = (contentTables as Record<string, AnyTable>)[entityKey];
    if (!t) return false;
    const [row] = await this.db.select({ id: t.id }).from(t).where(eq(t.id, id)).limit(1);
    return Boolean(row);
  }

  async create(entity: EntityConfig, values: Record<string, unknown>): Promise<Row> {
    const [row] = await this.db.insert(this.table(entity)).values(values).returning();
    return row;
  }

  async update(
    entity: EntityConfig,
    id: string,
    values: Record<string, unknown>,
  ): Promise<Row | null> {
    const t = this.table(entity);
    const [row] = await this.db
      .update(t)
      .set({ ...values, updated_at: new Date() })
      .where(eq(t.id, id))
      .returning();
    return row ?? null;
  }

  async setArchived(entity: EntityConfig, id: string, archived: boolean): Promise<Row | null> {
    const t = this.table(entity);
    const [row] = await this.db
      .update(t)
      .set({ archived_at: archived ? new Date() : null, updated_at: new Date() })
      .where(eq(t.id, id))
      .returning();
    return row ?? null;
  }

  async options(entity: EntityConfig): Promise<{ id: string; label: string }[]> {
    const t = this.table(entity);
    const title = titleField(entity);
    const rows: Row[] = await this.db
      .select()
      .from(t)
      .where(isNull(t.archived_at))
      .orderBy(title ? asc(t[title.key]) : desc(t.created_at))
      .limit(500);
    return rows.map((r) => ({
      id: r.id,
      label: String((title && r[title.key]) || r.id.slice(0, 8)),
    }));
  }

  async labels(entity: EntityConfig, ids: string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    const t = this.table(entity);
    const title = titleField(entity);
    const rows: Row[] = await this.db
      .select()
      .from(t)
      .where(or(...ids.map((id) => eq(t.id, id))));
    return Object.fromEntries(
      rows.map((r) => [r.id, String((title && r[title.key]) || r.id.slice(0, 8))]),
    );
  }

  async count(entity: EntityConfig, filters: Record<string, string> = {}): Promise<number> {
    const t = this.table(entity);
    const [counted] = await this.db
      .select({ n: count() })
      .from(t)
      .where(this.where(entity, { filters }));
    return Number(counted?.n ?? 0);
  }

  async all(entity: EntityConfig): Promise<Row[]> {
    const t = this.table(entity);
    return this.db.select().from(t).where(isNull(t.archived_at)).orderBy(desc(t.created_at));
  }
}
