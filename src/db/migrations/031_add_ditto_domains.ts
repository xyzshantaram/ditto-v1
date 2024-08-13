import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('ditto_domains')
    .addColumn('domain', 'text', (col) => col.primaryKey())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('categories', 'jsonb', (col) => col.notNull())
    .addColumn('image', 'text', (col) => col.notNull())
    .addColumn('total_users', 'integer', (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('ditto_domains').execute();
}
