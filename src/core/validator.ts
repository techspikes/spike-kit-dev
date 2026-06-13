import { load, YAMLException } from 'js-yaml'
import type { OASDocument } from 'oas/types'
import { dereferenceRefDeep } from 'oas/utils'
import type { Specification } from './parser.ts'
import {
  buildExtensionProjection,
  buildRelationalDbProjection,
  type ExtensionProjection,
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
): DataSketch<
  P & {
    readonly extensions: () => ExtensionProjection
    readonly relationalDb: () => RelationalDbProjection
  }
> {
  const openApi =
    options.trace !== false && 'sources' in options
      ? loadOpenApiFromSource(options.sources.openapi)
      : options.trace !== false && options.sketch.spec.sources?.openapi
        ? loadOpenApiFromPath(options.sketch.metadata.basePath, options.sketch.spec.sources.openapi)
        : undefined

  if (openApi !== undefined) {
    validateOperationIds(extractOpenApiOperationIds(openApi), options.sketch.spec)
  }

  validateRelations(options.sketch.spec)

  const validatedSketch = {
    ...options.sketch,
    ...(openApi !== undefined
      ? {
          sources: {
            ...options.sketch.sources,
            openapi: openApi
          }
        }
      : {}),
    metadata: {
      ...options.sketch.metadata,
      validated: true
    }
  }

  return useProjectors(validatedSketch, {
    extensions: () => buildExtensionProjection(validatedSketch),
    relationalDb: () => buildRelationalDbProjection(validatedSketch)
  })
}

function validateOperationIds(operationIds: Set<string>, spec: Specification) {
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

function validateRelations(spec: Specification) {
  const issues: string[] = []

  for (const [claimId, claim] of Object.entries(spec.claims)) {
    if (!claim.relations) {
      continue
    }

    for (const [relationPath, relationTarget] of Object.entries(claim.relations)) {
      if (relationPath.endsWith('[]')) {
        issues.push(
          `claims.${claimId}.relations.${relationPath} must not use an array-of-scalars detail as a relation source`
        )
      }

      if (relationTarget.endsWith('.id')) {
        issues.push(
          `claims.${claimId}.relations.${relationPath} target ${relationTarget} must be a claim ID; do not write .id`
        )

        continue
      }

      const targetClaim = spec.claims[relationTarget]

      if (!targetClaim) {
        issues.push(
          `claims.${claimId}.relations.${relationPath} target claim ${relationTarget} does not exist`
        )
      }
    }
  }

  if (issues.length > 0) {
    throw new Error(issues.join('\n'))
  }
}

function loadOpenApiFromPath(basePath: string, openApiPath: string): unknown {
  let openApi: unknown

  try {
    openApi = load(readBaseRelativeTextFile(basePath, openApiPath))
  } catch (error) {
    if (error instanceof YAMLException) {
      throw new Error(`Failed to parse OpenAPI: ${error.message}`)
    }

    throw new Error(`Failed to read OpenAPI: ${String(error)}`)
  }

  return dereferenceOpenApi(openApi)
}

function loadOpenApiFromSource(openApiSource: string): unknown {
  let openApi: unknown

  try {
    openApi = load(openApiSource)
  } catch (error) {
    throw new Error(`Failed to parse OpenAPI: ${String(error)}`)
  }

  return dereferenceOpenApi(openApi)
}

function dereferenceOpenApi(openApi: unknown): unknown {
  return dereferenceRefDeep(openApi, openApi as OASDocument)
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
