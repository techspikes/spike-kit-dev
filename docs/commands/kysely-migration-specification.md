# Kysely Migration Command Specification

## Purpose

`shot kysely-migration [OPTION]... SPEC_FILE --output MIGRATION_FILE` validates a Data
Sketch Specification v1 YAML or JSON file and writes a Kysely-compatible TypeScript
migration file.

The command is a renderer for the validated Data Sketch Relational DB Projection. It
generates an initial TypeScript migration suitable for use with the `kysely` npm
package's `Migrator`.

## Usage

```sh
shot kysely-migration [OPTION]... SPEC_FILE --output MIGRATION_FILE
shot kysely-migration [OPTION]... SPEC_FILE -o MIGRATION_FILE
```

## Options

- `-o, --output MIGRATION_FILE`: output TypeScript file path. Required.
- `--types-output TYPES_FILE`: write a separate TypeScript declaration file containing
  `export interface Database`. The path must end with `.d.ts`.
- `--include-tentative`: explicitly include tables from claims with `tentative: true`.
  Without this option, tentative claims are excluded and reported as warnings.
- `--dry-run`: perform read, parse, validation, projection, and render validation, but
  write no files. Exits with status `0` on success.
- `-h, --help`: print usage to stdout and exit with status `0`.

## Behavior

- When `-h` or `--help` is provided, the command prints usage to stdout and returns
  exit code 0.
- When `SPEC_FILE` is not provided, or `--output` is not provided, the command prints
  usage to stderr and returns a non-zero exit code.
- When `SPEC_FILE` is valid, the command parses and validates it with trace validation
  enabled, builds the Relational DB Projection, renders a Kysely TypeScript migration,
  writes it to `MIGRATION_FILE`, and returns exit code 0.
- When `MIGRATION_FILE` already exists, the command overwrites it.
- When `--types-output` is provided, the command writes the `Database` interface
  declaration file after writing `MIGRATION_FILE`.
- When `--dry-run` is provided, the command performs all steps except writing files.
  On success it prints `Dry run completed` and exits with status 0.
- When parsing, validation, projection, or rendering fails, the command prints the
  error message to stderr and returns a non-zero exit code. No partial file is written.
- Warnings do not change the exit code.

## Rendering Inputs

The command uses:

- the parsed and validated Data Sketch for claim `tentative` flags;
- the Relational DB Projection for projected tables, columns, keys, constraints,
  indexes, SQL types, and nullability.

The Relational DB Projection already has any `x-relational-db-schema` overrides
applied by the projector. `kysely-migration` renders the Relational DB Projection
directly and does not apply `x-relational-db-schema` itself.

### Tentative Claims

Without `--include-tentative`, projected tables whose source claim has `tentative: true`
are excluded from the migration. For each excluded table, the command writes a warning
to stderr:

```
Warning: Tentative claim excluded from migration: <table-name>
```

## TypeScript Output

The generated file begins with an embedded snapshot metadata block, followed by the
Kysely import, a local `MigrationDatabase` interface, and the exported `up` and `down`
functions.

```ts
// ---
// data-sketch/embedded-db-projection-snapshot: 1.0.0-draft.0
// generated_at: <UTC ISO 8601>
// payload: |
//   <base64 line>
//   <base64 line>
// ---

import type { Kysely } from 'kysely'

interface MigrationDatabase {
  '<table>': {
    '<column>': TypeScriptType
  }
}

export async function up(db: Kysely<MigrationDatabase>): Promise<void> {
  // ...
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
  // ...
}
```

## Embedded Snapshot

The embedded snapshot block at the top of the file preserves the Relational DB
Projection state for future diff migration support.

Encoding:

1. Normalize the Relational DB Projection to compact JSON with object keys sorted in
   ascending UTF-16 code unit order at every nesting level. Arrays preserve element
   order. (Same normalization as the `sha256` field in `tables-doc`.)
2. Encode the compact JSON as UTF-8 bytes.
3. gzip the UTF-8 bytes.
4. base64-encode the gzip bytes, wrapping at 76 characters per line.
5. Write the base64 text as a `payload` value in a line-commented YAML-style front
   matter block at the top of the file.

```ts
// ---
// data-sketch/embedded-db-projection-snapshot: 1.0.0-draft.0
// generated_at: 2026-06-16T00:00:00.000Z
// payload: |
//   <base64 chunk>
//   <base64 chunk>
// ---
```

`generated_at` is the UTC ISO 8601 generation timestamp.
`data-sketch/embedded-db-projection-snapshot: 1.0.0-draft.0` is the fixed embedded
snapshot identifier.

## MigrationDatabase Interface

The local `MigrationDatabase` interface maps each projected table and its columns to
TypeScript types. Table and column names use single-quoted string literal keys and
projected physical names.

SQL type to TypeScript type mapping:

| SQL type pattern | TypeScript type |
| --- | --- |
| `CHAR(n)`, `VARCHAR(n)`, `TEXT`, `DATE`, `TIME`, `TIMESTAMP` | `string` |
| `INTEGER`, `BIGINT`, `SMALLINT`, `DECIMAL(p,s)`, `NUMERIC(p,s)` | `number` |
| `BOOLEAN` | `boolean` |

Nullable columns (`nullable: true`) append ` | null` to the TypeScript type.

Tables are listed in dependency order (same order as `up`). Columns are listed in
projected order, with `id` first.

## `up` Function

The `up` function creates all tables and indexes in dependency order. Tables referenced
by foreign keys are created before tables that reference them.

Each table uses a single chained Kysely schema builder call:

```ts
await db.schema
  .createTable('<table>')
  .addColumn('<column>', '<sql-type>', column => column.notNull())
  .addPrimaryKeyConstraint('<pk-name>', ['<col>'])
  .addForeignKeyConstraint('<fk-name>', ['<col>'], '<ref-table>', ['<ref-col>'])
  .addUniqueConstraint('<uq-name>', ['<col>'])
  .execute()
```

Rules:

- Kysely column type strings are lowercase, matching the SQL type from the projection
  with all characters lowercased. For example, `CHAR(26)` becomes `'char(26)'`,
  `VARCHAR(20)` becomes `'varchar(20)'`, `INTEGER` becomes `'integer'`.
- Columns without `nullable: true` use `.notNull()` in the column builder callback.
  Nullable columns omit `.notNull()` and omit the builder callback when no other
  builder options apply.
- Primary key, foreign key, and unique constraints are rendered as named table-level
  constraints using `.addPrimaryKeyConstraint`, `.addForeignKeyConstraint`, and
  `.addUniqueConstraint` in that order, following all `.addColumn` calls.
- Each `keys.foreign` entry is one `.addForeignKeyConstraint` call.
- Each `constraints.unique` entry is one `.addUniqueConstraint` call.
- Check constraints are not rendered. See Check Constraint Warning.
- After all `createTable` calls, non-unique indexes are created as separate statements
  in dependency order:

```ts
await db.schema
  .createIndex('<index-name>')
  .on('<table>')
  .columns(['<col>'])
  .execute()
```

- Index columns are in the order defined in the projection.

## `down` Function

The `down` function drops indexes and tables in the reverse of `up` order.

Indexes are dropped before tables. Tables are dropped in reverse dependency order
(the reverse of their creation order).

```ts
await db.schema.dropIndex('<index-name>').execute()
await db.schema.dropTable('<table>').execute()
```

## Check Constraint Warning

The command does not render check constraints from `constraints.check`. Kysely's
portable schema builder does not support check constraints without the `sql` template
tag, and this command does not use the `sql` template tag.

For each check constraint present in the projection, the command writes a warning to
stderr:

```
Warning: Check constraint ignored by migration renderer: <table-name>.<constraint-name>
```

Check constraints remain visible in the `tables-doc` Markdown output and DDL section.

## `--types-output` Declaration File

When `--types-output` is specified, the command writes a `.d.ts` declaration file
containing an application-facing `Database` interface for use with
`new Kysely<Database>()`.

The declaration file begins with the same embedded snapshot metadata block as the
migration file, followed by:

```ts
export interface Database {
  '<table>': {
    '<column>': TypeScriptType
  }
}
```

The `Database` interface uses the same type mapping, column order, and table order as
`MigrationDatabase`.

## SQL and Kysely Compatibility

Generated migrations target SQL92-compatible DDL through Kysely schema builder APIs.

The command does not use the Kysely `sql` template tag. Generated migrations are
compatible with all standard Kysely dialects.

## Progress Output

Successful generation reports progress to stdout:

```
Data Sketch read
Validating Data Sketch
Building Relational DB Projection
Rendering migration
Migration written
Type definitions written
Migration generated
```

`Type definitions written` is emitted only when `--types-output` is used.

Successful dry-run reports:

```
Data Sketch read
Validating Data Sketch
Building Relational DB Projection
Rendering migration
Dry run completed
```

Argument errors write `Error: <reason>`, a blank line, and usage text to stderr.

## Example

Command:

```sh
shot kysely-migration online-shop.yaml --output 0001_initial.ts
```

Input (same spec as `tables-doc` example, `order` claim with `x-relational-db-schema`).

Output:

```ts
// ---
// data-sketch/embedded-db-projection-snapshot: 1.0.0-draft.0
// generated_at: 2026-06-16T00:00:00.000Z
// payload: |
//   <base64>
// ---

import type { Kysely } from 'kysely'

interface MigrationDatabase {
  'customers': {
    'id': string
    'name': string
  }
  'orders': {
    'id': string
    'status': string
    'customer': string
  }
  'order_items': {
    'id': string
    'order': string
    'quantity': number
  }
}

export async function up(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema
    .createTable('customers')
    .addColumn('id', 'char(26)', column => column.notNull())
    .addColumn('name', 'varchar(255)', column => column.notNull())
    .addPrimaryKeyConstraint('pk_customers', ['id'])
    .execute()

  await db.schema
    .createTable('orders')
    .addColumn('id', 'char(26)', column => column.notNull())
    .addColumn('status', 'varchar(20)', column => column.notNull())
    .addColumn('customer', 'char(26)', column => column.notNull())
    .addPrimaryKeyConstraint('pk_orders', ['id'])
    .addForeignKeyConstraint('fk_orders_customer', ['customer'], 'customers', ['id'])
    .addUniqueConstraint('uq_orders_status_customer', ['status', 'customer'])
    .execute()

  await db.schema
    .createTable('order_items')
    .addColumn('id', 'char(26)', column => column.notNull())
    .addColumn('order', 'char(26)', column => column.notNull())
    .addColumn('quantity', 'integer', column => column.notNull())
    .addPrimaryKeyConstraint('pk_order_items', ['id'])
    .addForeignKeyConstraint('fk_order_items_order', ['order'], 'orders', ['id'])
    .execute()
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.dropTable('order_items').execute()
  await db.schema.dropTable('orders').execute()
  await db.schema.dropTable('customers').execute()
}
```

Warnings emitted to stderr for the `ck_orders_status` check constraint:

```
Warning: Check constraint ignored by migration renderer: orders.ck_orders_status
```
