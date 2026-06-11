---
source: online-shop-cart-items.valid.yaml
source_sha256: dad3d82f8d945e53c96cf5ce451b76f72dca0634bf4c63b9310b7b62c97ac064
generated_at: <generated-at>
---

# online-shop

## cart_items

Customers need to see which products they've added to their cart.

| Column | Data Type | Nullable | Default | Format | Description |
| --- | --- | --- | --- | --- | --- |
| cart\_id | integer | no |  |  |  |
| product\_id | integer | no |  |  |  |
| quantity | integer | no | 1 |  |  |

### Primary Key

| Constraint Name | Columns |
| --- | --- |
| pk\_cart\_items | cart\_id, product\_id |

## DDL

```sql
CREATE TABLE cart_items (
  cart_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER DEFAULT 1 NOT NULL,
  CONSTRAINT pk_cart_items PRIMARY KEY (cart_id, product_id)
);
```
