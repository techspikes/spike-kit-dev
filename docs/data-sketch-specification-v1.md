# Data Sketch Specification v1

## Purpose

Data Sketch Specification v1 is a YAML or JSON specification for describing data
that a service currently claims may be worth remembering, based on Tale, user
story, and OpenAPI context.

A Data Sketch is not a database design document. It is a lightweight,
revisable sketch of valuable data and the concrete details that support it. It
is expected to be rewritten or discarded as user stories, feedback, and team
learning change.

This specification is intended to be used as:

- input for tools that validate Data Sketch documents
- traceability between user-facing operations and data claims

---

## Core Terms

| Term | Meaning |
|---|---|
| Valuable Data | Data described by a Data Sketch. |
| `claim` | A provisional assertion that this service may need to remember a valuable data subject in order to fulfill the Tale. |
| `name` | An explicit name for a claim or detail. |
| `detail` | A concrete item that describes or supports a claim. |
| `relation` | A logical relationship from a claim path to another claim. |
| `reason` | Human-readable explanation of the context that makes an item worth remembering. |
| `traces` | Metadata that links claims to user-facing operations. |

The `reason` and `traces` fields make the document AI First: they preserve
enough context for AI and humans to understand why a claim exists and which
user-facing operations it supports.

A claim is not necessarily:

- an RDBMS table
- a DocumentDB collection
- a fully normalized entity
- a final domain model

Relations are logical relationships. The Data Sketch records that the
relationship exists; consuming tools decide how to use it.

---

## Root Structure

```yaml
data-sketch: 1.0.0-draft.2

info:
  name: online-shop

sources:
  openapi: ./openapi.yaml

claims:
  customer:
    name: customers
    reason: |-
      Customer profile information is needed when customers are created and
      later looked up for ordering and support context.
    traces:
      operations:
        - createCustomer
        - getCustomer
    details:
      - name

  product:
    name: products
    reason: |-
      Product information is needed so users can browse products and select
      products for orders.
    traces:
      operations:
        - listProducts
    details:
      - name

  order:
    name: orders
    tentative: true
    reason: |-
      Order state is needed after checkout so the service can create an order
      and return its detail.
    traces:
      operations:
        - createOrder
        - getOrderDetail
    details:
      - status
      - orderedAt
      - items[].quantity
    relations:
      customer: customer
      items[].product: product
```

---

## Root Fields

| Field | Required | Description |
|---|---:|---|
| `data-sketch` | yes | Must be `1.0.0-draft.2`. |
| `info` | yes | Information about the Data Sketch. |
| `sources` | no | External sources used for trace validation and inference hints. |
| `claims` | yes | Non-empty map of logical claim IDs to claim definitions. |

Rules:

- `claims` is the only canonical root vocabulary for valuable data.
- A `claims` map key is a logical claim ID. It is separate from `claim.name`.
- Claim logical IDs must be unique.
- Claim implementation `name` values must be unique.

---

## Info

```yaml
info:
  name: online-shop
```

| Field | Required | Description |
|---|---:|---|
| `name` | yes | Name of the Data Sketch. Must be a non-empty string. |

---

## Sources

```yaml
sources:
  openapi: ./openapi.yaml
```

| Field | Required | Description |
|---|---:|---|
| `openapi` | no | Path to the OpenAPI YAML or JSON file used to validate trace names and provide inference hints. |
| `arrazo` | no | Reserved for an Arazzo Specification file used to trace workflows. |
| `asyncapi` | no | Reserved for an AsyncAPI file used to trace channels. |

Rules:

- If `sources.openapi` is omitted, tools keep `traces.operations` as contextual
  operation names and do not compare them with an OpenAPI file.
- If `sources.openapi` is present, tools load it as a path relative to the Data
  Sketch file.
- During OpenAPI trace validation, every traced operation name must exist as an
  OpenAPI Operation Object `operationId`.
- Duplicate `operationId` values in the OpenAPI file are invalid.
- An unreadable file, invalid YAML or JSON, or a missing traced operation name is
  a trace validation error.
- `sources.arrazo` is reserved for future trace validation with
  `traces.workflows`.
- `sources.asyncapi` is reserved for future trace validation with
  `traces.channels`.

---

## Claim

```yaml
claims:
  order:
    name: orders
    tentative: true
    reason: |-
      Order state is needed after checkout so the service can create an order
      and return its detail.
    traces:
      operations:
        - createOrder
        - getOrderDetail
    details:
      - status
      - orderedAt
      - items[].quantity
    relations:
      customer: customer
      items[].product: product
```

| Field | Required | Description |
|---|---:|---|
| `name` | yes | Implementation-facing claim name. |
| `reason` | yes | Context explaining why the claim may need to be remembered. |
| `traces` | yes | User-facing operation trace metadata. |
| `details` | conditional | Concrete items that describe or support the claim. |
| `relations` | conditional | Logical relationships from claim paths to other claims. |
| `tentative` | no | Whether this claim is tentative and needs stakeholder review. Defaults to `false`. |

Rules:

- Each claim must include at least one of `details` or `relations`.
- `traces.operations` is required and must be a non-empty list.
- If omitted, `tentative` is treated as `false`.
- A claim with `tentative: true` is still tentative and needs stakeholder review.

---

## Traces

```yaml
traces:
  operations:
    - createOrder
    - getOrderDetail
```

| Field | Required | Description |
|---|---:|---|
| `operations` | yes | Non-empty list of operation names. When `sources.openapi` is present, each value must match an OpenAPI `operationId`. |
| `workflows` | no | Reserved for Arazzo workflow trace names. |
| `channels` | no | Reserved for AsyncAPI channel trace names. |

