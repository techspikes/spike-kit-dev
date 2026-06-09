import { load, YAMLException } from 'js-yaml'
import * as v from 'valibot'
import utils from './utils.ts'

const dataSketchVersion = '1.0.0-draft.0'

const nonEmptyString = v.pipe(v.string(), v.nonEmpty())
const fieldReferenceList = v.pipe(v.array(nonEmptyString), v.nonEmpty())
const scalarLiteral = v.union([v.string(), v.number(), v.boolean(), v.null_()])

const fieldTypeSchema = v.strictObject({
  name: v.picklist([
    'integer',
    'smallint',
    'boolean',
    'char',
    'varchar',
    'decimal',
    'numeric',
    'date',
    'time',
    'timestamp'
  ]),
  length: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  precision: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  scale: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)))
})

const fieldSchema = v.strictObject({
  name: nonEmptyString,
  type: fieldTypeSchema,
  nullable: v.boolean(),
  default: v.optional(scalarLiteral),
  format: v.optional(nonEmptyString),
  aliases: v.optional(v.pipe(v.array(nonEmptyString), v.nonEmpty())),
  enum: v.optional(v.pipe(v.array(nonEmptyString), v.nonEmpty()))
})

const namedFieldListSchema = v.strictObject({
  name: nonEmptyString,
  fields: fieldReferenceList
})

const foreignKeySchema = v.strictObject({
  name: nonEmptyString,
  fields: fieldReferenceList,
  references: v.strictObject({
    store: nonEmptyString,
    fields: fieldReferenceList
  }),
  onDelete: v.optional(
    v.picklist(['restrict', 'cascade', 'setNull', 'setDefault', 'noAction'])
  ),
  onUpdate: v.optional(
    v.picklist(['restrict', 'cascade', 'setNull', 'setDefault', 'noAction'])
  )
})

const keysSchema = v.strictObject({
  primary: v.optional(namedFieldListSchema),
  unique: v.optional(v.pipe(v.array(namedFieldListSchema), v.nonEmpty())),
  foreign: v.optional(v.pipe(v.array(foreignKeySchema), v.nonEmpty()))
})

const indexFieldSchema = v.union([
  nonEmptyString,
  v.strictObject({
    field: nonEmptyString,
    order: v.picklist(['asc', 'desc'])
  })
])

const indexSchema = v.strictObject({
  name: nonEmptyString,
  fields: v.pipe(v.array(indexFieldSchema), v.nonEmpty()),
  reason: v.optional(nonEmptyString)
})

const storeSchema = v.strictObject({
  name: nonEmptyString,
  tentative: v.optional(v.boolean()),
  reason: nonEmptyString,
  trace: v.strictObject({
    operations: v.pipe(v.array(nonEmptyString), v.nonEmpty())
  }),
  fields: v.record(v.string(), fieldSchema),
  keys: v.optional(keysSchema),
  indexes: v.optional(v.pipe(v.array(indexSchema), v.nonEmpty()))
})

export const specificationSchema = v.strictObject({
  'data-sketch': v.literal(dataSketchVersion),
  info: v.strictObject({
    name: nonEmptyString
  }),
  sources: v.optional(
    v.strictObject({
      openapi: v.optional(nonEmptyString)
    })
  ),
  stores: v.record(v.string(), storeSchema)
})

export type Specification = v.InferOutput<typeof specificationSchema>

export type ValidationResult =
  | { readonly success: true; readonly output: Specification }
  | { readonly success: false; readonly issues: readonly string[] }

export type ParseSpecificationOptions =
  | { readonly trace: true; readonly specPath: string }
  | { readonly trace: false }

export function parseSpecification(
  input: string,
  options?: ParseSpecificationOptions
): Specification {
  try {
    const result = validateSpecification(load(input))

    if (result.success) {
      validateOpenApiTraceIfEnabled(result.output, options)
      return result.output
    } else {
      throw new Error(result.issues.join('\n'))
    }
  } catch (error) {
    if (error instanceof YAMLException) {
      throw new Error(`Failed to parse: ${error.message}`)
    } else {
      throw error
    }
  }
}

function validateOpenApiTraceIfEnabled(
  spec: Specification,
  options?: ParseSpecificationOptions
) {
  if (!options?.trace || !spec.sources?.openapi) {
    return
  }

  const operationIds = loadOpenApiOperationIds(
    options.specPath,
    spec.sources.openapi
  )

  const issues = Object.values(spec.stores).flatMap(store =>
    store.trace.operations.flatMap(operationId =>
      operationIds.has(operationId)
        ? []
        : [
            `trace operation ${operationId} does not exist in OpenAPI operationId`
          ]
    )
  )

  if (issues.length > 0) {
    throw new Error(issues.join('\n'))
  }
}

