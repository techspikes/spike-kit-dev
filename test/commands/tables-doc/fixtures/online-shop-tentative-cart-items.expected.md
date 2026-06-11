---
source: online-shop-tentative-cart-items.valid.yaml
sha256: 6f342b7dca4cb72d22eea94faa0c883658c15be85e71fdd9366e307259f8daac
generated_at: <generated-at>
---

# online-shop

## cart_items

Customers need to see which products they've added to their cart.

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
