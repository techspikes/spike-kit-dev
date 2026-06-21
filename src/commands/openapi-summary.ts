import { parseArgs } from 'node:util'
import { load, YAMLException } from 'js-yaml'
import Oas from 'oas'
import {
  readTextFile,
  resolveBaseRelativeFilePath,
  resolveCwdRelativeFilePath,
  resolveDirectoryPath
} from '../core/utils.ts'

type OpenApiSummary = {
  readonly 'openapi-summary': '1.0.0-draft.1'
  readonly info: {
    readonly title?: string
    readonly version?: string
  }
  readonly operations: readonly OpenApiSummaryOperation[]
}

type OpenApiSummaryOperation = {
  readonly operationId: string
  readonly method: string
  readonly path: string
  readonly summary?: string
  readonly tags: readonly string[]
  readonly requestBody?: OpenApiSummaryRequestBody
  readonly responses: readonly OpenApiSummaryResponse[]
}

type OpenApiSummaryRequestBody = {
  readonly required: boolean
  readonly contentType: string
  readonly fields: readonly OpenApiSummaryField[]
}

type OpenApiSummaryResponse = {
  readonly status: string
  readonly contentType: string
  readonly fields: readonly OpenApiSummaryField[]
}

type OpenApiSummaryField = {
  readonly path: string
  readonly type: 'string' | 'number' | 'boolean' | 'unknown'
  readonly required: boolean
}

const httpMethods = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'])

const usage = () =>
  [
    'Usage: shot openapi-summary [OPTION]... OPENAPI_FILE',
    '',
    'Summarize an OpenAPI YAML or JSON file for AI-assisted Data Sketch drafting.',
    '',
    'Options:',
    '  -h, --help  Show this help'
  ].join('\n')

export function executeOpenApiSummary(args: readonly string[]) {
  try {
    const options = parseArgs({
      allowPositionals: true,
      strict: true,
      args: [...args],
      options: {
        help: { type: 'boolean', short: 'h' }
      }
    })

    const openApiFilePath = options.positionals[0]

    if (options.values.help) {
      console.log(usage())

      return 0
    }

    if (!openApiFilePath) {
      console.log(usage())

      return 1
    }

    const summary = buildOpenApiSummaryFromFile(openApiFilePath)

    console.log(JSON.stringify(summary, null, 2))

    return 0
  } catch (error) {
    console.error((error as Error).message)

    return 1
  }
}

function buildOpenApiSummaryFromFile(openApiFilePath: string): OpenApiSummary {
  const resolvedOpenApiFilePath = resolveCwdRelativeFilePath(openApiFilePath)
  const documents = new Map<string, unknown>()

  const openApi = resolveReferences(
    loadYamlOrJsonFile(resolvedOpenApiFilePath, documents),
    resolvedOpenApiFilePath,
    documents
  )

  const openApiRecord = assertRecord(openApi, 'OpenAPI root must be an object')
  const paths = assertRecord(openApiRecord.paths, 'OpenAPI paths must be an object')
  const oas = Oas.init(openApiRecord)
  const operationsByPath = oas.getPaths()

  return {
    'openapi-summary': '1.0.0-draft.1',
    info: getInfo(openApiRecord.info),
    operations: Object.entries(operationsByPath).flatMap(([operationPath, operations]) =>
      Object.entries(operations)
        .filter(([method]) => httpMethods.has(method))
        .map(([method, operation]) =>
          getOperationSummary(operationPath, method, operation.schema, paths[operationPath])
        )
    )
  }
}

function loadYamlOrJsonFile(filePath: string, documents: Map<string, unknown>) {
  const resolvedFilePath = resolveCwdRelativeFilePath(filePath)

  if (documents.has(resolvedFilePath)) {
    return documents.get(resolvedFilePath)
  }

  let document: unknown

  try {
    document = load(readTextFile(resolvedFilePath))
  } catch (error) {
    if (error instanceof YAMLException) {
      throw new Error(`Failed to parse OpenAPI: ${error.message}`)
    }

    throw new Error(`Failed to read OpenAPI: ${String(error)}`)
  }

  documents.set(resolvedFilePath, document)

  return document
}

function resolveReferences(openApi: unknown, currentFilePath: string, documents: Map<string, unknown>) {
  return resolveReferencesWithStack(openApi, currentFilePath, documents, new Set<string>())
}