function loadOpenApiOperationIds(
  basePath: string,
  openApiPath: string
): Set<string> {
  let openApi: unknown

  try {
    openApi = load(
      utils.readBaseRelativePathSync(basePath, openApiPath).toString('utf-8')
    )
  } catch (error) {
    if (error instanceof YAMLException) {
      throw new Error(`Failed to parse OpenAPI: ${error.message}`)
    }

    throw new Error(`Failed to read OpenAPI: ${String(error)}`)
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

  const methods = new Set([
    'get',
    'put',
    'post',
    'delete',
    'options',
    'head',
    'patch',
    'trace'
  ])

  const operationIdValues = Object.values(openApi.paths)
    .filter(isRecord)
    .flatMap(pathItem =>
      Object.entries(pathItem)
        .filter(isOpenApiOperationEntry(methods))
        .map(([, operation]) => operation.operationId)
        .filter(
          (operationId): operationId is string =>
            typeof operationId === 'string'
        )
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

function isOpenApiOperationEntry(methods: Set<string>) {
  return (
    entry: [string, unknown]
  ): entry is [string, Record<string, unknown>] => {
    const [method, operation] = entry
    return methods.has(method) && isRecord(operation)
  }
}

function validateSpecification(spec: unknown): ValidationResult {
  const parsed = v.safeParse(specificationSchema, spec)

  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.issues.map(formatValibotIssue)
    }
  }

  const issues = validateSpecReferences(parsed.output)

  if (issues.length > 0) {
    return { success: false, issues }
  }

  return { success: true, output: parsed.output }
}

function validateSpecReferences(spec: Specification): string[] {
  const storeEntries = Object.entries(spec.stores)
  const issues: string[] = []

  if (storeEntries.length === 0) {
    return ['stores must contain at least one store']
  }

  issues.push(
    ...getDuplicateIssues(
      storeEntries.map(([logicalId, store]) => ({
        owner: logicalId,
        value: store.name
      })),
      'store name'
    )
  )

  for (const [storeId, store] of storeEntries) {
    issues.push(...getStoreIssues(spec, storeId, store))
  }

  return issues
}

function getStoreIssues(
  spec: Specification,
  storeId: string,
  store: Specification['stores'][string]
): string[] {
  const fieldEntries = Object.entries(store.fields)
  const fieldIds = new Set(fieldEntries.map(([fieldId]) => fieldId))
  const issues: string[] = []

  if (fieldEntries.length === 0) {
    return [`stores.${storeId}.fields must contain at least one field`]
  }

  issues.push(
    ...getDuplicateIssues(
      fieldEntries.map(([fieldId, field]) => ({
        owner: `stores.${storeId}.fields.${fieldId}`,
        value: field.name
      })),
      `field name in store ${storeId}`
    )
  )

  for (const [fieldId, field] of fieldEntries) {
    if (
      !field.nullable &&
      Object.hasOwn(field, 'default') &&
      field.default === null
    ) {
      issues.push(
        `stores.${storeId}.fields.${fieldId} default cannot be null when nullable is false`
      )
    }
  }

  if (store.keys?.primary) {
    issues.push(
      ...getMissingFieldIssues(
        storeId,
        fieldIds,
        store.keys.primary.fields,
        `stores.${storeId}.keys.primary.fields`
      )
    )
  }

  for (const [uniqueIndex, uniqueKey] of (store.keys?.unique ?? []).entries()) {
    issues.push(
      ...getMissingFieldIssues(
        storeId,
        fieldIds,
        uniqueKey.fields,
        `stores.${storeId}.keys.unique.${uniqueIndex}.fields`
      )
    )
  }

  for (const [foreignIndex, foreignKey] of (
    store.keys?.foreign ?? []
  ).entries()) {
    const basePath = `stores.${storeId}.keys.foreign.${foreignIndex}`
    const referencedStore = spec.stores[foreignKey.references.store]

    issues.push(
      ...getMissingFieldIssues(
        storeId,
        fieldIds,
        foreignKey.fields,
        `${basePath}.fields`
      )
    )

    if (referencedStore) {
      issues.push(
        ...getMissingFieldIssues(
          foreignKey.references.store,
          new Set(Object.keys(referencedStore.fields)),
          foreignKey.references.fields,
          `${basePath}.references.fields`
        )
      )
    } else {
      issues.push(
        `${basePath}.references.store references missing store ${foreignKey.references.store}`
      )
    }

    if (foreignKey.fields.length !== foreignKey.references.fields.length) {
      issues.push(`${basePath} local and referenced field counts must match`)
    }
  }

  for (const [indexIndex, index] of (store.indexes ?? []).entries()) {
    const referencedFields = index.fields.map(field =>
      typeof field === 'string' ? field : field.field
    )

    issues.push(
      ...getMissingFieldIssues(
        storeId,
        fieldIds,
        referencedFields,
        `stores.${storeId}.indexes.${indexIndex}.fields`
      )
    )
  }

  return issues
}

function getDuplicateIssues(
  values: Array<{ owner: string; value: string }>,
  label: string
): string[] {
  const firstOwnerByValue = new Map<string, string>()
  const issues: string[] = []

  for (const { owner, value } of values) {
    const firstOwner = firstOwnerByValue.get(value)

    if (firstOwner) {
      issues.push(
        `${label} ${value} is duplicated by ${firstOwner} and ${owner}`
      )
    } else {
      firstOwnerByValue.set(value, owner)
    }
  }

  return issues
}

function getMissingFieldIssues(
  storeId: string,
  fieldIds: Set<string>,
  references: readonly string[],
  path: string
): string[] {
  return references.flatMap(fieldId =>
    fieldIds.has(fieldId)
      ? []
      : [`${path} references missing field ${fieldId} in store ${storeId}`]
  )
}

function formatValibotIssue(
  issue: v.InferIssue<typeof specificationSchema>
): string {
  const path = issue.path?.map(item => String(item.key)).join('.')

  if (path) {
    return `${path}: ${issue.message}`
  }

  return issue.message
}
