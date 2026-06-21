import { PGlite, types as pgliteTypes } from '@electric-sql/pglite'
import { Kysely, PGliteDialect, sql } from 'kysely'

export function createPgliteKyselyDb(): Kysely<unknown> {
  const pglite = new PGlite({
    parsers: {
      [pgliteTypes.INT8]: (value: string) => value,
      [pgliteTypes.NUMERIC]: (value: string) => value
    }
  })

  return new Kysely<unknown>({ dialect: new PGliteDialect({ pglite }) })
}

export async function readTableNames(db: Kysely<unknown>): Promise<string[]> {
  const result = await sql<{ table_name: string }>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name NOT IN ('kysely_migration', 'kysely_migration_lock')
    ORDER BY table_name
  `.execute(db)

  return result.rows.map(row => row.table_name)
}

export async function readConstraintNames(db: Kysely<unknown>): Promise<string[]> {
  const result = await sql<{ constraint_name: string }>`
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name NOT IN ('kysely_migration', 'kysely_migration_lock')
      AND constraint_type IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')
    ORDER BY constraint_name
  `.execute(db)

  return result.rows.map(row => row.constraint_name)
}

export async function readColumnNames(db: Kysely<unknown>, tableName: string): Promise<string[]> {
  const result = await sql<{ column_name: string }>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
    ORDER BY ordinal_position
  `.execute(db)

  return result.rows.map(row => row.column_name)
}

export async function readIndexNames(db: Kysely<unknown>): Promise<string[]> {
  const result = await sql<{ index_name: string }>`
    SELECT ic.relname AS index_name
    FROM pg_index i
    JOIN pg_class tc ON tc.oid = i.indrelid
    JOIN pg_namespace ns ON ns.oid = tc.relnamespace
    JOIN pg_class ic ON ic.oid = i.indexrelid
    WHERE ns.nspname = 'public'
      AND tc.relname NOT IN ('kysely_migration', 'kysely_migration_lock')
      AND i.indisprimary = false
      AND i.indisunique = false
    ORDER BY ic.relname
  `.execute(db)

  return result.rows.map(row => row.index_name)
}

export async function readColumnIsNullable(
  db: Kysely<unknown>,
  tableName: string,
  columnName: string
): Promise<string | undefined> {
  const result = await sql<{ is_nullable: string }>`
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
      AND column_name = ${columnName}
  `.execute(db)

  return result.rows[0]?.is_nullable
}

export async function readPgliteNumericParserSamples(db: Kysely<unknown>) {
  const result = await sql<{ bigint_value: unknown; decimal_value: unknown }>`
    SELECT
      9007199254740993::BIGINT AS bigint_value,
      19.99::NUMERIC AS decimal_value
  `.execute(db)

  return result.rows[0]
}
