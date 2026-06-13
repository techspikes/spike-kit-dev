# Extension Projection Specification

## Purpose

The Extension projector preserves `x-*` extension fields from a parsed and
validated Data Sketch.

The projection lets renderers and database-facing commands use extension values
without requiring every other projection to carry renderer-specific fields.

---

## Root Shape

```yaml
data-sketch/extension-projection: 1.0.0-draft.2
extensions: []
```

Rules:

- `data-sketch/extension-projection` is the projection format version.
- `extensions` is an ordered list of extension entries.
- Entries are emitted only for extensible objects that contain at least one
  `x-*` field.

---

## Entry Shape

```yaml
path: claims.order
values:
  x-rdbms-schema:
    tableComment: Order records
```

Fields:

- `path`: location of the extensible object in the Data Sketch.
- `values`: map of preserved `x-*` fields and their original values.

Rules:

- The root Data Sketch object uses an empty `path`.
- `info` uses path `info`.
- `sources` uses path `sources`.
- Claim definitions use path `claims.<claim id>`.
- Claim `traces` objects use path `claims.<claim id>.traces`.
- Claim IDs cannot contain `.`, `[`, or `]`, so claim paths are unambiguous.
- Detail metadata is not extensible and is not included in this projection.

---

## Example

Input Data Sketch excerpt:

```yaml
data-sketch: 1.0.0-draft.2
x-note:
  purpose: preserve extension fields

info:
  name: online-shop
  x-owner: shop team

claims:
  customer:
    name: customers
    x-rdbms-schema:
      tableComment: Customer records
    reason: |-
      Customer profile information is needed when customers are created.
    traces:
      operations:
        - createCustomer
      x-trace-source: shopping journey
    details:
      - name
```

Projection:

```yaml
data-sketch/extension-projection: 1.0.0-draft.2
extensions:
  - path: ''
    values:
      x-note:
        purpose: preserve extension fields

  - path: info
    values:
      x-owner: shop team

  - path: claims.customer
    values:
      x-rdbms-schema:
        tableComment: Customer records

  - path: claims.customer.traces
    values:
      x-trace-source: shopping journey
```
