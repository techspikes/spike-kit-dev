---
source: online-shop-cart-items.valid.yaml
source_sha256: 36695be29e2cf57b45aecb9b40cd2cb35c5209571745925a7df38edceb170121
generated_at: <generated-at>
---

# online-shop

## cart_items

Persist products added to shopping carts.

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
