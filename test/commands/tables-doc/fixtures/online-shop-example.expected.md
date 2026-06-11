---
source: online-shop-example.valid.yaml
source_sha256: 699645ff97fb70a32f1625e9c2450e1872630e8b7a841099c032083dba8ee9de
generated_at: <generated-at>
---

# online-shop

## customers

Persist customer information.

| Column | Data Type | Nullable | Default | Format | Description |
| --- | --- | --- | --- | --- | --- |
| id | integer | no |  |  |  |
| public\_id | char(26) | no |  | ulid | customer number, customer code |
| name | varchar(100) | no |  |  | customer full name |

### Primary Key

| Constraint Name | Columns |
| --- | --- |
| pk\_customers | id |

### Unique Constraints

| Constraint Name | Columns |
| --- | --- |
| ux\_customers\_public\_id | public\_id |

## orders

Order operations need to create, read, list, and cancel orders.

| Column | Data Type | Nullable | Default | Format | Description |
| --- | --- | --- | --- | --- | --- |
| id | integer | no |  |  |  |
| public\_id | char(26) | no |  | ulid | order number |
| customer\_id | integer | no |  |  | buyer customer |
| status | varchar(20) | no |  |  | order state, fulfillment status |
| created\_at | timestamp | no |  |  |  |
| updated\_at | timestamp | no |  |  |  |

### Primary Key

| Constraint Name | Columns |
| --- | --- |
| pk\_orders | id |

### Unique Constraints

| Constraint Name | Columns |
| --- | --- |
| ux\_orders\_public\_id | public\_id |

### Foreign Keys

| Constraint Name | Columns | Referenced Table | Referenced Columns | On Delete | On Update |
| --- | --- | --- | --- | --- | --- |
| fk\_orders\_customer | customer\_id | customers | id | restrict | restrict |

### Check Constraints

| Constraint Name | Column | Values |
| --- | --- | --- |
| ck\_orders\_status | status | created, cancelled |

### Indexes

| Index Name | Indexed Columns | Description |
| --- | --- | --- |
| ix\_orders\_status | status | Used to search orders by status. |
| ix\_orders\_customer\_created\_at | customer\_id, created\_at | Used to list orders for a customer. |

## DDL

```sql
CREATE TABLE customers (
  id INTEGER NOT NULL,
  public_id CHAR(26) NOT NULL,
  name VARCHAR(100) NOT NULL,
  CONSTRAINT pk_customers PRIMARY KEY (id),
  CONSTRAINT ux_customers_public_id UNIQUE (public_id)
);

CREATE TABLE orders (
  id INTEGER NOT NULL,
  public_id CHAR(26) NOT NULL,
  customer_id INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  CONSTRAINT pk_orders PRIMARY KEY (id),
  CONSTRAINT ux_orders_public_id UNIQUE (public_id),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_orders_status CHECK (status IN ('created', 'cancelled'))
);

CREATE INDEX ix_orders_status ON orders (status);
CREATE INDEX ix_orders_customer_created_at ON orders (customer_id, created_at);
```