function resolveReferencesWithStack(
  openApi: unknown,
  currentFilePath: string,
  documents: Map<string, unknown>,
  stack: Set<string>
): unknown {
  if (Array.isArray(openApi)) {
    return openApi.map(item => resolveReferencesWithStack(item, currentFilePath, documents, stack))
  }

  if (!isRecord(openApi)) {
    return openApi
  }

  const ref = typeof openApi.$ref === 'string' ? openApi.$ref : undefined

  if (ref) {
    const resolved = resolveReference(ref, currentFilePath, documents, stack)
    const siblingEntries = Object.entries(openApi).filter(([field]) => field !== '$ref')

    if (siblingEntries.length === 0) {
      return resolved
    }

    return {
      ...assertRecord(resolved, `OpenAPI $ref ${ref} did not resolve to an object`),
      ...Object.fromEntries(
        siblingEntries.map(([field, value]) => [
          field,
          resolveReferencesWithStack(value, currentFilePath, documents, stack)
        ])
      )
    }
  }

  return Object.fromEntries(
    Object.entries(openApi).map(([field, value]) => [
      field,
      resolveReferencesWithStack(value, currentFilePath, documents, stack)
    ])
  )
}

function resolveReference(ref: string, currentFilePath: string, documents: Map<string, unknown>, stack: Set<string>) {
  const [refFilePath, pointerPart = ''] = ref.split('#')
  const targetFilePath = getReferenceTargetFilePath(refFilePath, currentFilePath)
  const stackKey = `${targetFilePath}#${pointerPart}`

  if (stack.has(stackKey)) {
    throw new Error(`Circular OpenAPI $ref is not supported: ${ref}`)
  }

  stack.add(stackKey)

  const targetDocument = loadYamlOrJsonFile(targetFilePath, documents)
  const target = getJsonPointerTarget(targetDocument, pointerPart, ref)
  const resolved = resolveReferencesWithStack(target, targetFilePath, documents, stack)

  stack.delete(stackKey)

  return resolved
}

function getReferenceTargetFilePath(refFilePath: string, currentFilePath: string) {
  if (refFilePath === '') {
    return currentFilePath
  }

  if (refFilePath.startsWith('//')) {
    throw new Error(`Remote OpenAPI $ref is not supported: ${refFilePath}`)
  }

  const schemeMatch = /^[A-Za-z][A-Za-z0-9+.-]*:/u.exec(refFilePath)

  if (schemeMatch) {
    throw new Error(`Remote OpenAPI $ref is not supported: ${refFilePath}`)
  }

  return resolveBaseRelativeFilePath(resolveDirectoryPath(currentFilePath), refFilePath)
}

function getJsonPointerTarget(document: unknown, pointer: string, ref: string) {
  if (pointer === '') {
    return document
  }

  if (!pointer.startsWith('/')) {
    throw new Error(`OpenAPI $ref must use a JSON pointer fragment: ${ref}`)
  }

  let current = document

  for (const segment of pointer.slice(1).split('/').map(decodeJsonPointerSegment)) {
    const record = assertRecord(current, `OpenAPI $ref target does not exist: ${ref}`)

    if (!(segment in record)) {
      throw new Error(`OpenAPI $ref target does not exist: ${ref}`)
    }

    current = record[segment]
  }

  return current
}

function decodeJsonPointerSegment(segment: string) {
  return decodeURIComponent(segment).replace(/~1/gu, '/').replace(/~0/gu, '~')
}

function getInfo(input: unknown) {
  const info = isRecord(input) ? input : {}

  return {
    ...(typeof info.title === 'string' ? { title: info.title } : {}),
    ...(typeof info.version === 'string' ? { version: info.version } : {})
  }
}

function getOperationSummary(
  operationPath: string,
  method: string,
  operation: Record<string, unknown>,
  pathItem: unknown
): OpenApiSummaryOperation {
  // OAS operations are discovered from path items, but keep the fallback for defensive shapes.
  /* c8 ignore next */
  const commonPathItem = isRecord(pathItem) ? pathItem : {}
  const operationId =
    typeof operation.operationId === 'string' && operation.operationId
      ? operation.operationId
      : `${method} ${operationPath}`
  const summary = getStringValue(operation.summary) ?? getStringValue(commonPathItem.summary)
  const requestBody = getRequestBodySummary(operation.requestBody)

  return {
    operationId,
    method,
    path: operationPath,
    ...(summary ? { summary } : {}),
    tags: Array.isArray(operation.tags) ? operation.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    ...(requestBody ? { requestBody } : {}),
    responses: getResponseSummaries(operation.responses)
  }
}

