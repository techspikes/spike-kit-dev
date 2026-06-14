# Table Doc Command Specification

## Purpose

`shot table-doc [OPTION]... SPEC_FILE --output TABLE_DOC_FILE` validates a Data
Sketch Specification v1 YAML or JSON file and writes a Markdown table document.

The command is a renderer for the validated Data Sketch Relational DB
Projection. It documents the projected tables, columns, primary keys, foreign
keys, and SQL DDL that can be used for review.

## Usage

```sh
shot table-doc [OPTION]... SPEC_FILE --output TABLE_DOC_FILE
shot table-doc [OPTION]... SPEC_FILE -o TABLE_DOC_FILE
```

## Options

- `-o, --output TABLE_DOC_FILE`: output Markdown file path. This option is
  required.
- `-h, --help`: print usage.

## Behavior

- When `-h` or `--help` is provided, the command prints usage to stdout and
  returns exit code 0.
- When `SPEC_FILE` is not provided, the command prints usage to stdout and
  returns a non-zero exit code.
- When `--output` or `-o` is not provided, the command prints usage to stdout
  and returns a non-zero exit code.
- When `SPEC_FILE` is valid, the command parses and validates it with trace
  validation enabled, builds the Relational DB Projection, renders a Markdown
  table document, writes it to `TABLE_DOC_FILE`, and returns exit code 0.
- When `TABLE_DOC_FILE` already exists, the command overwrites it.
- When parsing, validation, projection, rendering, or writing fails, the command
  prints the error message to stderr and returns a non-zero exit code.

## Rendering Inputs

The command uses:

- the parsed and validated Data Sketch for `info.name`, claim `reason`,
  claim `tentative`, and claim-level `aliases`;
- the Effective Schema for projected tables, columns, primary keys, foreign
  keys, unique constraints, check constraints, indexes, SQL types, and
  nullability.

The Effective Schema is the built-in Relational DB Projection with any
`x-relational-db-schema` overrides from the built-in Extension Projection applied (see
x-relational-db-schema Extension and its Effective Schema subsection). When a claim
does not carry `x-relational-db-schema`, the Effective Schema for its projected tables
is identical to the Relational DB Projection.

## Markdown Output

The Markdown document includes frontmatter, one section per projected table, and
a DDL section.

The frontmatter contains:

- `source`: source Data Sketch file basename.
- `sha256`: SHA-256 digest of the normalized parsed Data Sketch.
- `generated_at`: generation timestamp in ISO 8601 format.

### Normalization

The normalized parsed Data Sketch is the validated Data Sketch `spec` object
(the document shape described by the Data Sketch Specification, before
projection) serialized as follows:

- Object keys are sorted in ascending UTF-16 code unit order at every nesting
  level, regardless of source key order.
- Arrays preserve their original element order.
- The serialized form is compact JSON: no insignificant whitespace, no
  trailing newline.
- The serialized string is UTF-8 encoded before hashing.

This makes `sha256` independent of the source file format (YAML or JSON), key
order, and whitespace, so two Data Sketch files with the same validated content
produce the same digest.

The document body starts with:

```md
# <info.name>
```

Each projected table section contains:

- `## <table.name>`
- the source claim `reason` when the projected table belongs to a claim;
- a caution block when the source claim has `tentative: true`;
- a column table;
- a primary key section;
- a foreign keys section when the projected table has foreign keys.

Child tables created from array-of-objects detail paths use the nearest source
claim for `reason`, `tentative`, and aliases.

The caution block is:

```md
> [!CAUTION]
> This table is tentative and needs human review.
```

## Column Table

Each table section includes:

```md
| Column | Data Type | Nullable | Description |
| --- | --- | --- | --- |
```

Rules:

- `Column` is the projected column `name`.
- `Data Type` is the projected column `type`.
- `Nullable` is `yes` when the projected column has `nullable: true`; otherwise
  it is `no`.
- `Description` is the comma-separated aliases for the source detail path when
  aliases are available; otherwise it is empty.
- The implicit surrogate key column `id` always has an empty description.
  `id` is a reserved identity detail path and cannot appear in `details` or
  `aliases`, so it never has aliases.
- Markdown table cell text escapes backslashes, pipes, and underscores.

## Constraint Sections

Each table section includes a primary key section:

```md
### Primary Key

| Constraint Name | Columns |
| --- | --- |
```

Rules:

