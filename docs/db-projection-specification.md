# Db Projection Specification

## Purpose

A db projection snapshot is the database-focused shape produced from a Data
Sketch Specification. It is an intermediate representation for commands that need
database-facing names and constraints.

The snapshot uses implementation-facing names only. Logical store IDs and field
IDs are used to resolve references, but they are not included in the output.

## Root Shape

```json
{
  "data-sketch/db-projection-snapshot": "1.0.0-draft.1",
  "tables": []
}
```

- `data-sketch/db-projection-snapshot`: snapshot format version.
- `tables`: projected tables in the same order as `stores`.

## Projection Rules

- Each store becomes one table.
- Each field becomes one column.
- Store and field `name` values become table and column names.
- Field `type`, `nullable`, and `default` are preserved for database rendering.
- Omitted defaults become `{ "kind": "omitted" }`.
- Present defaults become `{ "kind": "value", "value": ... }`.
- Primary keys, unique constraints, foreign keys, and indexes use projected
  column names.
- Foreign key references use projected table and column names.
- Field `enum` values become named check constraints.

## Table Shape

```json
{
  "name": "orders",
  "columns": [],
  "uniqueConstraints": [],
  "foreignKeys": [],
  "indexes": [],
  "checkConstraints": [],
  "primaryKey": {
    "name": "pk_orders",
    "columns": ["id"]
  }
}
```

- `name`: projected table name.
- `columns`: projected columns in field order.
- `uniqueConstraints`: unique constraints in specification order.
- `foreignKeys`: foreign keys in specification order.
- `indexes`: indexes in specification order.
- `checkConstraints`: enum-derived check constraints in field order.
- `primaryKey`: omitted when the store has no primary key.

## Column Shape

```json
{
  "name": "status",
  "type": {
    "name": "varchar",
    "length": 20
  },
  "nullable": false,
  "default": {
    "kind": "value",
    "value": "active"
  }
}
```

`type` has the same shape as the source field type.

## Constraint And Index Shapes

Primary keys and unique constraints use the same shape:

```json
{
  "name": "pk_cart_items",
  "columns": ["cart_id", "product_id"]
}
```

Foreign keys use projected local and referenced names:

```json
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
```

Indexes contain projected columns. Ordered index fields preserve `order`.

```json
{
  "name": "ix_orders_customer_created_at",
  "columns": [
    {
      "name": "customer_id"
    },
    {
      "name": "created_at",
      "order": "desc"
    }
  ]
}
```

Enum-derived check constraints are named `ck_<table name>_<column name>` and use
this shape:

```json
{
  "name": "ck_orders_status",
  "column": "status",
  "values": ["created", "cancelled"]
}
```

## Example

Input:

```yaml
data-sketch: 1.0.0-draft.1

info:
  name: online-shop

stores:
  customer:
    name: customers
    reason: Customer profiles need to be looked up when handling orders and support requests.
    traces:
      operations:
        - getCustomer
    fields:
      id:
        name: id
        type:
          name: integer
        nullable: false
    keys:
      primary:
        name: pk_customers
        fields:
          - id
  order:
    name: orders
    reason: Customers need to view their order history after placing an order.
    traces:
      operations:
        - createOrder
    fields:
      id:
        name: id
        type:
          name: integer
        nullable: false
      customerId:
        name: customer_id
        type:
          name: integer
        nullable: false
      status:
        name: status
        type:
          name: varchar
          length: 20
        nullable: false
        default: created
        enum:
          - created
          - cancelled
    keys:
      primary:
        name: pk_orders
        fields:
          - id
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
  cartItem:
    name: cart_items
    reason: Customers need to see which products they've added to their cart.
    traces:
      operations:
        - getCart
    fields:
      cartId:
        name: cart_id
        type:
          name: integer
        nullable: false
      productId:
        name: product_id
        type:
          name: integer
        nullable: false
      quantity:
        name: quantity
        type:
          name: integer
        nullable: false
        default: 1
    keys:
      primary:
        name: pk_cart_items
        fields:
          - cartId
          - productId
```

Output:

```json
{
  "data-sketch/db-projection-snapshot": "1.0.0-draft.1",
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
        }
      ],
      "uniqueConstraints": [],
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
            "kind": "value",
            "value": "created"
          }
        }
      ],
      "uniqueConstraints": [],
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
    },
    {
      "name": "cart_items",
      "columns": [
        {
          "name": "cart_id",
          "type": {
            "name": "integer"
          },
          "nullable": false,
          "default": {
            "kind": "omitted"
          }
        },
        {
          "name": "product_id",
          "type": {
            "name": "integer"
          },
          "nullable": false,
          "default": {
            "kind": "omitted"
          }
        },
        {
          "name": "quantity",
          "type": {
            "name": "integer"
          },
          "nullable": false,
          "default": {
            "kind": "value",
            "value": 1
          }
        }
      ],
      "uniqueConstraints": [],
      "foreignKeys": [],
      "indexes": [],
      "checkConstraints": [],
      "primaryKey": {
        "name": "pk_cart_items",
        "columns": ["cart_id", "product_id"]
      }
    }
  ]
}
```
