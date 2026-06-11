---
source: online-shop-priced-products.valid.yaml
source_sha256: 4f95a9ca6ed1ef041d6d72e202c274f7b7f1629c639c9c99c856cb7333adb141
generated_at: <generated-at>
---

# online-shop

## price_notes

Product managers keep pricing notes before publishing products.

| Column | Data Type | Nullable | Default | Format | Description |
| --- | --- | --- | --- | --- | --- |
| note | varchar(100) | no | draft |  |  |

## categories

Product catalog groups products by category.

| Column | Data Type | Nullable | Default | Format | Description |
| --- | --- | --- | --- | --- | --- |
| id | integer | no |  |  |  |
| name | varchar(100) | no |  |  |  |

### Primary Key

| Constraint Name | Columns |
| --- | --- |
| pk\_categories | id |

## products

Product catalog needs prices for online checkout.

| Column | Data Type | Nullable | Default | Format | Description |
| --- | --- | --- | --- | --- | --- |
| id | integer | no |  |  |  |
| category\_id | integer | no |  |  |  |
| price | decimal(10, 2) | no | 0 |  | checkout price |
| tax\_rate | numeric(5) | no | 8 |  | sales tax rate |
| status | varchar(20) | no | available |  | product availability |
| featured | boolean | no | true |  | promoted product |
| discontinued | boolean | no | false |  | retired product |
| sale\_ends\_at | timestamp | yes | null |  | sale end date |

### Primary Key

| Constraint Name | Columns |
| --- | --- |
| pk\_products | id |

### Foreign Keys

| Constraint Name | Columns | Referenced Table | Referenced Columns | On Delete | On Update |
| --- | --- | --- | --- | --- | --- |
| fk\_products\_category | category\_id | categories | id |  |  |

### Indexes

| Index Name | Indexed Columns | Description |
| --- | --- | --- |
| ix\_products\_price | price |  |

## DDL

```sql
CREATE TABLE price_notes (
  note VARCHAR(100) DEFAULT 'draft' NOT NULL
);

CREATE TABLE categories (
  id INTEGER NOT NULL,
  name VARCHAR(100) NOT NULL,
  CONSTRAINT pk_categories PRIMARY KEY (id)
);

CREATE TABLE products (
  id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  price DECIMAL(10, 2) DEFAULT 0 NOT NULL,
  tax_rate NUMERIC(5) DEFAULT 8 NOT NULL,
  status VARCHAR(20) DEFAULT 'available' NOT NULL,
  featured BOOLEAN DEFAULT TRUE NOT NULL,
  discontinued BOOLEAN DEFAULT FALSE NOT NULL,
  sale_ends_at TIMESTAMP DEFAULT NULL,
  CONSTRAINT pk_products PRIMARY KEY (id),
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories (id)
);

CREATE INDEX ix_products_price ON products (price);
```
