---
source: custom/source label
sha256: 63d7fbd49834bd9e8946fa50c4258fb9f931f7ce6a30ee85df25df035db9e8f1
generated_at: <generated_at>
---

# online-shop

## customers

Customer profile information is needed when orders are created.

| Column | Data Type | Nullable | Description |
| --- | --- | --- | --- |
| id | CHAR(26) | no | Auto-assigned surrogate key |
| name | VARCHAR(100) | no | - |
| phone | VARCHAR(1024) | yes | - |

### Primary Key

| Constraint Name | Columns |
| --- | --- |
| pk\_customers | id |

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

## order_items

Order state is needed after checkout so the service can create an order
and return its detail.

> [!CAUTION]
> This table is tentative and needs review.

| Column | Data Type | Nullable | Description |
| --- | --- | --- | --- |
| id | CHAR(26) | no | Auto-assigned surrogate key |
| order | CHAR(26) | no | - |
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
CREATE TABLE customers (
  id CHAR(26) NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(1024),
  CONSTRAINT pk_customers PRIMARY KEY (id)
);

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

CREATE INDEX idx_orders_status ON orders (status);
```