- `Constraint Name` is the projected `keys.primary.name`.
- `Columns` is the comma-separated projected `keys.primary.columns` list.

When the projected table's `keys.foreign` list is non-empty, it includes:

```md
### Foreign Keys

| Constraint Name | Column | Referenced Table | Referenced Column | Kind |
| --- | --- | --- | --- | --- |
```

Rules:

- `Constraint Name` is the `name` of the projected table's `keys.foreign` entry.
- `Column` is that foreign key `column`.
- `Referenced Table` is that foreign key target table.
- `Referenced Column` is that foreign key target column.
- `Kind` is that foreign key `kind`.

## DDL Section

The document ends with:

````md
## DDL

```sql
...
```
````

Rules:

- The DDL uses the Effective Schema.
- Identifiers are not quoted.
- SQL keywords are uppercase.
- SQL type strings are uppercase.
- Columns without `nullable: true` include `NOT NULL`.
- Columns with `nullable: true` omit `NOT NULL`.
- Primary keys, foreign keys, unique constraints, and check constraints are
  rendered as table constraints inside `CREATE TABLE`.
- Foreign key DDL references the projected target table and target column.
- The DDL does not render indexes in this version; `indexes` from
  `x-relational-db-schema` are part of the Effective Schema but are not rendered as
  `CREATE INDEX` statements.

> [!CAUTION]
> Projected table, column, and constraint names are derived directly from claim
> IDs, claim names, and detail paths, and are not checked against SQL reserved
> words. Because identifiers are not quoted, a generated name that collides with
> a reserved word (for example a structural foreign key column named `order`,
> generated from a claim ID `order`) may produce DDL that fails on a target
> RDBMS. Use `x-relational-db-schema` overrides (see x-relational-db-schema Extension) to rename
> or retype the affected columns and constraints for the target RDBMS.

## x-relational-db-schema Extension

### Purpose

`x-relational-db-schema` is a `table-doc` extension for describing RDBMS-specific
schema choices that are outside the core Data Sketch vocabulary.

The Relational DB projector does not interpret `x-relational-db-schema`. `table-doc`
reads `x-relational-db-schema` from the built-in Extension Projection and applies it to
the Relational DB Projection to produce the Effective Schema (see Effective
Schema), which it then renders.

### Placement

`x-relational-db-schema` may be written on a claim.

```yaml
claims:
  order:
    name: orders
    details:
      - orderNumber
      - status
    aliases:
      orderNumber:
        - order number
      status:
        - order status
    relations:
      customer: customer
    x-relational-db-schema:
      types:
        status:
          type: VARCHAR
          length: 20
      keys:
        foreign:
          - name: fk_orders_customer
            columns:
              - customer
            references:
              table: customers
              columns:
                - id
      constraints:
        unique:
          - name: uq_orders_order_number
            columns:
              - orderNumber
      indexes:
        - name: ix_orders_status
          columns:
            - status
```

### Supported Members

Rules:

- `names` overrides projected table and column names.
- `types` overrides projected column data types using the type vocabulary
  in Type Overrides.
