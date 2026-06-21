# Spike Kit Dev

Specification and tools for agile teams to quickly sketch disposable data
stores for user stories.

Data Sketch Specification v1 is a YAML or JSON format for describing data this
service currently claims may be worth remembering, based on Tale, user story,
and OpenAPI context. A Data Sketch is not a database design document; it keeps
the data claim, reason, traces, details, and logical relations small enough to
revise or discard as the team learns.

## Requirements

- Node.js 22 or later
- npm 10 or later

## Setup

```sh
npm install --save-dev git+https://github.com/techspikes/spike-kit-dev.git
```

The CLI is installed as `shot`, named after the shot used when making espresso.

## Usage

```sh
npx shot --help
npx shot openapi-summary path/to/openapi.yaml
npx shot spec-check path/to/data-sketch.yaml
npx shot tables-doc path/to/data-sketch.yaml --output path/to/tables-doc.md
npx shot kysely-migration path/to/data-sketch.yaml --output path/to/0001_initial.ts
```

## Commands

### Summarize an OpenAPI File

```sh
npx shot openapi-summary path/to/openapi.yaml
```

The command summarizes OpenAPI operations and JSON schema paths into a compact
JSON document for AI-assisted Data Sketch drafting. Local `$ref` values are
dereferenced. Remote `$ref` values are rejected.

### Validate a Data Sketch

```sh
npx shot spec-check path/to/data-sketch.yaml
```

The command parses and validates a Data Sketch. When `sources.openapi` is
present, it also validates `traces.operations` against OpenAPI Operation Object
`operationId` values.

### Write a Table Document

```sh
npx shot tables-doc path/to/data-sketch.yaml --output path/to/tables-doc.md
```

The command validates a Data Sketch, builds the Relational DB Projection, and
writes a Markdown table document for schema review.

### Generate a Kysely Migration

```sh
npx shot kysely-migration path/to/data-sketch.yaml --output path/to/0001_initial.ts
```

The command validates a Data Sketch, builds the Relational DB Projection, and
writes a Kysely-compatible TypeScript migration. By default it embeds the
projection snapshot so a later run can generate a diff migration with
`--previous-migration`.

```sh
npx shot kysely-migration path/to/data-sketch.yaml \
  --previous-migration path/to/0001_initial.ts \
  --output path/to/0002_next.ts
```

Use `--types-output path/to/database.d.ts` to write an application-facing
`Database` interface alongside the migration.

## Data Sketch Example

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

## Projections

Validated Data Sketches can be projected into intermediate models for renderers
and database-facing commands.

- The Relational DB Projection maps claims and details to projected tables,
  columns, primary keys, and foreign keys. It infers SQL:1999-compatible
  column types and nullability from traced OpenAPI fields, then applies
  claim-level `x-relational-db-schema` overrides.
- The built-in `tables-doc` and `kysely-migration` commands render that
  projection as review Markdown or Kysely TypeScript migrations.

## Development

```sh
npm install
npm run lint
npm test
```

## Documentation

- [Data Sketch Specification v1](docs/data-sketch-specification-v1.md)
- [`openapi-summary` command specification](docs/commands/openapi-summary-specification.md)
- [`spec-check` command specification](docs/commands/spec-check-specification.md)
- [`tables-doc` command specification](docs/commands/tables-doc-specification.md)
- [`kysely-migration` command specification](docs/commands/kysely-migration-specification.md)
- [Relational DB Projection Specification](docs/projections/relational-db-projection.md)
