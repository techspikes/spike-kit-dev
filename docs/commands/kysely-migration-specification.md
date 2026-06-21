# Kysely Migration Command Specification

## Purpose

`shot kysely-migration [OPTION]... SPEC_FILE --output MIGRATION_FILE` validates a Data
Sketch Specification v1 YAML or JSON file and writes a Kysely-compatible TypeScript
initial migration or diff migration file.

The command is a renderer for the validated Data Sketch Relational DB Projection. It
generates TypeScript migrations suitable for use with the `kysely` npm package's
`Migrator`.

## Usage

```sh
shot kysely-migration [OPTION]... SPEC_FILE --output MIGRATION_FILE
shot kysely-migration [OPTION]... SPEC_FILE -o MIGRATION_FILE
shot kysely-migration [OPTION]... SPEC_FILE --previous-migration PREV_FILE --output MIGRATION_FILE
shot kysely-migration [OPTION]... SPEC_FILE -p PREV_FILE --output MIGRATION_FILE
```

## Options

- `-o, --output MIGRATION_FILE`: output TypeScript file path. Required.
- `-p, --previous-migration PREV_FILE`: read the embedded snapshot from a previously
  generated migration file and generate a diff migration against the current projection.
  Without this option, the command generates an initial migration.
- `--types-output TYPES_FILE`: write a separate TypeScript declaration file containing
  `export interface Database`. The path must end with `.d.ts`.
- `--no-embedded-snapshot`: omit the embedded Relational DB Projection snapshot from
  the generated migration file and `--types-output` declaration file.
- `-h, --help`: print usage to stdout and exit with status `0`.

## Behavior

- When `-h` or `--help` is provided, the command prints usage to stdout and returns
  exit code 0.
- When `SPEC_FILE` is not provided, or `--output` is not provided, the command prints
  usage to stderr and returns a non-zero exit code.
- When `SPEC_FILE` is valid and `--previous-migration` is not provided, the command
  generates an initial migration, writes it to `MIGRATION_FILE`, and returns exit
  code 0.
- When `--previous-migration` is provided, the command reads the embedded snapshot
  from `PREV_FILE`, generates a diff migration from the before snapshot to the current
  projection snapshot, writes it to `MIGRATION_FILE`, and returns exit code 0.
- When `MIGRATION_FILE` already exists, the command overwrites it.
- When `--types-output` is provided, the command writes the `Database` interface
  declaration file after writing `MIGRATION_FILE`. In diff migration mode,
  `--types-output` renders the type file from the after (current) projection snapshot.
- When `--no-embedded-snapshot` is provided, the command writes migration and
  declaration files without the embedded snapshot metadata block. This option only
  affects generated output; `--previous-migration` still reads an embedded snapshot
  from `PREV_FILE`.
- When parsing, validation, projection, previous snapshot reading, or rendering fails,
  the command prints the error message to stderr and returns a non-zero exit code. No
  partial file is written.
- Warnings do not change the exit code.

## Rendering Inputs

The command uses:

- the parsed and validated Data Sketch for claim `tentative` flags;
- the Relational DB Projection for projected tables, columns, keys, constraints,
  indexes, SQL types, and nullability.

The Relational DB Projection already has OpenAPI type inference and any
`x-relational-db-schema` overrides applied by the projector. `kysely-migration`
renders the Relational DB Projection directly and does not apply
`x-relational-db-schema` itself.

### Tentative Tables

Projected tables whose source claim has `tentative: true` are included in the
migration. For each tentative table, the command writes a warning to stderr:

```
Warning: Tentative table included in migration and needs review: <table-name>
```

## Embedded Relational DB Projection

By default, the command embeds the normalized Relational DB Projection in every
generated migration file and type file for use as the `--previous-migration` before
projection in a future diff migration. `--no-embedded-snapshot` omits this block from
generated output.

```ts
type EmbeddedRelationalDbProjection = {
  'data-sketch/relational-db-projection': '1.0.0-draft.3'
  tables: Record<string, RelationalDbProjectionTable>
}

type RelationalDbProjectionTable = {
  name: string
  columns: RelationalDbProjectionColumn[]
  keys: {
    primary: NamedColumns
    foreign: ForeignKey[]
  }
  constraints?: {
    unique?: NamedColumns[]
    check?: CheckConstraint[]
  }
  indexes?: NamedColumns[]
}

type RelationalDbProjectionColumn = {
  id: string      // detail path string (e.g., 'status', 'items[].quantity'); 'id' for the surrogate key
  name: string    // projected physical column name
  type: string    // SQL type string from projection (e.g., 'CHAR(26)', 'VARCHAR(20)')
  nullable?: true
}

type NamedColumns = {
  name: string
  columns: string[]  // physical column names
}

type ForeignKey = {
  name: string
  column: string  // physical column name
  target: {
    table: string   // physical table name
    column: string  // physical column name
  }
  kind: 'explicit' | 'structural' | 'inferred' | 'extension'
}

type CheckConstraint = {
  name: string
  column: string   // physical column name
  enum: string[]
}
```