- `keys.foreign` (the override's foreign key entries) overrides or adds foreign
  keys with exactly one column on each side.
- `constraints.unique` defines unique constraints, which may be composite
  (multiple columns).
- `constraints.check` defines check constraints.
- `indexes` defines non-unique indexes, which may be composite (multiple
  columns).
- `keys.foreign.columns`, `keys.foreign.references.columns`,
  `constraints.unique.columns`, and `indexes.columns` reference columns, and
  `keys.foreign.references.table` references a table, by Relational DB
  Projection identifier (see Column References). `constraints.check.expression`
  is the one exception: it is a raw SQL string using final rendered names.
- Composite primary keys and composite foreign keys (more than one column on
  either side) are outside this version's scope. The override extension has no
  `keys.primary` member; the projection's surrogate `id` primary key
  (`tables[].keys.primary`) cannot be replaced or overridden.
- Extension-provided names are used as-is.

### Name Overrides

`names` has two members, `tables` and `columns`, both keyed using identifiers
from the Relational DB Projection of the claim that carries the
`x-relational-db-schema` extension.

- `names.tables` is keyed by projected table ID (the claim's own table ID, or a
  child table ID such as `order.items[]`). Each value replaces that table's
  projected `name`.
- `names.columns` is keyed by projected table ID, then by projected column `id`
  (a source detail path, a relation source path, the reserved key `id` for the
  surrogate key column, or a generated structural foreign key column `id`).
  Each value replaces that column's projected `name`.

Example: renaming the `order_items` child table and its structural foreign key
column `order`, which otherwise collides with the SQL `ORDER` keyword (see the
DDL Section caution above):

```yaml
claims:
  order:
    name: orders
    reason: |-
      Order state is needed after checkout so the service can create an order
      and return its detail.
    traces:
      operations:
        - createOrder
    details:
      - status
      - items[].quantity
    x-relational-db-schema:
      names:
        tables:
          order.items[]: order_line_items
        columns:
          order.items[]:
            order: order_ref
```

Rules:

- A matching `names.tables` entry replaces the default projected table name.
- A matching `names.columns` entry replaces the default projected column name
  for the named table only.
- `names` is the primary mechanism for resolving collisions between generated
  identifiers and SQL reserved words.
- Missing table IDs or column `id` values continue to use the default projected
  name.

### Column References

`keys.foreign.columns`, `keys.foreign.references.columns`,
`constraints.unique.columns`, and `indexes.columns` reference columns by **projected
column `id`** — the same identifier space as `names.columns` (a source detail
path, a relation source path, the reserved key `id` for the surrogate key
column, or a generated structural foreign key column `id`).
`keys.foreign.references.table` references a table by **projected table ID**
— the same identifier space as `names.tables` (the claim's own table ID, or a
child table ID such as `order.items[]`).

`table-doc` resolves `keys.foreign`, `constraints`, and `indexes` against the
Relational DB Projection before applying `names`, so these overrides are
independent of `names` (see Effective Schema for the application order). A
`keys.foreign`, `constraints`, or `indexes` entry that references a column `id`
or table ID that does not exist in the Relational DB Projection is a validation
error.

`constraints.check.expression` is the one exception to this convention: it is a
raw SQL string using the table's final rendered (post-`names`) column names,
because `table-doc` cannot rewrite identifiers inside an opaque expression
(see Constraint Overrides).

### Type Overrides

`types` is keyed by Data Sketch detail path.

```yaml
x-relational-db-schema:
  types:
    status:
      type: VARCHAR
      length: 20
```

`type` is one of the following, case-insensitive on input and rendered
uppercase:

| `type` | Parameters | Rendering |
| --- | --- | --- |
| `CHAR` | `length` (required) | `CHAR(length)` |
| `VARCHAR` | `length` (required) | `VARCHAR(length)` |
| `INTEGER` | — | `INTEGER` |
| `BOOLEAN` | — | `BOOLEAN` |
| `DECIMAL` | `precision`, `scale` (both required) | `DECIMAL(precision, scale)` |

Rules:

- A matching `types` entry takes precedence over default `table-doc` type
  rendering.
- Missing detail paths continue to use the default `table-doc` type rendering.
- `CHAR` and `VARCHAR` require `length`.
- `DECIMAL` requires both `precision` and `scale`. A `DECIMAL` without `scale`
  is a validation error.
- `NUMERIC` is not accepted, even as an alias for `DECIMAL`.
- Any other `type` value (including `NUMERIC`, `SMALLINT`, `FLOAT`, `REAL`,
  `DOUBLE PRECISION`, `DATE`, `TIME`, `TIMESTAMP`, `BIT`, and long-form aliases
  such as `CHARACTER`, `CHARACTER VARYING`, or `INT`), or a missing or invalid
  parameter for the matched `type`, is a validation error.

### Foreign Key Overrides

```yaml
x-relational-db-schema:
  keys:
    foreign:
      - name: fk_orders_customer
        columns:
          - customer
        references:
          table: customers
          columns:
            - id
```

Rules:

- The override's `keys.foreign` entries have `name`, `columns` (exactly one
  projected column `id` on this table), `references.table` (a projected table
  ID), and `references.columns` (exactly one projected column `id` on the
  referenced table). `columns` or `references.columns` with more than one
  element is a validation error.
- An override `keys.foreign` entry whose `columns` matches the column of an
  existing item in the projection's `keys.foreign` list (regardless of that
  foreign key's `kind`) **replaces** that item's `name`, `references`, and
  `columns`.
- An override `keys.foreign` entry that matches no existing foreign key is an
  **additional** foreign key.
- Two override `keys.foreign` entries matching the same existing foreign key is
  a validation error.
