# Db Projection Specification

## Purpose

A db projection snapshot is the database-focused representation projected from a
Valuable Data Specification. Commands that render database-facing artifacts use
this snapshot as their input.

## Projection Rules

- Stores become tables.
- Fields become columns.
- Primary keys, unique constraints, foreign keys, indexes, and check constraints
  are projected from the Specification.
- Field `enum` values become check constraints.
- A check constraint name is `ck_<table name>_<column name>`.

## Snapshot Shape

The snapshot root contains the db projection snapshot version and the projected
tables.

```json
{
  "data-sketch/db-projection-snapshot": "1.0.0-draft.0",
  "tables": []
}
```

Projected tables and columns use implementation-facing `name` values only. The
snapshot does not include logical store or field IDs.

A check constraint uses this shape:

```json
{
  "name": "ck_orders_status",
  "column": "status",
  "values": ["created", "cancelled"]
}
```

## Example

Input `online-shop-example.yaml`:

```yaml
data-sketch: 1.0.0-draft.0

info:
  name: online-shop

sources:
  openapi: ./openapi.yaml

stores:
  customer:
    name: customers
    reason: Persist customer information.
    trace:
      operations:
        - createCustomer
        - getCustomer

    fields:
      id:
        name: id
        type:
          name: integer
        nullable: false

      publicId:
        name: public_id
        type:
          name: char
          length: 26
        nullable: false
        format: ulid
        aliases:
          - customer number
          - customer code

      name:
        name: name
        type:
          name: varchar
          length: 100
        nullable: false
        aliases:
          - customer full name

    keys:
      primary:
        name: pk_customers
        fields:
          - id

      unique:
        - name: ux_customers_public_id
          fields:
            - publicId

  order:
    name: orders
    reason: Order operations need to create, read, list, and cancel orders.
    trace:
      operations:
        - createOrder
        - getOrderDetail
        - cancelOrder
        - listOrders

    fields:
      id:
        name: id
        type:
          name: integer
        nullable: false

      publicId:
        name: public_id
        type:
          name: char
          length: 26
        nullable: false
        format: ulid
        aliases:
          - order number

      customerId:
        name: customer_id
        type:
          name: integer
        nullable: false
        aliases:
          - buyer customer

      status:
        name: status
        type:
          name: varchar
          length: 20
        nullable: false
        aliases:
          - order state
          - fulfillment status
        enum:
          - created
          - cancelled

      createdAt:
        name: created_at
        type:
          name: timestamp
        nullable: false

      updatedAt:
        name: updated_at
        type:
          name: timestamp
        nullable: false

    keys:
      primary:
        name: pk_orders
        fields:
          - id

      unique:
        - name: ux_orders_public_id
          fields:
            - publicId

      foreign:
        - name: fk_orders_customer
          fields:
            - customerId
          references:
            store: customer
            fields:
              - id
          onDelete: restrict
          onUpdate: restrict

    indexes:
      - name: ix_orders_status
        fields:
          - status
        reason: Used to search orders by status.

      - name: ix_orders_customer_created_at
        fields:
          - customerId
          - createdAt
        reason: Used to list orders for a customer.
```

Output `online-shop-example.db-projection-snapshot.json`:

```json
{
  "data-sketch/db-projection-snapshot": "1.0.0-draft.0",
  "tables": [
    {
      "name": "customers",
      "columns": [
        {
          "name": "id",
          "type": {
            "name": "integer"
          },
          "nullable": false,
          "default": {
            "kind": "omitted"
          }
        },
        {
          "name": "public_id",
          "type": {
            "name": "char",
            "length": 26
          },
          "nullable": false,
          "default": {
            "kind": "omitted"
          }
        },
        {
          "name": "name",
          "type": {
            "name": "varchar",
            "length": 100
          },
          "nullable": false,
          "default": {
            "kind": "omitted"
          }
        }
      ],
      "uniqueConstraints": [
        {
          "name": "ux_customers_public_id",
          "columns": ["public_id"]
        }
      ],
      "foreignKeys": [],
      "indexes": [],
      "checkConstraints": [],
      "primaryKey": {
        "name": "pk_customers",
        "columns": ["id"]
      }
    },
    {
      "name": "orders",
      "columns": [
        {
          "name": "id",
          "type": {
            "name": "integer"
          },
          "nullable": false,
          "default": {
            "kind": "omitted"
          }
        },
        {
          "name": "public_id",
          "type": {
            "name": "char",
            "length": 26
          },
          "nullable": false,
          "default": {
            "kind": "omitted"
          }
        },
        {
          "name": "customer_id",
          "type": {
            "name": "integer"
          },
          "nullable": false,
          "default": {
            "kind": "omitted"
          }
        },
        {
          "name": "status",
          "type": {
            "name": "varchar",
            "length": 20
          },
          "nullable": false,
          "default": {
            "kind": "omitted"
          }
        },
        {
          "name": "created_at",
          "type": {
            "name": "timestamp"
          },
          "nullable": false,
          "default": {
            "kind": "omitted"
          }
        },
        {
          "name": "updated_at",
          "type": {
            "name": "timestamp"
          },
          "nullable": false,
          "default": {
            "kind": "omitted"
          }
        }
      ],
      "uniqueConstraints": [
        {
          "name": "ux_orders_public_id",
          "columns": ["public_id"]
        }
      ],
      "foreignKeys": [
        {
          "name": "fk_orders_customer",
          "columns": ["customer_id"],
          "references": {
            "table": "customers",
            "columns": ["id"]
          },
          "onDelete": "restrict",
          "onUpdate": "restrict"
        }
      ],
      "indexes": [
        {
          "name": "ix_orders_status",
          "columns": [
            {
              "name": "status"
            }
          ]
        },
        {
          "name": "ix_orders_customer_created_at",
          "columns": [
            {
              "name": "customer_id"
            },
            {
              "name": "created_at"
            }
          ]
        }
      ],
      "checkConstraints": [
        {
          "name": "ck_orders_status",
          "column": "status",
          "values": ["created", "cancelled"]
        }
      ],
      "primaryKey": {
        "name": "pk_orders",
        "columns": ["id"]
      }
    }
  ]
}
```