Rules:

- `tables` is a map keyed by Relational DB Projection table ID. For root tables this
  is the claim ID. For child tables generated from array-of-objects detail paths this
  is `"<claimId>.<path>"`.
- The embedded payload uses Relational DB Projection version `1.0.0-draft.3`.
- Rendered migration statements use dependency order derived from the `tables` map.
- `columns` are listed in projected order, with `id` first.
- Column `id` values use the canonical detail path string from the Data Sketch. The
  surrogate key column always uses `'id'`.
- Table and column references (in constraints, FKs, and indexes) use resolved physical
  names, not logical IDs.
- Optional projection collections such as `constraints` and `indexes` follow the
  Relational DB Projection shape and may be omitted when empty.

## Embedded Snapshot

Every generated migration file and type file begins with an embedded Relational DB
Projection metadata block, encoding the after projection.

Encoding:

1. JSON-serialize the snapshot with object keys sorted in ascending UTF-16 code unit
   order at every nesting level. Arrays preserve element order. No insignificant
   whitespace. (Same normalization as the `sha256` field in `tables-doc`.)
2. Encode the compact JSON as UTF-8 bytes.
3. gzip the UTF-8 bytes.
4. base64-encode the gzip bytes, wrapping at 76 characters per line.
5. Write the base64 text as a `payload` value in a line-commented YAML-style front
   matter block at the top of the file.

```ts
// ---
// data-sketch/relational-db-projection/embedded: 1.0.0-draft.3
// generated_at: <UTC ISO 8601>
// payload: |
//   <base64 chunk>
//   <base64 chunk>
// ---
```

`generated_at` is the UTC ISO 8601 generation timestamp.
`data-sketch/relational-db-projection/embedded: 1.0.0-draft.3` is the fixed embedded
projection identifier. Version `1.0.0-draft.3` uses gzip+base64 as its fixed payload
encoding.

When reading a `--previous-migration` file, the snapshot reader scans the full source
for line-commented YAML front matter blocks delimited by `// ---`, strips the leading
`// ` comment marker, and parses each candidate block as YAML. The first block with
`data-sketch/relational-db-projection/embedded: 1.0.0-draft.3` and a string `payload`
value is the embedded projection. Other comments before or after the block are ignored.
The decoded payload must contain `data-sketch/relational-db-projection:
1.0.0-draft.3`. Older embedded DB projection snapshot versions are rejected.

## Diff Migration

A diff migration compares the embedded snapshot in the file passed to
`--previous-migration` (the before snapshot) with the snapshot generated from the
current Data Sketch (the after snapshot).

Diff comparison covers:

- table additions and deletions
- column additions, deletions, type changes, and nullable changes
- primary key additions, deletions, and changes
- unique constraint additions, deletions, and changes
- foreign key additions, deletions, and changes
- non-unique index additions, deletions, and changes

The command does not infer renames. It treats projection table keys (claim IDs) and
column detail path IDs as stable logical identifiers:

- When the same table `id` has a different `name` in the after snapshot, the command
  generates a table rename.
- When the same table `id` contains the same column `id` with a different `name`, the
  command generates a column rename.
- When a logical `id` disappears and a new one appears, the command generates a
  deletion and an addition, not a rename, even when physical names look similar.
- Constraints and indexes have no logical IDs; name changes are treated as a deletion
  plus an addition.

To request a data-preserving physical rename in a diff migration, keep the Data Sketch
claim key or detail path unchanged and change only the `x-relational-db-schema`
`names.tables` or `names.columns` override value.

Potentially destructive diffs — deletions, column type changes, nullable changes — are
generated without an additional opt-in flag. `up` moves from the before snapshot to the
after snapshot. `down` moves from the after snapshot back to the before snapshot.

Check constraint diffs are not rendered. The command emits a warning for each check
constraint that is added or removed in the diff, matching initial migration behavior.

When embedded snapshot output is enabled, the embedded snapshot in the generated diff
migration file contains the after snapshot.

