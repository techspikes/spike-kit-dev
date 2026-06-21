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
      readonly sources?: ValidationSources
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

    return validateOperationIds(sketch.sources.openapi, sketch.spec)
  }
}

export function validate(options: ValidateOptions): ValidatedDataSketch {
  const trace = options.trace ?? true
  const sketch = loadValidationSources(readValidationSketch(options), options, trace)

  const issues = getValidators(options.validators).flatMap(validator =>
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

function readValidationSketch(options: ValidateOptions): DataSketch {
  if ('specFilePath' in options) {
    return parse({ specFilePath: options.specFilePath })
  }

  return options.sketch
}

function loadValidationSources(sketch: DataSketch, options: ValidateOptions, trace: boolean): DataSketch {
  if (!trace) {
    return sketch
  }

  if (options.sources?.openapi !== undefined) {
    return {
      ...sketch,
      sources: {
        ...sketch.sources,
        openapi: loadOpenApi(options.sources.openapi)
      }
    }
  }

  if (sketch.sources?.openapi !== undefined) {
    return sketch
  }

  if ('specFilePath' in options && usesOpenApiValidator(options.validators) && sketch.spec.sources?.openapi) {
    return {
      ...sketch,
      sources: {
        ...sketch.sources,
        openapi: loadOpenApiFromFile(sketch.metadata.baseDirectoryPath, sketch.spec.sources.openapi)
      }
    }
  }

  return sketch
}

function usesOpenApiValidator(validators: readonly Validator[] | undefined): boolean {
  return validators?.some(validator => validator.name === openApiValidator.name) === true
}

function getValidators(validators: readonly Validator[] | undefined): readonly Validator[] {
  return [coreValidator, ...(validators ?? []).filter(validator => validator.name !== coreValidator.name)]
}

function loadOpenApi(openApi: unknown): unknown {
  if (typeof openApi === 'string') {
    return loadOpenApiSourceText(openApi)
  }

  return dereferenceRefDeep(openApi, openApi as OASDocument)
}

function loadOpenApiFromFile(baseDirectoryPath: string, openApiFilePath: string): unknown {
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

function loadOpenApiSourceText(openApiSourceText: string): unknown {
  let openApi: unknown

  try {
    openApi = load(openApiSourceText)
  } catch (error) {
    throw new Error(`Failed to parse OpenAPI: ${String(error)}`)
  }

  return dereferenceRefDeep(openApi, openApi as OASDocument)
}

function validateOperationIds(openApi: unknown, spec: Specification): string[] {
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
