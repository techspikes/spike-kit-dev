# Relational DB Projection Specification

## Purpose

The Relational DB projector converts Data Sketch claims into a relational
database-oriented projection.

The projection is an intermediate model for renderers and database-facing
commands. It is not a complete physical schema design, and it must not invent
domain entities. Array-of-objects paths imply structural parent-child
relationships between generated tables. Detail paths whose final segment exactly
matches a claim ID imply claim-to-claim relationships by convention.

---

## Root Shape

```yaml
data-sketch/relational-db-projection: 1.0.0-draft.3
tables: {}
```

Rules:

- `data-sketch/relational-db-projection` is the projection format version.
- `tables` is a map of projected table IDs to table definitions.
- Table IDs are stable logical projection IDs.
- Table implementation names are stored in each table's `name`.

---

## Projection Rules

Rules:

- The input must be a parsed and validated Data Sketch.
- Relation source paths and relation target claim IDs are validated before
  projection.
- Each `claim` becomes one parent table.
- Each `detail` becomes one column on one projected table.
- Claim-level `reason`, `traces`, and `tentative` are not included in the
  projection.
- Claim-level `aliases` are not included as projection fields.
- Every projected table receives an implicit surrogate key column named `id`.
- The surrogate key column is the table primary key.
- The surrogate key value format is `ULID`.
- Every child table created from an array-of-objects path receives an
  automatically added structural foreign key to its immediate parent table.
- Detail paths whose final segment exactly matches an existing claim ID receive
  automatically added claim ID exact-match foreign keys unless the same path is
  explicitly listed in `relations`.

---

## Table Shape

```yaml
tables:
  order:
    name: orders
    columns:
      - id: id
        name: id
        type: CHAR(26)
    keys:
      primary:
        name: pk_orders
        columns:
          - id
      foreign: []
```

Fields:

- table ID: map key under `tables`.
- `name`: projected table name.
- `columns`: ordered projected column definitions.
- `keys`: primary key and foreign key constraints.
  - `keys.primary`: primary key constraint.
  - `keys.foreign`: ordered foreign key constraints with generated names and kind
    markers.
- `constraints`: unique and check constraints added by `x-relational-db-schema`
  (see x-relational-db-schema Extension).
  - `constraints.unique`: ordered list of unique constraints.
  - `constraints.check`: ordered list of check constraints.
- `indexes`: ordered list of non-unique indexes added by
  `x-relational-db-schema` (see x-relational-db-schema Extension).

Rules:

- A parent table ID comes from the claim ID.
- A parent table name comes from the claim implementation `name`.
- A child table ID is derived from the parent claim ID and source array path.
- A child table ID preserves `[]` from the source array path.
- A child table name is derived from the table ID by converting path segments to
  snake_case and removing `[]`.
- Each array-of-objects path segment creates a table boundary. Nested
  array-of-objects segments create nested child tables.
- `keys.primary` is always set to the surrogate key column.
- `keys.primary.name` is generated as `pk_<projected table name>`.
  For example, `orders` becomes `pk_orders`, and `order_items` becomes
  `pk_order_items`.
- `keys.foreign` contains structural parent-child foreign keys, foreign keys
  created from Data Sketch `relations`, and claim ID exact-match foreign keys.
- Foreign key names are generated as `fk_<source table name>_<column name>`.
- Foreign key `kind` values classify why the projector created the foreign key
  so renderers can keep or discard each category.
- `kind: explicit` means the foreign key came from Data Sketch
  `relations`.
- `kind: structural` means the foreign key came from an automatically created
  parent-child table boundary.
- `kind: inferred` means the foreign key came from a detail path
  whose final segment exactly matched a claim ID.
- A child table created from an array-of-objects path receives one structural
  parent foreign key.
- A top-level child table references the claim parent table.
- A nested child table references the nearest generated parent child table.
- A projected table name conflict is a projection error.
- The projector must not split a claim into additional parent entities unless
  the split is required by array projection rules.
