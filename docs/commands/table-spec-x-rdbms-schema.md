# Table Spec x-rdbms-schema Specification

## Purpose

`x-rdbms-schema` is a table-spec command extension for describing RDBMS-specific
schema choices that are outside the core Data Sketch vocabulary.

The Relational DB projector does not interpret `x-rdbms-schema`. The table-spec
command uses this extension when it renders table specifications from a
Relational DB projection.

---

## Placement

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

---

## Supported Members

Rules:

- `data-types` overrides table-spec column data types.
- `keys.primary` overrides the primary key rendered for the table.
- `keys.foreign` defines explicit foreign keys.
- `keys.unique` defines unique constraints.
- `indexes` defines non-unique indexes.
- Composite primary keys and composite foreign keys may be expressed by listing
  multiple columns in this extension.
- Extension-provided names are used as-is.

---

## Data Type Overrides

`data-types` is keyed by Data Sketch detail path.

```yaml
x-rdbms-schema:
  data-types:
    status:
      type: VARCHAR
      length: 20
```

Rules:

- A matching `data-types` entry takes precedence over default table-spec type
  rendering.
- Missing detail paths continue to use the default table-spec type rendering.

---

## Key And Constraint Overrides

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

---

## Index Overrides

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
