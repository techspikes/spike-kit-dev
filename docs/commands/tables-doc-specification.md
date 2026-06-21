# Tables Doc Command Specification

## Purpose

`shot tables-doc [OPTION]... SPEC_FILE --output TABLES_DOC_FILE` validates a Data
Sketch Specification v1 YAML or JSON file and writes a Markdown table document.

The command is a renderer for the validated Data Sketch Relational DB
Projection. It documents the projected tables, columns, primary keys, foreign
keys, and SQL DDL that can be used for review.

## Usage

```sh
shot tables-doc [OPTION]... SPEC_FILE --output TABLES_DOC_FILE
shot tables-doc [OPTION]... SPEC_FILE -o TABLES_DOC_FILE
```

## Options

- `-o, --output TABLES_DOC_FILE`: output Markdown file path. This option is
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
  table document, writes it to `TABLES_DOC_FILE`, and returns exit code 0.
- When `TABLES_DOC_FILE` already exists, the command overwrites it.
- When parsing, validation, projection, rendering, or writing fails, the command
  prints the error message to stderr and returns a non-zero exit code.

## Rendering Inputs

The command uses:

- the parsed and validated Data Sketch for `info.name`, claim `reason`,
  claim `tentative`, and claim-level `aliases`;
- the Relational DB Projection for projected tables, columns, keys,
  constraints, indexes, SQL types, and nullability.

The Relational DB Projection already has OpenAPI type inference and any
`x-relational-db-schema` overrides applied by the projector (see
x-relational-db-schema Extension in the Relational DB Projection
Specification). `tables-doc` renders the Relational DB Projection directly and
does not apply `x-relational-db-schema` itself.

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
- a foreign keys section when the projected table has foreign keys;
- a unique constraints section when the projected table's `constraints.unique`
  is non-empty;
- a check constraints section when the projected table's `constraints.check`
  is non-empty.

Child tables created from array-of-objects detail paths use the nearest source
claim for `reason`, `tentative`, and aliases.

The caution block is:

```md
> [!CAUTION]
> This table is tentative and needs review.
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
- The implicit surrogate key column `id` always has the fixed description
  `Auto-assigned surrogate key`. `id` is a reserved identity detail path and
  cannot appear in `details` or `aliases`, so it never has user-defined aliases.
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

When the projected table's `constraints.unique` list is non-empty, it
includes:

```md
### Unique Constraints

| Constraint Name | Columns |
| --- | --- |
```

Rules:

- `Constraint Name` is the `name` of the projected table's `constraints.unique`
  entry.
- `Columns` is the comma-separated projected `columns` list of that entry.
- Each `constraints.unique` entry is one row.

When the projected table's `constraints.check` list is non-empty, it includes:

```md
### Check Constraints