- Composite primary keys and composite foreign keys are outside this
  projection and outside `x-relational-db-schema` overrides (see
  x-relational-db-schema Extension).
- `constraints.unique`, `constraints.check`, and `indexes` are populated only
  when the claim's `x-relational-db-schema` adds them (see
  x-relational-db-schema Extension); otherwise they are empty and omitted from
  the projection, the same way `nullable` is omitted on columns that are not
  nullable.

Table ID examples:

| Source claim id | Source details id | Projected table ID | Projected table name |
|---|---|---|---|
| `order` | `status` | `order` | `orders` |
| `order` | `items[].quantity` | `order.items[]` | `order_items` |
| `order` | `items[].stocks[].price` | `order.items[].stocks[]` | `order_items_stocks` |

---

## Column Shape

```yaml
id: phoneNumber
name: phone_number
type: VARCHAR(1024)
nullable: true
```

Fields:

- `id`: source detail ID or automatically added column ID.
- `name`: derived snake_case column name.
- `type`: SQL type string.
- `nullable`: optional marker emitted only when the projected column may contain
  null values.

Name derivation examples:

| Source claim id | Source details id | Projected table name | Derived column name |
|---|---|---|---|
| `product` | `inventoryStatus` | `products` | `inventory_status` |
| `product` | `items[].normalPrice` | `product_items` | `normal_price` |
| `order` | `items[].unitPrice` | `order_items` | `unit_price` |
| `order` | `items[].stocks.price` | `order_items` | `stocks_price` |
| `order` | `items[].stocks[].price` | `order_items_stocks` | `price` |

Rules:

- A top-level scalar detail path becomes a column on the parent table.
- A nested object detail path is flattened into the parent table.
- An array-of-objects detail path becomes a child table column.
- A nested array-of-objects detail path becomes a nested child table column.
- An array-of-scalars detail path is treated as a string column on the parent
  table.
- A structural parent foreign key column is added to each child table before
  detail columns.
- A structural parent foreign key column `id` is the parent projected table ID.
- A structural parent foreign key column `name` is the parent projected table ID
  converted to snake_case with `[]` removed. For example, parent table ID
  `order` becomes `order`, and parent table ID `order.items[]` becomes
  `order_items`.
- `columns` remains an array so renderers can preserve DDL column order.
- A projected column name conflict inside one projected table is a projection
  error.

---

## Flattening Rules

Flattening keeps nested object details on their projected table.

Rules:

- A flattened column keeps the original detail path as `id`.
- A flattened column derives `name` from the detail path suffix inside its
  projected table.
- Each nested path segment is converted to snake_case, then joined with `_`.
- Flattening does not create another table.
- Flattening does not create a foreign key.

Examples:

| Source claim id | Source details id | Projected table name | Derived column name |
|---|---|---|---|
| `customer` | `address.city` | `customers` | `address_city` |
| `customer` | `address.postalCode` | `customers` | `address_postal_code` |
| `order` | `items[].stocks.price` | `order_items` | `stocks_price` |
| `order` | `items[].stocks[].price` | `order_items_stocks` | `price` |

When a detail is projected into a child table, the table's array path is removed
before deriving the flattened column name. For `items[].stocks.price` projected
inside the `items[]` child table, the column name is derived from
`stocks.price`, so it becomes `stocks_price`.

When the nested path itself contains another array-of-objects segment, that
segment creates another child table instead of being flattened into the parent
child table. For `items[].stocks[].price` projected inside the
`items[].stocks[]` child table, the column name is derived from `price`, so it
becomes `price`.

---

## Type Rules

Rules:

- If no OpenAPI source is loaded on the validated Data Sketch, detail columns use
  `VARCHAR(1024)`.
- If an OpenAPI source is loaded, the projector uses only the claim's traced
  OpenAPI operations.
- OpenAPI field paths must exactly match Data Sketch detail paths to influence
  a column type.
