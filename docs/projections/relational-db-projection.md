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
data-sketch/relational-db-projection: 1.0.0-draft.2
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
- Detail-level metadata is not included as projection fields.
- Detail `type` may be used only to derive a column data type.
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
        type: VARCHAR(26)
    primaryKey:
      name: pk_orders
      columns:
        - id
    foreignKeys: []
```

Fields:

- table ID: map key under `tables`.
- `name`: projected table name.
- `columns`: ordered projected column definitions.
- `primaryKey`: primary key constraint.
- `foreignKeys`: ordered foreign key constraints with generated names and kind
  markers.

Rules:

- A parent table ID comes from the claim ID.
- A parent table name comes from the claim implementation `name`.
- A child table ID is derived from the parent claim ID and source array path.
- A child table ID preserves `[]` from the source array path.
- A child table name is derived from the table ID by converting path segments to
  snake_case and removing `[]`.
- Each array-of-objects path segment creates a table boundary. Nested
  array-of-objects segments create nested child tables.
- `primaryKey` is always set to the surrogate key column.
- `primaryKey.name` is generated as `pk_<projected table name>`.
  For example, `orders` becomes `pk_orders`, and `order_items` becomes
  `pk_order_items`.
- `foreignKeys` contains structural parent-child foreign keys, foreign keys
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
- Composite primary keys, composite foreign keys, uniqueness constraints, check
  constraints, and indexes are outside this projection.

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

- If no Data Sketch detail type is specified, the column type is `VARCHAR(1024)`.
- Data Sketch detail type `string` becomes `VARCHAR(1024)`.
- Data Sketch detail type `number` becomes `INTEGER`.
- Data Sketch detail type `boolean` becomes `BOOLEAN`.
- Only explicit Data Sketch detail type values from the parsed and validated
  specification are used. The Relational DB projector does not infer column
  types directly from OpenAPI.
- Data Sketch array-of-scalars details become `VARCHAR(1024)`.
- Surrogate key columns use `VARCHAR(26)`.
- Explicit relation and claim ID exact-match foreign key columns use
  `VARCHAR(26)`.
- Structural parent foreign key columns use `VARCHAR(26)`.
- SQL type strings are written in uppercase.

---

## Nullability Rules

Rules:

- Absence of `nullable` means the projected column is required and should be
  rendered as NOT NULL when the target renderer supports nullability.
- Surrogate key columns omit `nullable` because they are required by default.
- Structural parent foreign key columns omit `nullable` because they are
  required by default.
- List-form details omit `nullable` and are treated as required by default.
- Map-form detail `required: true` omits `nullable`.
- Map-form detail `required: false` emits `nullable: true`.
- If map-form detail metadata omits `required`, it is treated as required and
  omits `nullable`.
- Explicit and inferred foreign key columns keep the `nullable` value derived
  from their source detail.
- The Relational DB projector does not infer `nullable` from OpenAPI `required`
  lists.

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
- Renderers may ignore `kind: inferred` foreign keys when they require only
  explicit relationship declarations.
- A child table structural foreign key references the immediate parent projected
  table's surrogate key column `id`.
- A top-level array child table references the claim parent table.
- A nested array child table references the nearest generated child table from
  the previous array-of-objects boundary.
- A structural foreign key column is named from the parent projected table ID.
- A relation source path must also be listed in the same claim's `details`.
- A relation source path uses the already projected detail column as the foreign
  key column.
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
  - customer

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
        type: VARCHAR(26)
      - id: customer
        name: customer
        type: VARCHAR(26)
    primaryKey:
      name: pk_orders
      columns:
        - id
    foreignKeys:
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
        type: VARCHAR(26)
      - id: order
        name: order
        type: VARCHAR(26)
      - id: items[].product
        name: product
        type: VARCHAR(26)
    primaryKey:
      name: pk_order_items
      columns:
        - id
    foreignKeys:
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

## Renderer Overrides

The Relational DB projector intentionally keeps data types, primary keys, and
foreign keys simple.

Composite primary keys, composite foreign keys, uniqueness constraints, check
constraints, indexes, and other physical schema choices belong to a
renderer-specific extension such as `x-rdbms-schema`.
The Relational DB projection does not include those extension fields. A renderer
that applies overrides should read them from the built-in Extension Projection
alongside the Relational DB projection. The Relational DB projector itself does
not interpret renderer-specific override extensions.

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
      - customer
      - items[].quantity
      - items[].unitPrice
      - items[].product
    relations:
      customer: customer
      items[].product: product
```

Projection:

```yaml
data-sketch/relational-db-projection: 1.0.0-draft.2
tables:
  customer:
    name: customers
    columns:
      - id: id
        name: id
        type: VARCHAR(26)
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
    primaryKey:
      name: pk_customers
      columns:
        - id
    foreignKeys: []

  product:
    name: products
    columns:
      - id: id
        name: id
        type: VARCHAR(26)
      - id: name
        name: name
        type: VARCHAR(1024)
      - id: price
        name: price
        type: VARCHAR(1024)
      - id: inventoryStatus
        name: inventory_status
        type: VARCHAR(1024)
    primaryKey:
      name: pk_products
      columns:
        - id
    foreignKeys: []

  order:
    name: orders
    columns:
      - id: id
        name: id
        type: VARCHAR(26)
      - id: status
        name: status
        type: VARCHAR(1024)
      - id: orderedAt
        name: ordered_at
        type: VARCHAR(1024)
      - id: customer
        name: customer
        type: VARCHAR(26)
    primaryKey:
      name: pk_orders
      columns:
        - id
    foreignKeys:
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
        type: VARCHAR(26)
      - id: order
        name: order
        type: VARCHAR(26)
      - id: items[].quantity
        name: quantity
        type: VARCHAR(1024)
      - id: items[].unitPrice
        name: unit_price
        type: VARCHAR(1024)
      - id: items[].product
        name: product
        type: VARCHAR(26)
    primaryKey:
      name: pk_order_items
      columns:
        - id
    foreignKeys:
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
        type: VARCHAR(26)
      - id: order
        name: order
        type: VARCHAR(26)
      - id: items[].stocks.price
        name: stocks_price
        type: VARCHAR(1024)
      - id: items[].stocks.quantity
        name: stocks_quantity
        type: VARCHAR(1024)
    primaryKey:
      name: pk_order_items
      columns:
        - id
    foreignKeys:
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
        type: VARCHAR(26)
      - id: order
        name: order
        type: VARCHAR(26)
    primaryKey:
      name: pk_order_items
      columns:
        - id
    foreignKeys:
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
        type: VARCHAR(26)
      - id: order.items[]
        name: order_items
        type: VARCHAR(26)
      - id: items[].stocks[].price
        name: price
        type: VARCHAR(1024)
      - id: items[].stocks[].quantity
        name: quantity
        type: VARCHAR(1024)
    primaryKey:
      name: pk_order_items_stocks
      columns:
        - id
    foreignKeys:
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
