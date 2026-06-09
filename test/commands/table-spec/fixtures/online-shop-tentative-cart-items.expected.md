---
source: online-shop-tentative-cart-items.valid.yaml
source_sha256: c7416a381e89e532cd1c53a6f453ea4da750138a7e737cfcd3d8570413d62838
generated_at: <generated-at>
---

# online-shop

## cart_items

Persist products added to shopping carts.

> [!CAUTION]
> This table is tentative and needs human review.

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
