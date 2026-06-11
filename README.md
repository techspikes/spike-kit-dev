# Spike Kit

[![Node.js CI](https://github.com/techspikes/spike-kit/actions/workflows/node.js.yml/badge.svg)](https://github.com/techspikes/spike-kit/actions/workflows/node.js.yml)

Specification and tools for agile teams to quickly sketch disposable data
stores for user stories.

Data Sketch Specification v1 is a YAML or JSON format for describing data this service
currently considers valuable enough to keep, based on customer
conversation and feedback. `reason` and `traces` make the document AI First by
giving AI enough context to understand why the data exists. The
`tables-doc` command projects the specification into database-focused
documentation artifacts. See
[docs/data-sketch-specification-v1.md](docs/data-sketch-specification-v1.md) for the full
specification.

A disposable YAML document written in the specification can be called a Data Sketch.
Stores with `tentative: true` are still tentative and need human review.

## Requirements

- Node.js 22 or later
- npm 10 or later

## Setup

```sh
npm install --save-dev git+https://github.com/techspikes/spike-kit.git
```

The CLI is installed as `shot`, named after the shot used when making espresso.

## Usage

```sh
shot spec-check <spec file>
shot tables-doc <file> --output <file>
```

After installation, run the CLI through npm:

```sh
npx shot --help
```

## Commands

### Validate a Data Sketch

```sh
npx shot spec-check path/to/data-sketch.yaml
```

The command validates a Data Sketch. When `sources.openapi` is present, it also
validates store trace operations against OpenAPI Operation Object `operationId`
values.

### Generate Markdown table documentation

```sh
npx shot tables-doc path/to/data-sketch.yaml --output docs/tables.md
```

The command writes Markdown table documentation and appends a SQL-92 compatible
DDL block in a `sql` fence. The command projects the Data Sketch into a db
projection snapshot before rendering Markdown.

## Data Sketch Example

```yaml
data-sketch: 1.0.0-draft.1

info:
  name: online-shop

sources:
  openapi: ./openapi.yaml

stores:
  customer:
    name: customers
    traces:
      operations:
        - createCustomer
        - getCustomer
    reason: Customer profiles need to be looked up when handling orders and support requests.
    fields:
      id:
        name: id
        type:
          name: integer
        nullable: false
      name:
        name: name
        aliases:
          - customer full name
        type:
          name: varchar
          length: 100
        nullable: false
    keys:
      primary:
        name: pk_customers
        fields:
          - id
```

## Development

```sh
npm install
npm run lint
npm test
```

## Documentation

- [Data Sketch Specification v1](docs/data-sketch-specification-v1.md)
- [`check` command specification](docs/check-command-specification.md)
- [Db Projection Specification](docs/db-projection-specification.md)
- [`tables-doc` command specification](docs/tables-doc-command-specification.md)
- [Online shop example Data Sketch](docs/examples/online-shop-example.yaml)
- [Online shop example table specification](docs/examples/online-shop-example.tables-doc.md)
