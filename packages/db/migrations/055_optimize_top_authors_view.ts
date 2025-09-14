import { type Kysely, sql } from 'kysely';

// deno-lint-ignore no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  // Drop the existing materialized view and its indexes
  await sql`DROP MATERIALIZED VIEW IF EXISTS top_authors`.execute(db);

  // Create a more optimized materialized view that limits the number of authors
  // This reduces the sorting cost and memory usage during refresh
  await sql`
    CREATE MATERIALIZED VIEW top_authors AS
    SELECT pubkey, followers_count, search
    FROM author_stats
    WHERE followers_count > 0  -- Only include authors with followers
    ORDER BY followers_count DESC
    LIMIT 10000  -- Limit to top 10k authors for search functionality
  `.execute(db);

  // Create indexes on the materialized view for better query performance
  await sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS top_authors_search_idx ON top_authors USING GIN (search gin_trgm_ops)`
    .execute(db);
  await sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS top_authors_pubkey_idx ON top_authors (pubkey)`.execute(db);
  await sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS top_authors_followers_count_idx ON top_authors (followers_count DESC)`
    .execute(db);

  // Ensure the materialized view is populated with data immediately
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY top_authors`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop the optimized view and recreate the original one
  await sql`DROP MATERIALIZED VIEW IF EXISTS top_authors`.execute(db);

  await sql`
    CREATE MATERIALIZED VIEW top_authors AS
    SELECT pubkey, followers_count, search 
    FROM author_stats 
    ORDER BY followers_count DESC
  `.execute(db);

  await sql`CREATE INDEX top_authors_search_idx ON top_authors USING GIN (search gin_trgm_ops)`.execute(db);
  await sql`CREATE INDEX top_authors_pubkey_idx ON top_authors (pubkey)`.execute(db);
}