- OpenAPI `string` with `maxLength` becomes `VARCHAR(maxLength)`.
- When multiple matching OpenAPI strings specify `maxLength`, the largest
  specified value is used.
- When no matching OpenAPI string specifies `maxLength`, the column type falls
  back to `VARCHAR(1024)`.
- OpenAPI `integer` and `number` become `INTEGER`.
- OpenAPI `boolean` becomes `BOOLEAN`.
- Conflicting OpenAPI types fall back to `VARCHAR(1024)`.
- Data Sketch details without matching traced OpenAPI fields fall back to
  `VARCHAR(1024)`.
- Data Sketch array-of-scalars details fall back to `VARCHAR(1024)` unless a
  traced OpenAPI field exactly matches the array detail path.
- Surrogate key columns use `CHAR(26)`.
- Explicit relation and claim ID exact-match foreign key columns use
  `CHAR(26)`.
- Structural parent foreign key columns use `CHAR(26)`.
- SQL type strings are written in uppercase.
- OpenAPI `number` is projected as `INTEGER`; decimals should be scaled up or
  represented as strings, or overridden with renderer-specific schema metadata.

---

## Nullability Rules

Rules:

- Absence of `nullable` means the projected column is required and should be
  rendered as NOT NULL when the target renderer supports nullability.
- Surrogate key columns omit `nullable` because they are required by default.
- Structural parent foreign key columns omit `nullable` because they are
  required by default.
- Details without matching traced OpenAPI fields omit `nullable` and are treated
  as required by default.
- If any matching traced OpenAPI field is not required, the projected column
  emits `nullable: true`.
- If all matching traced OpenAPI fields are required, the projected column omits
  `nullable`.
- Explicit and inferred foreign key columns omit `nullable` because they use the
  target table's required surrogate key type.

---

## Relation And Foreign Key Rules

Rules:

- Foreign keys are created from Data Sketch `relations`, structural
  parent-child relationships implied by array-of-objects paths, and detail paths
  whose final segment exactly matches a claim ID.
- Every foreign key has a `kind` marker.
- `kind: explicit` marks a foreign key created from Data Sketch
  `relations`.
- `kind: structural` marks a foreign key created from an array-of-objects table
  split.
- `kind: inferred` marks a foreign key inferred from a detail path
  whose final segment exactly matches a claim ID.
- `kind: extension` marks a foreign key added by an
  `x-relational-db-schema.keys.foreign` override that does not match any
  existing foreign key (see `x-relational-db-schema Extension`).
- Renderers may ignore `kind: inferred` foreign keys when they require only
  explicit relationship declarations.
- A child table structural foreign key references the immediate parent projected
  table's surrogate key column `id`.
- A top-level array child table references the claim parent table.
- A nested array child table references the nearest generated child table from
  the previous array-of-objects boundary.
- A structural foreign key column is named from the parent projected table ID.
- A relation source path is projected as a source column even when it is not
  listed in the same claim's `details`.
- A relation source path uses that projected source column as the foreign key
  column.
- A relation target value points to a target claim.
- A relation always references the target table's surrogate key column `id`.
- An explicit `relations` entry takes precedence over claim ID exact-match
  inference for the same source path.
- Do not write `.id` in the Data Sketch relation target value. Relation target
  values ending with `.id` are invalid.
- A relation source path must not be an array-of-scalars detail. A relation path
  ending with `[]` is invalid.
- If a relation source path appears inside an array-of-objects child table or
  nested child table, the foreign key is created on that projected table.
- Data Sketch `relations` target claim IDs, not generated child table IDs.
- Claim ID exact-match inference checks only the final detail path segment.
- Claim ID exact-match inference does not apply to array-of-scalars details.
- The projector must not infer foreign keys from non-exact matching names such
  as `customerId`, `orderId`, or `productId`.

Relation projection example:

The target claim `customer` is assumed to exist and project to table
`customers`.

```yaml
details:
  - status

relations:
  customer: customer
```

