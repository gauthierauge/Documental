// Schéma de la base. Généré par le kit, puis à toi : modifie-le, puis `bun run db:generate`
// pour écrire la migration. Les contenus du panel admin se déclarent dans admin.config.ts.
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

// --- Authentification (Better Auth). Les noms des clés sont imposés par Better Auth.

export const user = pgTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('lecteur'),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const session = pgTable('session', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const verification = pgTable('verification', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const twoFactor = pgTable('two_factor', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  secret: text('secret').notNull(),
  backupCodes: text('backup_codes').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  verified: boolean('verified').notNull().default(true),
  failedVerificationCount: integer('failed_verification_count').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
});

// --- Panel admin : journal d'activité et réglages de l'app.

export const auditLog = pgTable('audit_log', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  at: timestamp('at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  userId: text('user_id'),
  userEmail: text('user_email').notNull(),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  summary: text('summary').notNull(),
  changes: jsonb('changes'),
});

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedBy: text('updated_by'),
});

// --- Contenus gérés dans le panel admin (admin.config.ts).

export const clients = pgTable('clients', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  nom: text('nom').notNull(),
  email: text('email'),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  archived_at: timestamp('archived_at', { withTimezone: true }),
});

export const document = pgTable(
  'document',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    parentId: text('parent_id').references((): AnyPgColumn => document.id, {
      onDelete: 'cascade',
    }),
    kind: text('kind', { enum: ['folder', 'text', 'file'] }).notNull(),
    name: text('name').notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    content: text('content').notNull().default(''),
    revision: integer('revision').notNull().default(0),
  },
  (t) => [
    index('document_parent_idx').on(t.parentId),
    unique('document_name_unique').on(t.parentId, t.name).nullsNotDistinct(),
  ],
);

export const documentCollaborator = pgTable(
  'document_collaborator',
  {
    documentId: text('document_id')
      .notNull()
      .references(() => document.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    invitedBy: text('invited_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.documentId, t.userId] }),
    index('document_collaborator_user_idx').on(t.userId),
  ],
);

export const documentOperation = pgTable(
  'document_operation',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => document.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    operationId: text('operation_id').notNull(),
    operation: jsonb('operation').$type<(number | string)[]>().notNull(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    unique('document_operation_revision_unique').on(t.documentId, t.revision),
    unique('document_operation_id_unique').on(t.documentId, t.operationId),
  ],
);

/** Les tables des contenus, par clé : le panel admin les retrouve ici. */
export const contentTables = {
  clients: clients,
};

// --- Limitation de débit : un compteur par clé (« api:<adresse IP> », « auth:… »), fenêtre
// glissante approchée. Instants en millisecondes ; une ligne expirée est purgée.

export const rateLimit = pgTable('rate_limit', {
  key: text('key').primaryKey(),
  windowStart: bigint('window_start', { mode: 'number' }).notNull(),
  count: integer('count').notNull(),
  previous: integer('previous').notNull(),
  // La décision du dernier appel : l'instruction qui compte la renvoie.
  allowed: boolean('allowed').notNull(),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
});
