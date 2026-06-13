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
| `name` | An implementation-facing name for a claim. |
| `detail` | A concrete item that describes or supports a claim. |
| `relation` | A logical relationship from a claim detail path to another claim. |
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
      Customer profile information is needed when customers are created.
    traces:
      operations:
        - createCustomer
    details:
      - name
```

---

## Root Fields

| Field | Required | Description |
|---|---:|---|
| `data-sketch` | yes | Must be `1.0.0-draft.2`. |
| `info` | yes | Information about the Data Sketch. |
| `sources` | no | External sources used for trace validation. |
| `claims` | yes | Non-empty map of logical claim IDs to claim definitions. |

Rules:

- `claims` is the only canonical root vocabulary for valuable data.
- A `claims` map key is a logical claim ID. It is separate from `claim.name`.
- Claim logical IDs must be unique.
- Claim logical IDs must not contain `.`, `[`, or `]`.
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
| `openapi` | no | Path to the OpenAPI YAML or JSON file used to validate trace names. |
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
      - customer
      - items[].quantity
      - items[].product
    relations:
      customer: customer
      items[].product: product
```

| Field | Required | Description |
|---|---:|---|
| `name` | yes | Implementation-facing claim name. |
| `reason` | yes | Context explaining why the claim may need to be remembered. |
| `traces` | yes | User-facing operation trace metadata. |
| `details` | yes | Concrete items that describe or support the claim. |
| `relations` | no | Logical relationships from claim detail paths to other claims. |
| `tentative` | no | Whether this claim is tentative and needs stakeholder review. Defaults to `false`. |

Rules:

- Each claim must include `details`.
- `traces.operations` is required and must be a non-empty list.
- Claim implementation `name` must not contain whitespace.
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

`id` and `_id` are reserved identity detail paths. Authors must not list `id`
or `_id` in `details`. Relational DB projections add a ULID surrogate key
column named `id` automatically for each projected table.

Basic list form:

```yaml
details:
  - status
  - shippedAt
  - carrier.name
  - items[].quantity
```

Use map form when a detail needs simple metadata. A map-form detail may specify
`aliases`, `type`, and `required`.

Metadata map form:

```yaml
details:
  status:
    aliases:
      - order status
      - fulfillment status
    type: string
    required: true

  items[].quantity:
    aliases:
      - item quantity
    type: number

  discontinued:
    aliases:
      - discontinued flag
    type: boolean
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

Detail path syntax:

- A detail path is a dot-separated list of path segments.
- A path segment is either `<name>` or `<name>[]`.
- `<name>` must be non-empty and must not contain `[` or `]`.
- The `[]` marker means the segment is an array.

Rules:

- `details` must be either a non-empty list of path strings or a non-empty map
  of path strings to detail metadata.
- Every detail path must be non-empty.
- Every path segment name must be non-empty.
- Detail paths must be unique.
- A detail path must not be a strict prefix of another detail path.
- A segment's object form and array form must not conflict.
- The reserved identity detail paths `id` and `_id` must not be listed as
  details.

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

```yaml
details:
  - carrier..name
```

```yaml
details:
  - '[].product'
```

---

## Detail Metadata

Map-form detail metadata may include:

| Field | Required | Description |
|---|---:|---|
| `aliases` | no | Business-facing names or other aliases for the detail. |
| `type` | no | Data Sketch detail type. Defaults to `string`. Must be `string`, `number`, or `boolean` when present. |
| `required` | no | Whether the detail is required. Defaults to `true`. |

Rules:

- List-form details do not carry metadata.
- Use `aliases` for business-facing display names or names that contain
  whitespace.
- If map-form detail metadata omits `required`, the detail is treated as
  required.
- Map-form detail metadata is limited to `aliases`, `type`, and `required`.

---

## Type

```yaml
type: string
```

```yaml
type: number
```

```yaml
type: boolean
```

Supported Data Sketch detail type names:

```text
string
number
boolean
```

Rules:

- `type` is available only in map-form details and defaults to `string`.
- Storage-specific type information belongs in renderer-specific `x-*`
  extensions, not in core Data Sketch detail metadata.

---

## Relations

A relation is a logical relationship from a claim detail to another claim.

Relations use a claim-level `relations` map. Each key is a path in the source
claim. Each value is the target claim logical ID.

```yaml
details:
  - customer
  - items[].product

relations:
  customer: customer
  items[].product: product