```yaml
tables:
  order:
    name: orders
    columns:
      - id: id
        name: id
        type: CHAR(26)
      - id: status
        name: status
        type: VARCHAR(1024)
      - id: customer
        name: customer
        type: CHAR(26)
    keys:
      primary:
        name: pk_orders
        columns:
          - id
      foreign:
        - name: fk_orders_customer
          column: customer
          target:
            table: customers
            column: id
          kind: explicit
```

Claim ID exact-match projection example:

The source detail path `items[].product` ends with `product`, and the target
claim `product` is assumed to exist and project to table `products`.

```yaml
details:
  - items[].product
```

```yaml
tables:
  "order.items[]":
    name: order_items
    columns:
      - id: id
        name: id
        type: CHAR(26)
      - id: order
        name: order
        type: CHAR(26)
      - id: items[].product
        name: product
        type: CHAR(26)
    keys:
      primary:
        name: pk_order_items
        columns:
          - id
      foreign:
        - name: fk_order_items_order
          column: order
          target:
            table: orders
            column: id
          kind: structural
        - name: fk_order_items_product
          column: product
          target:
            table: products
            column: id
          kind: inferred
```

---

## x-relational-db-schema Extension

### Purpose

`x-relational-db-schema` is a claim-level extension for RDBMS-specific schema
choices that are outside the core Data Sketch vocabulary: data type overrides,
foreign key overrides, unique and check constraints, indexes, and table and
column name overrides.

The projector reads `x-relational-db-schema` from the built-in Extension
Projection and applies it while building that claim's projected table(s), so
the Relational DB Projection already reflects these overrides (see Application
Order). Renderers such as `table-doc` read the Relational DB Projection
directly and do not apply `x-relational-db-schema` themselves.

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
  `keys.foreign.references.table` references a table, by projected identifier
  (see Column References). `constraints.check.expression` is the one
  exception: it is a raw SQL string using final rendered names.
- Composite primary keys and composite foreign keys (more than one column on
  either side) are outside this version's scope. The override extension has no
  `keys.primary` member; the projection's surrogate `id` primary key
  (`tables[].keys.primary`) cannot be replaced or overridden.
- Extension-provided names are used as-is.
- `keys.foreign`, `constraints`, and `indexes` apply only to the claim's own
  projected table, not to any child tables generated from array-of-objects
  paths. `names.tables` and `names.columns` may reference any of the claim's
  projected tables, including child tables.

### Name Overrides

`names` has two members, `tables` and `columns`, both keyed using the
identifiers produced for the claim before `x-relational-db-schema` is applied.

- `names.tables` is keyed by projected table ID (the claim's own table ID, or a
  child table ID such as `order.items[]`). Each value replaces that table's
  projected `name`.
- `names.columns` is keyed by projected table ID, then by projected column `id`
  (a source detail path, a relation source path, the reserved key `id` for the
  surrogate key column, or a generated structural foreign key column `id`).
  Each value replaces that column's projected `name`.

Example: renaming the `order_items` child table and its structural foreign key
column `order`, which otherwise collides with the SQL `ORDER` keyword:

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
`constraints.unique.columns`, and `indexes.columns` reference columns by
**projected column `id`** — the same identifier space as `names.columns` (a
source detail path, a relation source path, the reserved key `id` for the
surrogate key column, or a generated structural foreign key column `id`).
`keys.foreign.references.table` references a table by **projected table ID**
— the same identifier space as `names.tables` (the claim's own table ID, or a
child table ID such as `order.items[]`).

The projector resolves `keys.foreign`, `constraints`, and `indexes` against the
projected tables and columns produced before `x-relational-db-schema` is
applied (Table Shape, Column Shape, and Relation And Foreign Key Rules), and
before applying `names`, so these overrides are independent of `names` (see
Application Order). A `keys.foreign`, `constraints`, or `indexes` entry that
references a column `id` or table ID that does not exist among those projected
tables and columns is a validation error.

