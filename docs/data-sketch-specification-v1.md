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
- input for projection tools that render review documents or database-facing
  artifacts

---

## Core Terms

| Term | Meaning |
|---|---|
| Valuable Data | Data described by a Data Sketch. |
| `claim` | A provisional assertion that this service may need to remember a valuable data subject in order to fulfill the Tale. |
| `name` | An implementation-facing name for a claim. |
| `detail` | A concrete item that describes or supports a claim. |
| `relation` | A logical relationship from a source path on a claim to another claim. |
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
| `arazzo` | no | Reserved for an Arazzo Specification file used to trace workflows. |
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
- `sources.arazzo` is reserved for future trace validation with
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
| `details` | yes | Concrete items that describe or support the claim. |
| `optionals` | no | Per-detail nullable overrides, keyed by detail path. |
| `aliases` | no | Business-facing aliases keyed by detail path. |
| `relations` | no | Logical relationships from source paths on this claim to other claims. |
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

Write `details` as a list. List form keeps the Data Sketch focused on the data
this service may need to remember without requiring early implementation
decisions.

`id` and `_id` are reserved identity detail paths. Authors must not list `id`
or `_id` in `details`. Projections and consuming tools may use these reserved
paths for generated identity fields.

Basic form:

```yaml
details:
  - status
  - shippedAt
  - carrier.name
  - items[].quantity
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

- `details` must be a non-empty list of path strings.
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

## Optionals

Built-in relational projection infers whether a detail is nullable from the
OpenAPI request body `required` list of the claim's traced operations. Use
claim-level `optionals` to override that inferred determination for specific
detail paths.

```yaml
details:
  - status
  - internalNote

optionals:
  status: true
  internalNote: false
```

Rules:

- `optionals` is optional.
- `optionals` must be a non-empty map when present.
- Each `optionals` key must be a detail path listed in the same claim's
  `details`.
- Each `optionals` value is a boolean: `true` marks the detail nullable,
  `false` marks it required.
- A detail path not listed in `optionals` keeps the OpenAPI-inferred
  determination.

---

## Aliases

Use claim-level `aliases` when details need business-facing names or other
labels.

```yaml
details:
  - status
  - items[].quantity

aliases:
  status:
    - order status
    - fulfillment status
  items[].quantity:
    - item quantity
```

Rules:

- `aliases` is optional.
- `aliases` must be a non-empty map when present.
- Each `aliases` key must be a detail path listed in the same claim's
  `details`.
- Each `aliases` value must be a non-empty list of non-empty strings.
- Core Data Sketch does not store detail types, storage types, constraints, or
  indexes. `optionals` is the one exception: it stores an explicit
  required/optional override per detail path.

---

## Relations

A relation is a logical relationship from a source path on a claim to another
claim.

Relations use a claim-level `relations` map. Each key is a path in the source
claim. Each value is the target claim logical ID.

```yaml
details:
  - status
  - items[].quantity

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
- Relation paths use the same path syntax as `details`.
- Relation paths are treated as source details and do not need to be listed in
  the same claim's `details`.
- Relation paths participate in detail path conflict checks with `details`.
- Relation paths must not use array-of-scalars details. A relation path ending
  with `[]` is invalid.
- Relational projections may use relation paths as foreign key columns.
- Relational projections may also create structural parent-child foreign keys
  from array-of-objects paths. Those foreign keys do not use `relations`.
- Relational projections may also infer foreign keys when a detail path's final
  segment exactly matches a claim ID. An explicit `relations` entry takes
  precedence over inferred relation behavior for the same detail path.
- When a claim has one or more `relations` entries, relational projections do
  not infer foreign keys by claim ID match anywhere in that claim, even for
  detail paths that have no `relations` entry of their own.
- Relational projections mark inferred foreign keys so renderers can discard
  them when a stricter renderer policy is needed.

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
- A validated `DataSketch` stores the dereferenced OpenAPI object used for trace
  validation at `sources.openapi`.

Rules:

- OpenAPI is a trace validation source, not the canonical Data Sketch shape.
- Tools must not infer from similar names.
- Core parsing and validation must not turn OpenAPI schemas into Data Sketch
  details or aliases.
- Built-in relational projection may use OpenAPI schemas, `type`, `format`,
  string lengths, and required lists as advisory input for projected SQL column
  types and nullability.
- AI tools and renderers may use OpenAPI schemas, enums, formats, and required
  lists as advisory input when proposing storage-specific constraints, but core
  parsing and validation do not turn those hints into Data Sketch details,
  aliases, check constraints, uniqueness constraints, or indexes.

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
- The projector, renderer, or consuming tool decides how to interpret
  documented `x-*` fields it supports.
- The built-in relational projector interprets claim-level
  `x-relational-db-schema` during projection.
- `claims` and `relations` are maps whose keys are logical IDs or paths; they
  are not extension containers.
- `details`, `optionals`, `aliases`, and `relations` are not extension
  containers.

### Built-in Relational Extension

`x-relational-db-schema` is a documented claim-level extension consumed by the
built-in Relational DB Projection. It is not part of the core Data Sketch
vocabulary, so `spec-check` only verifies that it is allowed as an `x-*`
extension field. The relational projector validates its shape when a command
builds the projection.

The extension can override projected table and column names, projected SQL
types, foreign keys, unique constraints, check constraints, and non-unique
indexes. See the
[Relational DB Projection Specification](projections/relational-db-projection.md#x-relational-db-schema-extension)
for the complete shape, validation rules, and application order.

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
      - items[].quantity
      - items[].unitPrice
    relations:
      customer: customer
      items[].product: product
```

### Data Sketch: List Form With Aliases

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
    aliases:
      name:
        - customer name
      email:
        - email address
      phoneNumber:
        - phone number
      address.city:
        - address city
      address.postalCode:
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
      - name
      - price
      - inventoryStatus
      - discontinued
    aliases:
      name:
        - product name
      price:
        - selling price
      inventoryStatus:
        - inventory status
      discontinued:
        - discontinued flag

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
    aliases:
      status:
        - order status
      orderedAt:
        - ordered time
      customer:
        - order customer
      items[].quantity:
        - item quantity
      items[].unitPrice:
        - item unit price
      items[].product:
        - item product
    relations:
      customer: customer
      items[].product: product
```
