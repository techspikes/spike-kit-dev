# Check Command Specification

## Purpose

`shot spec-check <spec file>` validates a Valuable Data Specification v1 YAML or
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
- When reading or validation fails, the command prints the error message to
  stderr.

The command validates the file as a Specification. It does not validate OpenAPI
traceability.
