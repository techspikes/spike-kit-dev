---
source: test/core/projector/fixtures/online-shop-optionals-override.valid.yaml
sha256: 07e8b47ea8510ba0ef69380221da496eb0c2ff46305016232c9e5d004b93649b
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