function getRequestBodySummary(input: unknown): OpenApiSummaryRequestBody | undefined {
  const requestBody = isRecord(input) ? input : undefined

  if (!requestBody) {
    return undefined
  }

  const jsonContent = getJsonContent(requestBody.content)

  if (!jsonContent) {
    return undefined
  }

  return {
    required: requestBody.required === true,
    contentType: jsonContent.contentType,
    fields: getSchemaFields(jsonContent.schema, '', requestBody.required === true)
  }
}

function getResponseSummaries(input: unknown): OpenApiSummaryResponse[] {
  const responses = isRecord(input) ? input : {}

  return Object.entries(responses).flatMap(([status, response]) => {
    const responseRecord = isRecord(response) ? response : undefined
    const jsonContent = responseRecord ? getJsonContent(responseRecord.content) : undefined

    if (!jsonContent) {
      return []
    }

    return [
      {
        status,
        contentType: jsonContent.contentType,
        fields: getSchemaFields(jsonContent.schema, '', true)
      }
    ]
  })
}

function getJsonContent(input: unknown) {
  const content = isRecord(input) ? input : undefined

  if (!content) {
    return undefined
  }

  const jsonContentEntry = Object.entries(content).find(([contentType]) => isJsonContentType(contentType))

  if (!jsonContentEntry) {
    return undefined
  }

  const [contentType, mediaType] = jsonContentEntry
  const mediaTypeRecord = isRecord(mediaType) ? mediaType : {}

  return {
    contentType,
    schema: mediaTypeRecord.schema
  }
}

function isJsonContentType(contentType: string) {
  return contentType === 'application/json' || contentType.endsWith('+json')
}

function getSchemaFields(input: unknown, pathPrefix: string, ancestorsRequired: boolean): OpenApiSummaryField[] {
  const schema = isRecord(input) ? input : {}
  const schemaType = getSchemaType(schema)

  if (schemaType === 'array') {
    return getArraySchemaFields(schema, pathPrefix, ancestorsRequired)
  }

  if (schemaType === 'object' || isRecord(schema.properties)) {
    return getObjectSchemaFields(schema, pathPrefix, ancestorsRequired)
  }

  if (pathPrefix) {
    return [
      {
        path: pathPrefix,
        type: getSummaryType(schemaType),
        required: ancestorsRequired
      }
    ]
  }

  return []
}

function getObjectSchemaFields(schema: Record<string, unknown>, pathPrefix: string, ancestorsRequired: boolean) {
  const properties = isRecord(schema.properties) ? schema.properties : {}
  const requiredProperties = Array.isArray(schema.required)
    ? new Set(schema.required.filter((field): field is string => typeof field === 'string'))
    : new Set<string>()

  return Object.entries(properties).flatMap(([propertyName, propertySchema]) => {
    const propertyPath = pathPrefix ? `${pathPrefix}.${propertyName}` : propertyName
    const propertyRequired = ancestorsRequired && requiredProperties.has(propertyName)

    return getSchemaFields(propertySchema, propertyPath, propertyRequired)
  })
}

function getArraySchemaFields(schema: Record<string, unknown>, pathPrefix: string, ancestorsRequired: boolean) {
  const arrayPath = `${pathPrefix}[]`
  const items = isRecord(schema.items) ? schema.items : {}
  const itemType = getSchemaType(items)

  if (itemType === 'object' || isRecord(items.properties)) {
    return getSchemaFields(items, arrayPath, ancestorsRequired)
  }

  return [
    {
      path: arrayPath,
      type: getSummaryType(itemType),
      required: ancestorsRequired
    }
  ]
}

function getSchemaType(schema: Record<string, unknown>) {
  if (Array.isArray(schema.type)) {
    return schema.type.find((type): type is string => typeof type === 'string') ?? 'unknown'
  }

  return typeof schema.type === 'string' ? schema.type : 'unknown'
}

function getSummaryType(schemaType: string): OpenApiSummaryField['type'] {
  if (schemaType === 'integer' || schemaType === 'number') {
    return 'number'
  }

  if (schemaType === 'string' || schemaType === 'boolean') {
    return schemaType
  }

  return 'unknown'
}

function getStringValue(input: unknown) {
  return typeof input === 'string' && input ? input : undefined
}

function assertRecord(input: unknown, message: string): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new Error(message)
  }

  return input
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}
