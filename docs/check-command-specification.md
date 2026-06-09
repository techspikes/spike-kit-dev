# Check Command Specification

## Purpose

`shot spec-check <spec file>` validates a Data Sketch Specification v1 YAML or
JSON file.

## Usage

```sh
shot spec-check <spec file>
```

## Options

- `-h, --help`: print usage.

## Behavior

- When `-h` or `--help` is provided, the command prints usage to stdout.
- When `<spec file>` is not provided, the command prints usage to stdout.
- When `<spec file>` is valid, the command prints `Specification is valid.` to
  stdout.
- When reading, validation, or OpenAPI trace validation fails, the command prints
  the error message to stderr.

The command validates the file as a Specification. When `sources.openapi` is
present, it also validates store trace operations against OpenAPI Operation
Object `operationId` values.