| Constraint Name | Column | Allowed Values |
| --- | --- | --- |
```

Rules:

- `Constraint Name` is the `name` of the projected table's `constraints.check`
  entry.
- `Column` is that entry's projected `column`.
- `Allowed Values` is the comma-separated `enum` list of that entry.
- Each `constraints.check` entry is one row.
- Markdown table cell text in the unique constraints and check constraints
  sections escapes backslashes, pipes, and underscores, the same as the column
  table.

## DDL Section

The document ends with:

````md
## DDL

```sql
...
```
````

Rules:

- The DDL uses the Relational DB Projection.
- Identifiers are not quoted.
- SQL keywords are uppercase.
- SQL type strings are uppercase.
- Columns without `nullable: true` include `NOT NULL`.
- Columns with `nullable: true` omit `NOT NULL`.
- Primary keys, foreign keys, unique constraints, and check constraints are
  rendered as table constraints inside `CREATE TABLE`.
- Each `constraints.check[]` entry is rendered as
  `CONSTRAINT <name> CHECK (<column> IN (<enum values, single-quoted and
  comma-separated>))`.
- Foreign key DDL references the projected target table and target column.
- The DDL does not render indexes in this version; `indexes` are part of the
  Relational DB Projection but are not rendered as `CREATE INDEX` statements.

> [!CAUTION]
> Projected table, column, and constraint names are derived directly from claim
> IDs, claim names, and detail paths, and are not checked against SQL reserved
> words. Because identifiers are not quoted, a generated name that collides with
> a reserved word (for example a structural foreign key column named `order`,
> generated from a claim ID `order`) may produce DDL that fails on a target
> RDBMS. Use `x-relational-db-schema` (see x-relational-db-schema Extension in
> the Relational DB Projection Specification) to rename or retype the affected
> columns and constraints for the target RDBMS.

## Override Warnings

After writing the Markdown document, `tables-doc` prints one warning per
`x-relational-db-schema` override to stderr when the override replaces a value
that was derived from real information (an "explicit" or
projection-guaranteed value), and returns exit code `0`. It does not warn when
the override replaces a value that was a default (a "fallback" value) or when
the override has no equivalent without `x-relational-db-schema`.

In the table below, `keys.foreign` in the Override column refers to the
`x-relational-db-schema` `keys.foreign` override entries, matched against the
`keys.foreign` list produced by Relation And Foreign Key Rules as described in
Foreign Key Overrides (both in the Relational DB Projection Specification).

| Override | Condition | Warns? |
| --- | --- | --- |
| `types.<path>` | The type produced by Type Rules was derived from a matching OpenAPI field | Yes |
| `types.<path>` | The type produced by Type Rules is the `VARCHAR(1024)` fallback | No |
| `types.<path>` on `id` or a foreign key column | The type produced by Type Rules is `CHAR(26)` (a Relational DB Projection guarantee) | Yes |
| `keys.foreign` matching `kind: explicit` or `kind: structural` | The override replaces a relation-derived or structural foreign key | Yes |
| `keys.foreign` matching `kind: inferred`, or matching nothing (an additional foreign key) | The override replaces a heuristic match, or adds a new foreign key | No |
| `constraints.unique`, `constraints.check`, `indexes` | These have no equivalent without `x-relational-db-schema` | No |
| `names.tables`, `names.columns` | Projected names are always defaults without `x-relational-db-schema` | No |

The `keys.foreign` warnings use the same column-matching rule as the
replacement rule in Foreign Key Overrides. Each warning message follows the
`claims.<id>.x-relational-db-schema.<field>` path style used by validation error
messages, followed by a declarative description of what was overridden, for
example `... overrides a projected type derived from <source>` or
`... overrides a projection-generated structural foreign key`.

## Example

Command:

```sh
shot tables-doc online-shop.yaml --output online-shop.tables-doc.md
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
    x-relational-db-schema:
      constraints:
        unique:
          - name: uq_orders_status_customer
            columns:
              - status
              - customer
        check:
          - name: ck_orders_status
            column: status
            enum:
              - pending
              - shipped
              - delivered
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
> This table is tentative and needs review.

| Column | Data Type | Nullable | Description |
| --- | --- | --- | --- |
| id | CHAR(26) | no | Auto-assigned surrogate key |
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

### Unique Constraints

| Constraint Name | Columns |
| --- | --- |
| uq\_orders\_status\_customer | status, customer |

### Check Constraints

| Constraint Name | Column | Allowed Values |
| --- | --- | --- |
| ck\_orders\_status | status | pending, shipped, delivered |

## order\_items

Order state is needed after checkout so the service can create an order
and return its detail.

> [!CAUTION]
> This table is tentative and needs review.

| Column | Data Type | Nullable | Description |
| --- | --- | --- | --- |
| id | CHAR(26) | no | Auto-assigned surrogate key |
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
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer) REFERENCES customers (id),
  CONSTRAINT uq_orders_status_customer UNIQUE (status, customer),
  CONSTRAINT ck_orders_status CHECK (status IN ('pending', 'shipped', 'delivered'))
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