- Composite primary keys and composite foreign keys (more than one column) are
  outside this version's scope. The override extension has no `keys.primary`
  member; the projection's surrogate `id` primary key (`tables[].keys.primary`),
  named `pk_<table name>`, is always the table's only primary key.

### Constraint Overrides

Unique constraint:

```yaml
x-relational-db-schema:
  constraints:
    unique:
      - name: uq_orders_order_number
        columns:
          - orderNumber
```

Check constraint:

```yaml
x-relational-db-schema:
  constraints:
    check:
      - name: ck_orders_status
        expression: status IN ('pending', 'shipped', 'delivered')
```

Rules:

- `constraints.unique` entries have `name` and `columns` (one or more projected
  column `id`s); they are always additive, since the Relational DB Projection
  has no unique constraint equivalent.
- `constraints.check` entries have `name` and `expression` (a non-empty raw SQL
  boolean expression, used as-is and rendered as `CHECK (expression)`); they
  are always additive. `expression` uses the table's final rendered column
  names (see Column References).

### Index Overrides

```yaml
x-relational-db-schema:
  indexes:
    - name: ix_orders_status
      columns:
        - status
```

Rules:

- `indexes` entries have `name` and `columns` (one or more projected column
  `id`s) and render non-unique indexes.
- `indexes` is always additive, since the Relational DB Projection has no index
  equivalent.
- `indexes` entries do not have a `unique` flag; uniqueness is expressed only
  through `constraints.unique`.

### Effective Schema

`table-doc` applies `x-relational-db-schema` to the Relational DB Projection to
produce the Effective Schema, and renders the Column Table, Constraint
Sections, and DDL Section from the Effective Schema.

The Effective Schema has the same `tables`/`columns`/`keys.primary`/
`keys.foreign` structure as the Relational DB Projection, plus
`constraints.unique`, `constraints.check`, and `indexes`, which the Relational DB
Projection does not have.

`table-doc` builds the Effective Schema by applying overrides in the following
order, where each step acts on the result of the previous step:

1. Apply `types` to column types, keyed by projected column `id`.
2. Apply the override's `keys.foreign` entries to the projection's `keys.foreign`
   list, using the matching and precedence rules in Foreign Key Overrides. The
   result becomes the Effective Schema's `keys.foreign` list, with the same item
   shape as the projection (`name`, `column`, `target`, `kind`).
3. Set `constraints.unique` from the override's `constraints.unique` entries and
   `constraints.check` from the override's `constraints.check` entries.
4. Add `indexes` from the override's `indexes` entries.
5. Apply `names.tables` and `names.columns` to determine the rendered table and
   column names. `constraints.check.expression` is a raw SQL string that assumes these
   final names and is not rewritten by this step.

When a claim does not carry `x-relational-db-schema`, the Effective Schema for its
projected tables has the same `tables`/`columns`/`keys.primary`/`keys.foreign` as
the Relational DB Projection, and empty `constraints.unique`,
`constraints.check`, and `indexes`.

The Relational DB Projection is itself an RDBMS-oriented projection, and
`x-relational-db-schema` is also RDBMS-specific, so the Effective Schema is best
understood as the final RDBMS-targeted projection — the Relational DB
Projection completed with `x-relational-db-schema` — rather than rendering-only scratch
data. `buildRelationalDbProjection` itself does not read `x-relational-db-schema` and
continues to return a projection derived only from the Data Sketch, so that
`x-relational-db-schema`'s vocabulary (the type table in Type Overrides, and so on)
stays a `table-doc`-specific concern and tools that do not care about
`x-relational-db-schema` (for example `spec-check` and `openapi-summary`) are
unaffected. Applying `x-relational-db-schema` to produce the Effective Schema is a
deterministic transformation of the Relational DB Projection and the Extension
Projection; where this transformation is implemented is left to `table-doc`'s
implementation.

### Override Warnings

After writing the Markdown document, `table-doc` prints one warning per
overridden item to stderr when the override replaces a value that was derived
from real information (an "explicit" or projection-guaranteed value), and
returns exit code `0`. It does not warn when the override replaces a value that
was a `table-doc` default (a "fallback" value) or when the override has no
projection equivalent.

In the table below, `keys.foreign` in the Override column refers to the override
extension's `keys.foreign` entries, matched against the projection's
`keys.foreign` list as described in Foreign Key Overrides.

