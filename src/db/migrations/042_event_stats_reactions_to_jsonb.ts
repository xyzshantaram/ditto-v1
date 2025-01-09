import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('event_stats')
    .alterColumn('reactions', (ac) => ac.setNotNull()).execute();

  await db.schema
    .alterTable('event_stats')
    .alterColumn('reactions', (ac) => ac.dropDefault()).execute();

  // Type 'text' cannot be converted automatically to 'jsonb',
  // so the 'USING' keyword must be used, and there's no way to do this with kysely,
  // this is why raw SQL is used.
  await sql`
    ALTER TABLE event_stats 
    ALTER COLUMN reactions TYPE jsonb USING reactions::jsonb;
  `.execute(db);

  await db.schema
    .alterTable('event_stats')
    .alterColumn('reactions', (ac) => ac.setDefault('{}')).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('event_stats')
    .alterColumn('reactions', (ac) => ac.dropNotNull()).execute();

  await db.schema
    .alterTable('event_stats')
    .alterColumn('reactions', (ac) => ac.dropDefault()).execute();

  await db.schema
    .alterTable('event_stats')
    .alterColumn('reactions', (ac) => ac.setDataType('text')).execute();

  await db.schema
    .alterTable('event_stats')
    .alterColumn('reactions', (ac) => ac.setDefault('{}')).execute();
}
