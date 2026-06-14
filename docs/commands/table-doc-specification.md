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
- the built-in Relational DB Projection for projected tables, columns, primary
  keys, foreign keys, SQL types, and nullability.

The command does not interpret `x-rdbms-schema` in this version. Data type
overrides, name overrides, uniqueness constraints, indexes, check constraints,
and other physical schema choices are outside the first `table-doc` rendering
scope. See x-rdbms-schema Extension for the override format a future `table-doc`
version, or another renderer, may read from the built-in Extension Projection.

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

- `Constraint Name` is the projected `primaryKey.name`.
- `Columns` is the comma-separated projected `primaryKey.columns` list.

When a projected table has foreign keys, it includes:

```md
### Foreign Keys

| Constraint Name | Column | Referenced Table | Referenced Column | Kind |
| --- | --- | --- | --- | --- |
```

Rules:

- `Constraint Name` is the projected foreign key `name`.
- `Column` is the projected foreign key `column`.
- `Referenced Table` is the projected foreign key target table.
- `Referenced Column` is the projected foreign key target column.
- `Kind` is the projected foreign key `kind`.

## DDL Section

The document ends with:

````md
## DDL

```sql
...
```
````

Rules:

- The DDL uses the Relational DB Projection only.
- Identifiers are not quoted.
- SQL keywords are uppercase.
- SQL type strings are uppercase.
- Columns without `nullable: true` include `NOT NULL`.
- Columns with `nullable: true` omit `NOT NULL`.
- Primary keys and foreign keys are rendered as table constraints inside
  `CREATE TABLE`.
- Foreign key DDL references the projected target table and target column.
- The DDL does not render uniqueness constraints, indexes, check constraints, or
  custom data type overrides in this version.

> [!CAUTION]
> Projected table, column, and constraint names are derived directly from claim
> IDs, claim names, and detail paths, and are not checked against SQL reserved
> words. Because identifiers are not quoted, a generated name that collides with
> a reserved word (for example a structural foreign key column named `order`,
> generated from a claim ID `order`) may produce DDL that fails on a target
> RDBMS. Use `x-rdbms-schema` overrides (see x-rdbms-schema Extension) to rename
> or retype the affected columns and constraints for the target RDBMS.

## x-rdbms-schema Extension

### Purpose

`x-rdbms-schema` is a `table-doc` extension for describing RDBMS-specific
schema choices that are outside the core Data Sketch vocabulary.

The Relational DB projector does not interpret `x-rdbms-schema`. A renderer
such as `table-doc` reads `x-rdbms-schema` from the built-in Extension
Projection when it renders table specifications from a Relational DB
projection.

### Placement

`x-rdbms-schema` may be written on a claim.

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
    x-rdbms-schema:
      data-types:
        status:
          type: VARCHAR
          length: 20
      keys:
        primary:
          - id
        foreign:
          - name: fk_orders_customer
            columns:
              - customer
            references:
              table: customers
              columns:
                - id
        unique:
          - name: uq_orders_order_number
            columns:
              - order_number
      indexes:
        - name: ix_orders_status
          columns:
            - status
```

### Supported Members

Rules:

- `names` overrides projected table and column names.
- `data-types` overrides projected column data types.
- `keys.primary` overrides the primary key rendered for the table.
- `keys.foreign` defines explicit foreign keys.
- `keys.unique` defines unique constraints.
- `indexes` defines non-unique indexes.
- Composite primary keys and composite foreign keys may be expressed by listing
  multiple columns in this extension.
- Extension-provided names are used as-is.

### Name Overrides

`names` has two members, `tables` and `columns`, both keyed using identifiers
from the Relational DB Projection of the claim that carries the
`x-rdbms-schema` extension.

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
    x-rdbms-schema:
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

### Data Type Overrides

`data-types` is keyed by Data Sketch detail path.

```yaml
x-rdbms-schema:
  data-types:
    status:
      type: VARCHAR
      length: 20
```

Rules:

- A matching `data-types` entry takes precedence over default `table-doc` type
  rendering.
- Missing detail paths continue to use the default `table-doc` type rendering.

### Key And Constraint Overrides

Primary key:

```yaml
x-rdbms-schema:
  keys:
    primary:
      - id
```

Foreign key:

```yaml
x-rdbms-schema:
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

Unique constraint:

```yaml
x-rdbms-schema:
  keys:
    unique:
      - name: uq_orders_order_number
        columns:
          - order_number
```

Rules:

- `keys.primary` replaces the default primary key for the table.
- `keys.foreign` entries take precedence over generated foreign key definitions
  for the same columns.
- `keys.unique` renders unique constraints.

### Index Overrides

```yaml
x-rdbms-schema:
  indexes:
    - name: ix_orders_status
      columns:
        - status
```

Rules:

- `indexes` renders non-unique indexes.
- Index names and column names are used as provided.
  `x-rdbms-schema.keys.unique` is used for uniqueness.

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