### Diff Operation Order

`up` renders diff operations in this fixed order:

1. Drop non-unique indexes that are removed or changed.
2. Drop foreign keys, unique constraints, and primary keys that are removed or changed,
   using `alterTable(...).dropConstraint(name)`. Foreign keys are dropped before
   referenced keys.
3. Rename tables using `alterTable(oldName).renameTo(newName)`.
4. Rename columns using `alterTable(...).renameColumn(oldName, newName)`.
5. Drop columns that are removed, using `alterTable(...).dropColumn(name)`.
6. Drop tables that are removed, in reverse dependency order.
7. Alter existing columns that have type or nullable changes, using
   `alterTable(...).alterColumn(name, builder)`.
8. Add new tables, in dependency order, using the same `createTable` form as initial
   migrations.
9. Add new columns to existing tables, using `alterTable(...).addColumn(name, type, builder?)`.
10. Add new or changed primary keys, foreign keys, and unique constraints using
    `alterTable(...).addPrimaryKeyConstraint`, `.addForeignKeyConstraint`,
    `.addUniqueConstraint`.
11. Add new or changed non-unique indexes using `createIndex`.

`down` renders the same diff in the opposite direction, returning from the after
snapshot to the before snapshot, using the same operation order applied to the reversed
diff.

### Diff `up` and `down` Form

```ts
export async function up(db: Kysely<MigrationDatabase>): Promise<void> {
  // Step 1-2: drop removed/changed indexes and constraints
  await db.schema.dropIndex('<index-name>').execute()
  await db.schema.alterTable('<table>').dropConstraint('<constraint-name>').execute()

  // Step 3-4: renames
  await db.schema.alterTable('<old-table>').renameTo('<new-table>').execute()
  await db.schema.alterTable('<table>').renameColumn('<old-col>', '<new-col>').execute()

  // Step 5-6: drops
  await db.schema.alterTable('<table>').dropColumn('<col>').execute()
  await db.schema.dropTable('<removed-table>').execute()

  // Step 7: alter columns
  await db.schema
    .alterTable('<table>')
    .alterColumn('<col>', col => col.setDataType('<new-type>'))
    .execute()

  await db.schema
    .alterTable('<table>')
    .alterColumn('<col>', col => col.dropNotNull())
    .execute()

  // Step 8: add new tables (same form as initial migration)
  await db.schema.createTable('<new-table>')...execute()

  // Step 9: add new columns
  await db.schema
    .alterTable('<table>')
    .addColumn('<new-col>', '<type>', col => col.notNull())
    .execute()

  // Steps 10-11: add new/changed constraints and indexes
  await db.schema.alterTable('<table>').addPrimaryKeyConstraint('<pk>', ['id']).execute()
  await db.schema.alterTable('<table>').addForeignKeyConstraint('<fk>', ['<col>'], '<ref-table>', ['id']).execute()
  await db.schema.alterTable('<table>').addUniqueConstraint('<uq>', ['<col>']).execute()
  await db.schema.createIndex('<index-name>').on('<table>').columns(['<col>']).execute()
}
```

Within each step, operations are applied in dependency order (tables referenced by
foreign keys before tables that reference them, or in reverse for deletions).

`MigrationDatabase` in a diff migration reflects the after snapshot schema. The diff
`up` function migrates from the before to the after schema using `MigrationDatabase`.
The diff `down` function uses an analogous `MigrationDatabase` reflecting the before
snapshot schema.

## TypeScript Output

### Initial Migration

By default, the generated file begins with the embedded snapshot metadata block,
followed by the Kysely import, a local `MigrationDatabase` interface, and the exported
`up` and `down` functions. With `--no-embedded-snapshot`, the generated file begins
with the Kysely import.

