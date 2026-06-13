import { load, YAMLException } from 'js-yaml'
import { readSpecification } from './parser.ts'
import {
  buildRelationalDbProjection,
  type RelationalDbProjection,
  useProjectors
} from './projector.ts'
import type { DataSketch } from './spec.ts'
import { readBaseRelativeTextFile } from './utils.ts'

export function validate<P extends Record<string, (() => unknown) | undefined>>(
  options:
    | { readonly sketch: DataSketch<P>; readonly trace?: boolean }
    | {
        readonly sketch: DataSketch<P>
        readonly sources: { readonly openapi: string }
        readonly trace?: boolean
      }
): DataSketch<P & { readonly relationalDb: () => RelationalDbProjection }> {
  const spec = readSpecification(options.sketch)

  const operationIds =
    options.trace !== false && 'sources' in options
      ? loadOpenApiOperationIdsFromSource(options.sources.openapi)
      : options.trace !== false && spec.sources?.openapi
        ? loadOpenApiOperationIdsFromPath(options.sketch.metadata.basePath, spec.sources.openapi)
        : undefined

  if (operationIds) {
    validateOperationIds(operationIds, spec)
  }

  const validatedSketch = {
    ...options.sketch,
    metadata: {
      ...options.sketch.metadata,
      validated: true
    }
  }

  return useProjectors(validatedSketch, {
    relationalDb: () => buildRelationalDbProjection(validatedSketch)
  })
}

function validateOperationIds(
  operationIds: Set<string>,
  spec: ReturnType<typeof readSpecification>
) {
  const issues = Object.values(spec.claims).flatMap(claim =>
    claim.traces.operations.flatMap(operationName =>
      operationIds.has(operationName)
        ? []
        : [`trace operation ${operationName} does not exist in OpenAPI operationId`]
    )
  )

  if (issues.length > 0) {
    throw new Error(issues.join('\n'))
  }
}

function loadOpenApiOperationIdsFromPath(basePath: string, openApiPath: string): Set<string> {
  let openApi: unknown

  try {
    openApi = load(readBaseRelativeTextFile(basePath, openApiPath))
  } catch (error) {
    if (error instanceof YAMLException) {
      throw new Error(`Failed to parse OpenAPI: ${error.message}`)
    }

    throw new Error(`Failed to read OpenAPI: ${String(error)}`)
  }

  return extractOpenApiOperationIds(openApi)
}

function loadOpenApiOperationIdsFromSource(openApiSource: string): Set<string> {
  let openApi: unknown

  try {
    openApi = load(openApiSource)
  } catch (error) {
    throw new Error(`Failed to parse OpenAPI: ${String(error)}`)
  }

  return extractOpenApiOperationIds(openApi)
}

function extractOpenApiOperationIds(openApi: unknown): Set<string> {
  if (!isRecord(openApi)) {
    throw new Error('OpenAPI root must be an object')
  }

  if (!isRecord(openApi.paths)) {
    throw new Error('OpenAPI paths must be an object')
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

  for (const operationId of operationIdValues) {
    if (operationIds.has(operationId)) {
      throw new Error(`OpenAPI operationId ${operationId} is duplicated`)
    }

    operationIds.add(operationId)
  }

  return operationIds
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}
