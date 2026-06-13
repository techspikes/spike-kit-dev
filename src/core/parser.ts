import { load, YAMLException } from 'js-yaml'
import * as v from 'valibot'
import type { DataSketch } from './spec.ts'
import { readCwdRelativeTextFile, resolveCwdRelativeDirectoryPath } from './utils.ts'

const nonEmptyString = v.pipe(v.string(), v.nonEmpty())
const nonEmptyStringList = v.pipe(v.array(nonEmptyString), v.nonEmpty())

const tracesSchema = v.looseObject({
  operations: nonEmptyStringList,
  workflows: v.optional(nonEmptyStringList),
  channels: v.optional(nonEmptyStringList)
})

const detailMetadataSchema = v.looseObject({
  name: nonEmptyString,
  aliases: v.optional(nonEmptyStringList),
  type: v.optional(v.picklist(['string', 'number'])),
  required: v.optional(v.boolean())
})

const detailsSchema = v.union([
  nonEmptyStringList,
  v.pipe(v.record(v.string(), detailMetadataSchema), v.minEntries(1))
])

const relationSchema = v.union([
  nonEmptyString,
  v.looseObject({
    to: nonEmptyString,
    reason: v.optional(nonEmptyString)
  })
])

const claimSchema = v.looseObject({
  name: nonEmptyString,
  reason: nonEmptyString,
  traces: tracesSchema,
  details: v.optional(detailsSchema),
  relations: v.optional(v.record(v.string(), relationSchema)),
  tentative: v.optional(v.boolean())
})

const specificationSchema = v.looseObject({
  'data-sketch': v.literal('1.0.0-draft.2'),
  info: v.looseObject({
    name: nonEmptyString
  }),
  sources: v.optional(
    v.looseObject({
      openapi: v.optional(nonEmptyString),
      arrazo: v.optional(nonEmptyString),
      asyncapi: v.optional(nonEmptyString)
    })
  ),
  claims: v.pipe(v.record(v.string(), claimSchema), v.minEntries(1))
})

type Specification = v.InferOutput<typeof specificationSchema>

export function parse(options: { readonly path: string } | { readonly input: string }): DataSketch {
  let source: string
  let basePath: string

  if ('path' in options) {
    source = readCwdRelativeTextFile(options.path)
    basePath = resolveCwdRelativeDirectoryPath(options.path)
  } else {
    source = options.input
    basePath = process.cwd()
  }

  try {
    const result = v.safeParse(specificationSchema, load(source))

    if (!result.success) {
      throw new Error(formatValibotIssues(result.issues).join('\n'))
    }

    const parsed = result.output
    const issues = validateClaimShape(parsed)

    if (issues.length > 0) {
      throw new Error(issues.join('\n'))
    }

    return {
      spec: parsed,
      metadata: {
        version: parsed['data-sketch'],
        basePath
      },
      projections: {}
    }
  } catch (error) {
    if (error instanceof YAMLException) {
      throw new Error(`Failed to parse: ${error.message}`)
    }

    throw error
  }
}

export function readSpecification(sketch: DataSketch): Specification {
  const result = v.safeParse(specificationSchema, sketch.spec)

  if (!result.success) {
    throw new Error(formatValibotIssues(result.issues).join('\n'))
  }

  return result.output
}

function validateClaimShape(spec: Specification): string[] {
  return Object.entries(spec.claims).flatMap(([claimId, claim]) => {
    if (claim.details || claim.relations) {
      return []
    }

    return [`claims.${claimId} must include details or relations`]
  })
}

function formatValibotIssues(issues: readonly v.InferIssue<typeof specificationSchema>[]) {
  return issues.map(issue => {
    const path = issue.path?.map(item => String(item.key)).join('.')

    if (path) {
      return `${path}: ${issue.message}`
    }

    return issue.message
  })
}
