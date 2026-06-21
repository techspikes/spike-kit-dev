---
source: test/commands/tables-doc/fixtures/sketches/online-shop-optionals-override.valid.yaml
sha256: 55651791caaad943a351dcc53a0701b4fc3da4f43742f907f1803cd148a2509e
generated_at: <generated_at>
---

# online-shop

## widgets

Widget information is needed after creation so the service can confirm
the widget was registered.

| Column | Data Type | Nullable | Description |
| --- | --- | --- | --- |
| id | CHAR(26) | no | Auto-assigned surrogate key |
| required\_field | VARCHAR(40) | yes | - |
| optional\_field | VARCHAR(40) | no | - |

### Primary Key

| Constraint Name | Columns |
| --- | --- |
| pk\_widgets | id |

## DDL

```sql
CREATE TABLE widgets (
  id CHAR(26) NOT NULL,
  required_field VARCHAR(40),
  optional_field VARCHAR(40) NOT NULL,
  CONSTRAINT pk_widgets PRIMARY KEY (id)
);
```

## ER Diagram

```mermaid
erDiagram
  widgets {
    CHAR_26 id PK
    VARCHAR_40 required_field
    VARCHAR_40 optional_field
  }
```
