---
source: online-shop-without-openapi-source.valid.yaml
sha256: 8c2a2bccf3caa3bf383ce6f6d1cb955c83293f3a8469d8ce0f0fec4fa24ae61f
generated_at: <generated_at>
---

# no-openapi-shop

## customers

Customer data stored without an OpenAPI source.

| Column | Data Type | Nullable | Description |
| --- | --- | --- | --- |
| id | CHAR(26) | no | Auto-assigned surrogate key |
| name | VARCHAR(1024) | no | - |
| email | VARCHAR(1024) | no | - |

### Primary Key

| Constraint Name | Columns |
| --- | --- |
| pk\_customers | id |

## DDL

```sql
CREATE TABLE "customers" (
  "id" CHAR(26) NOT NULL,
  "name" VARCHAR(1024) NOT NULL,
  "email" VARCHAR(1024) NOT NULL,
  CONSTRAINT "pk_customers" PRIMARY KEY ("id")
);
```

## ER Diagram

```mermaid
erDiagram
  customers {
    CHAR_26 id PK
    VARCHAR_1024 name
    VARCHAR_1024 email
  }
```