`constraints.check.expression` is the one exception to this convention: it is a
raw SQL string using the table's final rendered (post-`names`) column names,
because the projector cannot rewrite identifiers inside an opaque expression
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

- A matching `types` entry takes precedence over the type produced by Type
  Rules.
- Missing detail paths continue to use the type produced by Type Rules.
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
  existing item in the `keys.foreign` list produced by Relation And Foreign Key
  Rules (regardless of that foreign key's `kind`) **replaces** that item's
  `name`, `references`, and `columns`.
- An override `keys.foreign` entry that matches no existing foreign key is an
  **additional** foreign key, with `kind: extension` (see Relation And Foreign
  Key Rules).
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
  column `id`s); they are always additive, since the projector does not
  otherwise generate unique constraints.
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
- `indexes` is always additive, since the projector does not otherwise generate
  indexes.
- `indexes` entries do not have a `unique` flag; uniqueness is expressed only
  through `constraints.unique`.

### Application Order

The projector applies `x-relational-db-schema` while building a claim's
projected table(s), in the following order, where each step acts on the result
of the previous step:

1. Apply `types` to column types, keyed by projected column `id`.
2. Apply the override's `keys.foreign` entries to the `keys.foreign` list
   produced by Relation And Foreign Key Rules, using the matching and
   precedence rules in Foreign Key Overrides.
3. Set `constraints.unique` from the override's `constraints.unique` entries
   and `constraints.check` from the override's `constraints.check` entries.
4. Add `indexes` from the override's `indexes` entries.
5. Apply `names.tables` and `names.columns` to determine the projected table
   and column `name`s. `constraints.check.expression` is a raw SQL string that
   assumes these final names and is not rewritten by this step. When a
   `names.columns` entry renames a column, the new name also replaces that
   column's name everywhere else it is used within the same table:
   `keys.primary.columns`, `keys.foreign[].column`,
   `constraints.unique[].columns`, and `indexes[].columns`.

After steps 1-5 have been applied for every claim that carries
`x-relational-db-schema`, the projector makes one final pass over every
projected table's `keys.foreign` list: if a foreign key's `target.table` was
renamed by another claim's `names.tables`, `target.table` is replaced with the
new table name, and if `target.column` was renamed by that claim's
`names.columns`, `target.column` is replaced with the new column name. This
lets a `names` override in one claim's `x-relational-db-schema` propagate to
foreign keys in other claims' projected tables that reference the renamed
table or column.

When a claim does not carry `x-relational-db-schema`, its projected table(s)
have empty `constraints.unique`, `constraints.check`, and `indexes`, and
`keys`, `columns`, and `name` are produced as described earlier in this
specification, unaffected by steps 1-5 (though `keys.foreign[].target.table`
and `target.column` may still be updated by the final pass above if another
claim renames the referenced table or column).

### Validation

Resolving `x-relational-db-schema` column and table references, rejecting
unsupported types or composite keys, and detecting conflicting override
entries (and so on) happens while applying the steps above, and is a
projection error like the other projection errors in this specification (for
example, a projected table name conflict). It is not part of core Data Sketch
document validation.

---

## Basic List Form Example

Input Data Sketch excerpt:

```yaml
claims:
  customer:
    name: customers
    details:
      - name
      - email
      - phoneNumber
      - address.city
      - address.postalCode

  product:
    name: products
    details:
      - name
      - price
      - inventoryStatus

  order:
    name: orders
    details:
      - status
      - orderedAt
      - items[].quantity
      - items[].unitPrice
    relations:
      customer: customer
      items[].product: product
```

Projection:

```yaml
data-sketch/relational-db-projection: 1.0.0-draft.3
tables:
  customer:
    name: customers
    columns:
      - id: id
        name: id
        type: CHAR(26)
      - id: name
        name: name
        type: VARCHAR(1024)
      - id: email
        name: email
        type: VARCHAR(1024)
      - id: phoneNumber
        name: phone_number
        type: VARCHAR(1024)
      - id: address.city
        name: address_city
        type: VARCHAR(1024)
      - id: address.postalCode
        name: address_postal_code
        type: VARCHAR(1024)
    keys:
      primary:
        name: pk_customers
        columns:
          - id
      foreign: []

  product:
    name: products
    columns:
      - id: id
        name: id
        type: CHAR(26)
      - id: name
        name: name
        type: VARCHAR(1024)
      - id: price
        name: price
        type: VARCHAR(1024)
      - id: inventoryStatus
        name: inventory_status
        type: VARCHAR(1024)
    keys:
      primary:
        name: pk_products
        columns:
          - id
      foreign: []

  order:
    name: orders
    columns:
      - id: id
        name: id
        type: CHAR(26)
      - id: status
        name: status
        type: VARCHAR(1024)
      - id: orderedAt
        name: ordered_at
        type: VARCHAR(1024)
      - id: customer
        name: customer
        type: CHAR(26)
    keys:
      primary:
        name: pk_orders
        columns:
          - id
      foreign:
        - name: fk_orders_customer
          column: customer
          target:
            table: customers
            column: id
          kind: explicit

  "order.items[]":
    name: order_items
    columns:
      - id: id
        name: id
        type: CHAR(26)
      - id: order
        name: order
        type: CHAR(26)
      - id: items[].quantity
        name: quantity
        type: VARCHAR(1024)
      - id: items[].unitPrice
        name: unit_price
        type: VARCHAR(1024)
      - id: items[].product
        name: product
        type: CHAR(26)
    keys:
      primary:
        name: pk_order_items
        columns:
          - id
      foreign:
        - name: fk_order_items_order
          column: order
          target:
            table: orders
            column: id
          kind: structural
        - name: fk_order_items_product
          column: product
          target:
            table: products
            column: id
          kind: explicit
```

---

## Nested Object And Array Examples

Nested object inside a child table:

```yaml
details:
  - items[].stocks.price
  - items[].stocks.quantity
```

```yaml
tables:
  "order.items[]":
    name: order_items
    columns:
      - id: id
        name: id
        type: CHAR(26)
      - id: order
        name: order
        type: CHAR(26)
      - id: items[].stocks.price
        name: stocks_price
        type: VARCHAR(1024)
      - id: items[].stocks.quantity
        name: stocks_quantity
        type: VARCHAR(1024)
    keys:
      primary:
        name: pk_order_items
        columns:
          - id
      foreign:
        - name: fk_order_items_order
          column: order
          target:
            table: orders
            column: id
          kind: structural
```

Nested array child table:

```yaml
details:
  - items[].stocks[].price
  - items[].stocks[].quantity
```

```yaml
tables:
  "order.items[]":
    name: order_items
    columns:
      - id: id
        name: id
        type: CHAR(26)
      - id: order
        name: order
        type: CHAR(26)
    keys:
      primary:
        name: pk_order_items
        columns:
          - id
      foreign:
        - name: fk_order_items_order
          column: order
          target:
            table: orders
            column: id
          kind: structural

  "order.items[].stocks[]":
    name: order_items_stocks
    columns:
      - id: id
        name: id
        type: CHAR(26)
      - id: order.items[]
        name: order_items
        type: CHAR(26)
      - id: items[].stocks[].price
        name: price
        type: VARCHAR(1024)
      - id: items[].stocks[].quantity
        name: quantity
        type: VARCHAR(1024)
    keys:
      primary:
        name: pk_order_items_stocks
        columns:
          - id
      foreign:
        - name: fk_order_items_stocks_order_items
          column: order_items
          target:
            table: order_items
            column: id
          kind: structural
```

---

## Non-Goals

The Relational DB projector does not:

- create entity splits that are not required by explicit array projection rules
- infer domain foreign keys from non-exact matching names such as `customerId`,
  `orderId`, or `productId`
- perform full normalization
- choose a database vendor dialect
- generate executable DDL
- preserve context metadata such as `reason` or `traces` as relational fields
