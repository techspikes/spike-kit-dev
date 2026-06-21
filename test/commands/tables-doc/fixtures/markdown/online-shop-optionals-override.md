---
source: test/commands/tables-doc/fixtures/sketches/online-shop-optionals-override.valid.yaml
sha256: 8830bef74d684562571af2c9511a30c9e266e43ebb5f18b1761ae645de187ce2
generated_at: <generated_at>
---

# online-shop

## shipments

Shipment information is needed after creation so the service can confirm
the shipment was registered.

| Column | Data Type | Nullable | Description |
| --- | --- | --- | --- |
| id | CHAR(26) | no | Auto-assigned surrogate key |
| tracking\_number | VARCHAR(40) | yes | - |
| delivery\_instructions | VARCHAR(40) | no | - |

### Primary Key

| Constraint Name | Columns |
| --- | --- |
| pk\_shipments | id |

## DDL

```sql
CREATE TABLE "shipments" (
  "id" CHAR(26) NOT NULL,
  "tracking_number" VARCHAR(40),
  "delivery_instructions" VARCHAR(40) NOT NULL,
  CONSTRAINT "pk_shipments" PRIMARY KEY ("id")
);
```

## ER Diagram

```mermaid
erDiagram
  shipments {
    CHAR_26 id PK
    VARCHAR_40 tracking_number
    VARCHAR_40 delivery_instructions
  }
```