| Override | Condition | Warns? |
| --- | --- | --- |
| `types.<path>` | The projected type was derived from a matching OpenAPI field | Yes |
| `types.<path>` | The projected type is the `VARCHAR(1024)` fallback | No |
| `types.<path>` on `id` or a foreign key column | The projected type is `CHAR(26)` (a Relational DB Projection guarantee) | Yes |
| `keys.foreign` matching `kind: explicit` or `kind: structural` | The override replaces a relation-derived or structural foreign key | Yes |
| `keys.foreign` matching `kind: inferred`, or matching nothing (an additional foreign key) | The override replaces a heuristic match, or adds a new foreign key | No |
| `constraints.unique`, `constraints.check`, `indexes` | These have no Relational DB Projection equivalent | No |
| `names.tables`, `names.columns` | Projected names are always `table-doc` defaults | No |

The override's `keys.foreign` warnings use the same column-matching rule as the
replacement rule in Foreign Key Overrides. Each warning message follows the
`claims.<id>.x-relational-db-schema.<field>` path style used by validation error
messages, followed by a declarative description of what was overridden, for
example `... overrides a projected type derived from <source>` or
`... overrides a projection-generated structural foreign key`.

## Example

Command:

```sh
shot table-doc online-shop.yaml --output online-shop.table-doc.md
```

Input excerpt:

```yaml
data-sketch: 1.0.0-draft.2

info:
  name: online-shop

sources:
  openapi: ./openapi.yaml

claims:
  customer:
    name: customers
    reason: Customer profile information is needed when orders are created.
    traces:
      operations:
        - createCustomer
    details:
      - name

  order:
    name: orders
    tentative: true
    reason: |-
      Order state is needed after checkout so the service can create an order
      and return its detail.
    traces:
      operations:
        - createOrder
    details:
      - status
      - customer
      - items[].quantity
    aliases:
      status:
        - order status
      customer:
        - order customer
      items[].quantity:
        - item quantity
    relations:
      customer: customer
```

OpenAPI excerpt:

```yaml
openapi: 3.1.0

info:
  title: Online Shop API
  version: 1.0.0

paths:
  /orders:
    post:
      operationId: createOrder
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - status
                - customer
                - items
              properties:
                status:
                  type: string
                  maxLength: 20
                customer:
                  type: string
                items:
                  type: array
                  items:
                    type: object
                    required:
                      - quantity
                    properties:
                      quantity:
                        type: integer
```

Output excerpt:

````md
---
source: online-shop.yaml
sha256: <sha256>
generated_at: <generated-at>
---

# online-shop

## orders

Order state is needed after checkout so the service can create an order
and return its detail.

> [!CAUTION]
> This table is tentative and needs human review.

| Column | Data Type | Nullable | Description |
| --- | --- | --- | --- |
| id | CHAR(26) | no |  |
| status | VARCHAR(20) | no | order status |
| customer | CHAR(26) | no | order customer |

### Primary Key

| Constraint Name | Columns |
| --- | --- |
| pk\_orders | id |

### Foreign Keys

| Constraint Name | Column | Referenced Table | Referenced Column | Kind |
| --- | --- | --- | --- | --- |
| fk\_orders\_customer | customer | customers | id | explicit |

## order\_items

Order state is needed after checkout so the service can create an order
and return its detail.

> [!CAUTION]
> This table is tentative and needs human review.

| Column | Data Type | Nullable | Description |
| --- | --- | --- | --- |
| id | CHAR(26) | no |  |
| order | CHAR(26) | no |  |
| quantity | INTEGER | no | item quantity |

### Primary Key

| Constraint Name | Columns |
| --- | --- |
| pk\_order\_items | id |

### Foreign Keys

| Constraint Name | Column | Referenced Table | Referenced Column | Kind |
| --- | --- | --- | --- | --- |
| fk\_order\_items\_order | order | orders | id | structural |

## DDL

```sql
CREATE TABLE orders (
  id CHAR(26) NOT NULL,
  status VARCHAR(20) NOT NULL,
  customer CHAR(26) NOT NULL,
  CONSTRAINT pk_orders PRIMARY KEY (id),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer) REFERENCES customers (id)
);

CREATE TABLE order_items (
  id CHAR(26) NOT NULL,
  order CHAR(26) NOT NULL,
  quantity INTEGER NOT NULL,
  CONSTRAINT pk_order_items PRIMARY KEY (id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order) REFERENCES orders (id)
);
```
````