```

Rules:

- `relations` is optional.
- When present, `relations` must be a map.
- The target claim must exist.
- A relation target value is a claim logical ID, not a detail path.
- A relation always targets the target claim's implicit identity `id`.
- Do not write `.id` in the relation target value. Relation target values ending
  with `.id` are invalid.
- Relation paths must be unique within a claim.
- Relation paths must also be listed in the same claim's `details`.
- Relation paths must not use array-of-scalars details. A relation path ending
  with `[]` is invalid.
- Relational projections may use relation paths as foreign key columns.
- Relational projections may also create structural parent-child foreign keys
  from array-of-objects paths. Those foreign keys do not use `relations`.
- Relational projections may also infer foreign keys when a detail path's final
  segment exactly matches a claim ID. An explicit `relations` entry takes
  precedence over inferred relation behavior for the same detail path.

---

## Implicit Identity

Every claim has an implicit surrogate identity.

Rules:

- The identity is not declared in `details`.

---

## OpenAPI Trace

If `sources.openapi` is present:

- Load the OpenAPI YAML or JSON file relative to the Data Sketch file.
- Validate that every `traces.operations[]` value exists as an OpenAPI
  `operationId`.
- Duplicate OpenAPI `operationId` values are invalid.

Rules:

- OpenAPI is a trace validation source, not the canonical Data Sketch shape.
- Tools must not resolve detail types from OpenAPI.
- Tools must not infer from similar names.

---

## x-* Extensions

Extension fields whose names start with `x-` may be written on extensible
objects in a Data Sketch.

Extensible objects are:

- the root Data Sketch object
- `info`
- `sources`
- claim definitions
- `traces`

Rules:

- Validators must allow `x-*` on extensible objects.
- Fields that are not part of this specification and do not start with `x-` are
  invalid on extensible objects.
- Core validation must not assign meaning to `x-*`.
- The renderer or consuming tool decides how to interpret supported `x-*`
  fields.
- The built-in Extension Projection preserves `x-*` values for tools that need
  them after parsing and validation.
- `claims` and `relations` are maps whose keys are logical IDs or paths; they
  are not extension containers.
- Detail metadata is not extensible. It is limited to `aliases`, `type`, and
  `required`.

---

## Examples

### OpenAPI

```yaml
openapi: 3.1.0

info:
  title: Online Shop API
  version: 1.0.0

paths:
  /customers:
    post:
      operationId: createCustomer
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - name
                - email
              properties:
                name:
                  type: string
                email:
                  type: string
                phoneNumber:
                  type: string
                address:
                  type: object
                  properties:
                    city:
                      type: string
                    postalCode:
                      type: string
      responses:
        '201':
          description: Created customer
          content:
            application/json:
              schema:
                type: object
                properties:
                  customerId:
                    type: string
                  name:
                    type: string
                  email:
                    type: string
                  phoneNumber:
                    type: string
                  address:
                    type: object
                    properties:
                      city:
                        type: string
                      postalCode:
                        type: string

  /customers/{customerId}:
    get:
      operationId: getCustomer
      parameters:
        - name: customerId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Customer detail
          content:
            application/json:
              schema:
                type: object
                properties:
                  customerId:
                    type: string
                  name:
                    type: string
                  email:
                    type: string
                  phoneNumber:
                    type: string
                  address:
                    type: object
                    properties:
                      city:
                        type: string
                      postalCode:
                        type: string

  /products:
    get:
      operationId: listProducts
      responses:
        '200':
          description: Product list
          content:
            application/json:
              schema:
                type: object
                required:
                  - products
                properties:
                  products:
                    type: array
                    items:
                      type: object
                      properties:
                        productId:
                          type: string
                        name:
                          type: string
                        price:
                          type: number
                        inventoryStatus:
                          type: string

  /orders:
    post:
      operationId: createOrder
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - customerId
                - items
              properties:
                customerId:
                  type: string
                items:
                  type: array
                  items:
                    type: object
                    properties:
                      productId:
                        type: string
                      quantity:
                        type: number
      responses:
        '201':
          description: Created order
          content:
            application/json:
              schema:
                type: object
                properties:
                  orderId:
                    type: string
                  customerId:
                    type: string
                  status:
                    type: string
                  orderedAt:
                    type: string
                    format: date-time
                  items:
                    type: array
                    items:
                      type: object
                      properties:
                        productId:
                          type: string
                        quantity:
                          type: number
                        unitPrice:
                          type: number

  /orders/{orderId}:
    get:
      operationId: getOrderDetail
      parameters:
        - name: orderId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Order detail
          content:
            application/json:
              schema:
                type: object
                properties:
                  orderId:
                    type: string
                  customerId:
                    type: string
                  status:
                    type: string
                  orderedAt:
                    type: string
                    format: date-time
                  items:
                    type: array
                    items:
                      type: object
                      properties:
                        productId:
                          type: string
                        quantity:
                          type: number
                        unitPrice:
                          type: number
```

### Data Sketch: Basic List Form

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
      - email
      - phoneNumber
      - address.city
      - address.postalCode

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
      - price
      - inventoryStatus

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
      - customer
      - items[].quantity
      - items[].unitPrice
      - items[].product
    relations:
      customer: customer
      items[].product: product
```

### Data Sketch: Detailed Map Form

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
      name:
        aliases:
          - customer name
      email:
        aliases:
          - email address
      phoneNumber:
        aliases:
          - phone number
        required: false
      address.city:
        aliases:
          - address city
      address.postalCode:
        aliases:
          - postal code

  product:
    name: products
    reason: |-
      Product information is needed so users can browse products and select
      products for orders.
    traces:
      operations:
        - listProducts
    details:
      name:
        aliases:
          - product name
      price:
        aliases:
          - selling price
        type: number
      inventoryStatus:
        aliases:
          - inventory status
      discontinued:
        aliases:
          - discontinued flag
        type: boolean

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
      status:
        aliases:
          - order status
      orderedAt:
        aliases:
          - ordered time
      customer:
        aliases:
          - order customer
      items[].quantity:
        aliases:
          - item quantity
        type: number
      items[].unitPrice:
        aliases:
          - item unit price
        type: number
      items[].product:
        aliases:
          - item product
    relations:
      customer: customer
      items[].product: product
```