```ts
// ---
// data-sketch/relational-db-projection/embedded: 1.0.0-draft.3
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

## MigrationDatabase Interface

The local `MigrationDatabase` interface maps each projected table and its columns to
TypeScript types. Table and column names use single-quoted string literal keys and
projected physical names.

SQL type to TypeScript type mapping:

| SQL type pattern | TypeScript type |
| --- | --- |
| `CHAR(n)`, `VARCHAR(n)` | `string` |
| `INTEGER`, `DOUBLE PRECISION` | `number` |
| `BIGINT`, `DECIMAL(p,s)` | `string` |
| `BOOLEAN` | `boolean` |

Nullable columns (`nullable: true`) append ` | null` to the TypeScript type.

In an initial migration, tables are listed in dependency order. In a diff migration,
`MigrationDatabase` for `up` reflects the after snapshot schema; tables are listed in
after-snapshot dependency order. `MigrationDatabase` for `down` reflects the before
snapshot schema.

## `up` Function (Initial Migration)

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

## `down` Function (Initial Migration)

The `down` function drops indexes and tables in the reverse of `up` order.

Indexes are dropped before tables. Tables are dropped in reverse dependency order.

```ts
await db.schema.dropIndex('<index-name>').execute()
await db.schema.dropTable('<table>').execute()
```

## Check Constraint Warning

The command does not render check constraints from `constraints.check` in either
initial or diff migrations. Kysely's portable schema builder does not support check
constraints without the `sql` template tag, and this command does not use the `sql`
template tag.

For each check constraint present in the after projection, the command writes a warning
to stderr:

```
Warning: Check constraint ignored by migration renderer: <table-name>.<constraint-name>
```

In diff migration mode, the command also warns for check constraints that are added or
removed in the diff.

Check constraints remain visible in the `tables-doc` Markdown output and DDL section.

## `--types-output` Declaration File

When `--types-output` is specified, the command writes a `.d.ts` declaration file
containing an application-facing `Database` interface for use with
`new Kysely<Database>()`.

By default, the declaration file begins with the same embedded snapshot metadata block
as the migration file, followed by:

```ts
export interface Database {
  '<table>': {
    '<column>': TypeScriptType
  }
}
```

The `Database` interface uses the same type mapping, column order, and table order as
`MigrationDatabase` for `up`. In diff migration mode, `--types-output` renders the type
file from the after (current) projection snapshot. With `--no-embedded-snapshot`, the
declaration file begins with `export interface Database`.

## SQL and Kysely Compatibility

Generated migrations target SQL92-compatible DDL through Kysely schema builder APIs.

The command does not use the Kysely `sql` template tag. Column type changes use
`alterColumn(..., col => col.setDataType(...))`. Nullability changes use
`alterColumn(..., col => col.setNotNull())` or
`alterColumn(..., col => col.dropNotNull())`. When type and nullability both change,
the command emits separate `alterColumn` statements.

Before rendering a current or embedded previous projection, the command validates it
with `validateRelationalDbProjection`.

Rejected in this version:

- Snapshot foreign keys whose source column, target table, or target column does not
  exist in the rendered snapshot.
- Any diff operation that requires raw SQL.

## Command Output

Successful runs write `Migration generated` to stdout. Warnings are written to stderr
and do not change the exit code.

Argument errors write `Error: <reason>`, a blank line, and usage text to stderr.

## Example

### Initial Migration

Command:

```sh
shot kysely-migration online-shop.yaml --output 0001_initial.ts
```

Input (same spec as `tables-doc` example, `order` claim with `x-relational-db-schema`).

Output:

```ts
// ---
// data-sketch/relational-db-projection/embedded: 1.0.0-draft.3
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

### Diff Migration

Scenario: a new `note` claim (`notes` table) is added to the spec, and
`orders.status` is widened from `VARCHAR(20)` to `VARCHAR(50)` via a type override.

Command:

```sh
shot kysely-migration online-shop-v2.valid.yaml --previous-migration 0001_initial.ts --output 0002_add_notes.ts
```

Output excerpt:

```ts
// ---
// data-sketch/relational-db-projection/embedded: 1.0.0-draft.3
// generated_at: 2026-06-16T01:00:00.000Z
// payload: |
//   <base64>
// ---

import type { Kysely } from 'kysely'

interface MigrationDatabase {
  'customers': { 'id': string; 'name': string }
  'notes': { 'id': string; 'body': string }
  'orders': { 'id': string; 'status': string; 'customer': string }
  'order_items': { 'id': string; 'order': string; 'quantity': number }
}

export async function up(db: Kysely<MigrationDatabase>): Promise<void> {
  // Step 7: alter changed column
  await db.schema
    .alterTable('orders')
    .alterColumn('status', col => col.setDataType('varchar(50)'))
    .execute()

  // Step 8: add new table
  await db.schema
    .createTable('notes')
    .addColumn('id', 'char(26)', column => column.notNull())
    .addColumn('body', 'text', column => column.notNull())
    .addPrimaryKeyConstraint('pk_notes', ['id'])
    .execute()
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.dropTable('notes').execute()

  await db.schema
    .alterTable('orders')
    .alterColumn('status', col => col.setDataType('varchar(20)'))
    .execute()
}
```
