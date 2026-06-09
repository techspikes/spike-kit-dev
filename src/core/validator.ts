import { load, YAMLException } from 'js-yaml'
import * as v from 'valibot'

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


export function parseSpecification(input: string): Specification {
  try {
    const result = validateSpecification(load(input))

    if (result.success) {
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
  const issues: string[] = []
  const storeEntries = Object.entries(spec.stores)

  if (storeEntries.length === 0) {
    issues.push('stores must contain at least one store')
    return issues
  }

  addDuplicateIssues(
    issues,
    storeEntries.map(([logicalId, store]) => ({
      owner: logicalId,
      value: store.name
    })),
    'store name'
  )

  for (const [storeId, store] of storeEntries) {
    const fieldEntries = Object.entries(store.fields)
    const fieldIds = new Set(fieldEntries.map(([fieldId]) => fieldId))

    if (fieldEntries.length === 0) {
      issues.push(`stores.${storeId}.fields must contain at least one field`)
      continue
    }

    addDuplicateIssues(
      issues,
      fieldEntries.map(([fieldId, field]) => ({
        owner: `stores.${storeId}.fields.${fieldId}`,
        value: field.name
      })),
      `field name in store ${storeId}`
    )

    if (store.keys?.primary) {
      addMissingFieldIssues(
        issues,
        storeId,
        fieldIds,
        store.keys.primary.fields,
        `stores.${storeId}.keys.primary.fields`
      )
    }

    for (const [uniqueIndex, uniqueKey] of store.keys?.unique?.entries() ??
      []) {
      addMissingFieldIssues(
        issues,
        storeId,
        fieldIds,
        uniqueKey.fields,
        `stores.${storeId}.keys.unique.${uniqueIndex}.fields`
      )
    }

    for (const [foreignIndex, foreignKey] of store.keys?.foreign?.entries() ??
      []) {
      const basePath = `stores.${storeId}.keys.foreign.${foreignIndex}`

      addMissingFieldIssues(
        issues,
        storeId,
        fieldIds,
        foreignKey.fields,
        `${basePath}.fields`
      )

      const referencedStore = spec.stores[foreignKey.references.store]

      if (!referencedStore) {
        issues.push(
          `${basePath}.references.store references missing store ${foreignKey.references.store}`
        )
      } else {
        addMissingFieldIssues(
          issues,
          foreignKey.references.store,
          new Set(Object.keys(referencedStore.fields)),
          foreignKey.references.fields,
          `${basePath}.references.fields`
        )
      }

      if (foreignKey.fields.length !== foreignKey.references.fields.length) {
        issues.push(`${basePath} local and referenced field counts must match`)
      }
    }

    for (const [indexIndex, index] of store.indexes?.entries() ?? []) {
      const referencedFields = index.fields.map(field =>
        typeof field === 'string' ? field : field.field
      )
      addMissingFieldIssues(
        issues,
        storeId,
        fieldIds,
        referencedFields,
        `stores.${storeId}.indexes.${indexIndex}.fields`
      )
    }
  }

  return issues
}

function addDuplicateIssues(
  issues: string[],
  values: Array<{ owner: string; value: string }>,
  label: string
) {
  const firstOwnerByValue = new Map<string, string>()

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
}

function addMissingFieldIssues(
  issues: string[],
  storeId: string,
  fieldIds: Set<string>,
  references: readonly string[],
  path: string
) {
  for (const fieldId of references) {
    if (!fieldIds.has(fieldId)) {
      issues.push(
        `${path} references missing field ${fieldId} in store ${storeId}`
      )
    }
  }
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
