# OpenAPI Summary Command Specification

## Purpose

`shot openapi-summary [OPTION]... OPENAPI_FILE` summarizes an OpenAPI YAML or
JSON file into a deterministic JSON document for AI-assisted Data Sketch
drafting.

The command does not call a generative AI API. It prepares compact operation and
schema-path context that can be passed to a separate AI workflow.

## Usage

```sh
shot openapi-summary [OPTION]... OPENAPI_FILE
```

## Options

- `-h, --help`: print usage.

## Behavior

- When `-h` or `--help` is provided, the command prints usage to stdout and
  returns exit code 0.
- When `OPENAPI_FILE` is not provided, the command prints usage to stdout and
  returns a non-zero exit code.
- When `OPENAPI_FILE` is valid, the command prints an OpenAPI Summary JSON
  document to stdout and returns exit code 0.
- When parsing, local reference dereferencing, or summary generation fails, the
  command prints the error message to stderr and returns a non-zero exit code.
- Local `$ref` values are dereferenced.
- Remote `$ref` values such as `https://example.com/schema.yaml` are rejected.

## Output Shape

```json
{
  "openapi-summary": "1.0.0-draft.1",
  "info": {
    "title": "Online Shop API",
    "version": "1.0.0"
  },
  "operations": []
}
```

Rules:

- `operations` is ordered by the OpenAPI `paths` object order and method order.
- Each operation includes `operationId`, `method`, `path`, `tags`, request body
  summary when present, and JSON response summaries.
- JSON request and response schemas are summarized as flattened field paths.
- Object properties use dot paths.
- Array item paths use `[]`.
- OpenAPI `string` becomes summary type `string`.
- OpenAPI `number` and `integer` become summary type `number`.
- OpenAPI `boolean` becomes summary type `boolean`.
- Other schema types become summary type `unknown`.