Rules:

- Claim-level `traces.operations` is required.
- When `sources.openapi` is present, tools check these values against OpenAPI
  Operation Object `operationId` values.
- When `sources.openapi` is omitted, these values remain contextual trace names.
- `traces.workflows` is reserved for future Arazzo Specification trace support.
- `traces.channels` is reserved for future AsyncAPI trace support.

---

## Details

A detail is a concrete item that describes or supports a claim.

Write `details` in list form for the basic sketching style. List form keeps the
Data Sketch focused on the data this service may need to remember without
requiring early implementation decisions.

`id` and `_id` are reserved identity detail paths. Authors should not list `id`
or `_id` in `details`. Renderers or consuming tools usually add identity fields
automatically when needed.

Basic list form:

```yaml
details:
  - status
  - shippedAt
  - carrier.name
  - items[].quantity
```

Use map form when a detail needs simple metadata. A map-form detail may specify
`name`, `aliases`, `type`, and `required`.

Metadata map form:

```yaml
details:
  status:
    name: order status
    required: true
    aliases:
      - fulfillment status

  items[].quantity:
    name: item quantity
    type: number
```

Valid detail path examples:

```text
status
shippedAt
carrier.name
carrier.trackingNumber
items[].product
items[].quantity
tags[]
```

Rules:

- `details` must be either a non-empty list of path strings or a non-empty map
  of path strings to detail metadata.
- Every detail path must be non-empty.
- Every path segment must be non-empty.
- Detail paths must be unique.
- A detail path must not be a strict prefix of another detail path.
- A segment's object form and array form must not conflict.
- The implicit identity field must not be listed as a detail.

Invalid examples:

```yaml
details:
  - carrier
  - carrier.name
```

```yaml
details:
  - items.product
  - items[].product
```

---

## Detail Metadata

Map-form detail metadata may include:

| Field | Required | Description |
|---|---:|---|
| `name` | yes | Implementation-facing detail name. |
| `aliases` | no | Business-facing names or other aliases for the detail. |
| `type` | no | Data Sketch detail type. Defaults to `string`. Must be `string` or `number` when present. |
| `required` | no | Whether the detail is required. Defaults to `false`. |

Rules:

- List-form details do not carry metadata.
- Map-form details keep only simple Data Sketch metadata.

---

## Type

```yaml
type: string
```

```yaml
type: number
```

Supported Data Sketch detail type names:

```text
string
number
```

Rules:

- `type` is available only in map-form details and defaults to `string`.
- Storage-specific type information belongs in an `x-*` extension such as
  `x-rdbms-schema.data-types`.

---

## Relations

A relation is a logical relationship from a claim path to another claim.

Relations use a claim-level `relations` map. Each key is a path in the source
claim. Each value is either shorthand or object form.

Shorthand:

```yaml
relations:
  order: order
  items[].product: product
```

Object form:

```yaml
relations:
  order:
    to: order
    reason: |-
      The shipment needs to connect back to the order it fulfills.

  items[].product:
    to: product
    reason: |-
      Each shipped item needs to identify the product being shipped.
```

Object-form relation metadata:

| Field | Required | Description |
|---|---:|---|
| `to` | yes | Target claim logical ID. |
| `reason` | no | Context explaining why the relationship exists. |

Rules:

- `relations` is optional.
- When present, `relations` must be a map.
- The target claim must exist.
- Relation paths must be unique within a claim.
- Relation paths participate in the claim shape.
- A relation path does not have to be repeated in `details`.
- If a relation path is also listed in `details`, the document is invalid.

---

## Implicit Identity

Every claim has an implicit surrogate identity.

Rules:

- The identity is not declared in `details`.

---

## OpenAPI Trace And Inference

If `sources.openapi` is present:

- Load the OpenAPI YAML or JSON file relative to the Data Sketch file.
- Validate that every `traces.operations[]` value exists as an OpenAPI
  `operationId`.
- Duplicate OpenAPI `operationId` values are invalid.
- OpenAPI schemas may be used for type inference.

Tools should resolve detail types using this priority:

```text
1. Explicit detail metadata in map form
2. Traced OpenAPI schema, when the detail path exactly matches a JSON path
3. Fallback to loose interpretation
```

Rules:

- OpenAPI is a hint source, not the canonical Data Sketch shape.
- Inference must require exact JSON path matches.
- Tools must not infer from similar names.

---

## JSON Schema Projection Rules

JSON Schema projection should use the same claim model when implemented.

Rules:

- Each claim becomes a schema definition.
- `details` become JSON object properties.
- Dot paths create nested properties.
- `items[]` creates array schemas.
- `relations` become `$ref` to the target claim definition.

Example relation projection:

```json
{
  "$ref": "#/$defs/product"
}
```

---

## x-* Extensions

Extension fields whose names start with `x-` may be written on any object in a
Data Sketch.

Rules:

- Validators must allow `x-*`.
- Core validation must not assign meaning to `x-*`.
- The renderer or consuming tool decides how to interpret supported `x-*`
  fields.
- Tools should preserve `x-*` when possible.

Typical renderer-specific extension example:

```yaml
claims:
  order:
    name: orders
    reason: |-
      Order numbers are needed so customers and support staff can identify the
      same order.
    traces:
      operations:
        - getOrder
    details:
      - orderNumber
      - status
    x-rdbms-schema:
      data-types:
        status:
          type: varchar
          length: 20
      keys:
        unique:
          - orderNumber
      indexes:
        - status
```

`x-rdbms-schema` is not core Data Sketch vocabulary. An RDBMS renderer may
interpret `data-types`, `keys.unique`, and `indexes`, while other tools may
ignore them or preserve them for another tool.
