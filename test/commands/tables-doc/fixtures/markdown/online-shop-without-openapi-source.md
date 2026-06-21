---
source: online-shop-without-openapi-source.valid.yaml
sha256: 652fe389680eabe3590a8cd7f468e5b52d53f64aa0eedf3e02e2eb46dcf73031
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
