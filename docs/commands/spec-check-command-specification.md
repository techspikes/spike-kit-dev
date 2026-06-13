# Spec Check Command Specification

## Purpose

`shot spec-check [OPTION]... SPEC_FILE` validates a Data Sketch Specification v1
YAML or JSON file.

## Usage

```sh
shot spec-check [OPTION]... SPEC_FILE
```

## Options

- `-h, --help`: print usage.

## Behavior

- When `-h` or `--help` is provided, the command prints usage to stdout and
  returns exit code 0.
- When `SPEC_FILE` is not provided, the command prints usage to stdout and
  returns a non-zero exit code.
- When `SPEC_FILE` is valid, the command prints `Specification is valid.` to
  stdout and returns exit code 0.
- When parsing, validation, or OpenAPI trace validation fails, the command
  prints the error message to stderr and returns a non-zero exit code.

The command parses the file as a Data Sketch Specification and validates it with
trace validation enabled. When `sources.openapi` is present, trace validation
checks trace operations against OpenAPI Operation Object `operationId` values.
