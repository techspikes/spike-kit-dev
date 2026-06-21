import { load, YAMLException } from 'js-yaml'
import type { OASDocument } from 'oas/types'
import { dereferenceRefDeep } from 'oas/utils'
import { type DataSketch, parse, type Specification, type ValidatedDataSketch } from './parser.ts'
import { readBaseRelativeTextFile } from './utils.ts'

export type ValidatorContext = {
  readonly sketch: DataSketch
  readonly trace: boolean
}

export type Validator = {
  readonly name: string
  readonly validate: (context: ValidatorContext) => readonly string[]
}

export type ValidationSources = {
  readonly openapi?: unknown
}

export type ValidateOptions =
  | {
      readonly specFilePath: string
      readonly trace?: boolean
      readonly validators?: readonly Validator[]
    }
  | {
      readonly sketch: DataSketch
      readonly sources?: ValidationSources
      readonly trace?: boolean
      readonly validators?: readonly Validator[]
    }

export const coreValidator: Validator = {
  name: 'core',
  validate: ({ sketch }) => validateRelationReferences(sketch.spec)
}

export const openApiValidator: Validator = {
  name: 'openapi',
  validate: ({ sketch, trace }) => {
    if (!trace || sketch.sources?.openapi === undefined) {
      return []
    }

    return validateOpenApiTraceOperations(sketch.sources.openapi, sketch.spec)
  }
}

export function validate(options: ValidateOptions): ValidatedDataSketch {
  const trace = options.trace ?? true

  const sketch =
    'specFilePath' in options
      ? readValidationSketchFromFile(options.specFilePath, trace)
      : attachInMemoryValidationSources(options.sketch, options.sources, trace)

  const issues = resolveValidators(options.validators).flatMap(validator =>
    validator.validate({
      sketch,
      trace
    })
  )

  if (issues.length > 0) {
    throw new Error(issues.join('\n'))
  }

  return {
    ...sketch,
    metadata: {
      ...sketch.metadata,
      validated: true
    }
  }
}

function readValidationSketchFromFile(specFilePath: string, trace: boolean): DataSketch {
  const sketch = parse({ specFilePath })

  if (!trace || !sketch.spec.sources?.openapi) {
    return sketch
  }

  const loadOpenApiFile = (baseDirectoryPath: string, openApiFilePath: string): unknown => {
    let openApi: unknown

    try {
      openApi = load(readBaseRelativeTextFile(baseDirectoryPath, openApiFilePath))
    } catch (error) {
      if (error instanceof YAMLException) {
        throw new Error(`Failed to parse OpenAPI: ${error.message}`)
      }

      throw new Error(`Failed to read OpenAPI: ${String(error)}`)
    }

    return dereferenceRefDeep(openApi, openApi as OASDocument)
  }

  return {
    ...sketch,
    sources: {
      ...sketch.sources,
      openapi: loadOpenApiFile(sketch.metadata.baseDirectoryPath, sketch.spec.sources.openapi)
    }
  }
}

function attachInMemoryValidationSources(
  sketch: DataSketch,
  sources: ValidationSources | undefined,
  trace: boolean
): DataSketch {
  if (!trace || sources?.openapi === undefined) {
    return sketch
  }

  let openApi: unknown = sources.openapi

  if (typeof openApi === 'string') {
    try {
      openApi = load(openApi)
    } catch (error) {
      throw new Error(`Failed to parse OpenAPI: ${String(error)}`)
    }
  }

  return {
    ...sketch,
    sources: {
      ...sketch.sources,
      openapi: openApi
    }
  }
}

function resolveValidators(validators: readonly Validator[] | undefined): readonly Validator[] {
  return [coreValidator, ...(validators ?? []).filter(validator => validator.name !== coreValidator.name)]
}

function validateOpenApiTraceOperations(openApi: unknown, spec: Specification): string[] {
  function isRecord(input: unknown): input is Record<string, unknown> {
    return typeof input === 'object' && input !== null && !Array.isArray(input)
  }

  if (!isRecord(openApi)) {
    return ['OpenAPI root must be an object']
  }

  if (!isRecord(openApi.paths)) {
    return ['OpenAPI paths must be an object']
  }

  const methods = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'])

  const operationIdValues = Object.values(openApi.paths)
    .filter(isRecord)
    .flatMap(pathItem =>
      Object.entries(pathItem)
        .filter((entry): entry is [string, Record<string, unknown>] => {
          const [method, operation] = entry

          return methods.has(method) && isRecord(operation)
        })
        .map(([, operation]) => operation.operationId)
        .filter((operationId): operationId is string => typeof operationId === 'string')
    )

  const operationIds = new Set<string>()
  const issues: string[] = []

  for (const operationId of operationIdValues) {
    if (operationIds.has(operationId)) {
      issues.push(`OpenAPI operationId ${operationId} is duplicated`)
    }

    operationIds.add(operationId)
  }

  issues.push(
    ...Object.values(spec.claims).flatMap(claim =>
      claim.traces.operations.flatMap(operationName =>
        operationIds.has(operationName)
          ? []
          : [`trace operation ${operationName} does not exist in OpenAPI operationId`]
      )
    )
  )

  return issues
}

function validateRelationReferences(spec: Specification): string[] {
  const issues: string[] = []

  for (const [claimId, claim] of Object.entries(spec.claims)) {
    if (!claim.relations) {
      continue
    }

    for (const [relationPath, relationTarget] of Object.entries(claim.relations)) {
      if (spec.claims[relationTarget] === undefined) {
        issues.push(`claims.${claimId}.relations.${relationPath} target claim ${relationTarget} does not exist`)
      }
    }
  }

  return issues
}
