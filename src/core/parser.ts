import { load, YAMLException } from 'js-yaml'
import * as v from 'valibot'
import type { DataSketch } from './spec.ts'
import { readCwdRelativeTextFile, resolveCwdRelativeDirectoryPath } from './utils.ts'

const nonEmptyString = v.pipe(v.string(), v.nonEmpty())
const nonEmptyStringList = v.pipe(v.array(nonEmptyString), v.nonEmpty())
const implementationName = v.pipe(nonEmptyString, v.regex(/^\S+$/, 'must not contain whitespace'))
const reservedIdentityDetailPaths = new Set(['id', '_id'])
const invalidClaimIdPattern = /[.[\]]/u
const validDetailPathSegmentPattern = /^[^[\]]+(?:\[\])?$/u
const rootFields = new Set(['data-sketch', 'info', 'sources', 'claims'])
const infoFields = new Set(['name'])
const sourcesFields = new Set(['openapi', 'arrazo', 'asyncapi'])
const claimFields = new Set([
  'name',
  'reason',
  'traces',
  'details',
  'aliases',
  'relations',
  'tentative'
])
const tracesFields = new Set(['operations', 'workflows', 'channels'])

const tracesSchema = v.looseObject({
  operations: nonEmptyStringList,
  workflows: v.optional(nonEmptyStringList),
  channels: v.optional(nonEmptyStringList)
})

const aliasesSchema = v.pipe(v.record(v.string(), nonEmptyStringList), v.minEntries(1))

const claimSchema = v.looseObject({
  name: implementationName,
  reason: nonEmptyString,
  traces: tracesSchema,
  details: v.optional(nonEmptyStringList),
  aliases: v.optional(aliasesSchema),
  relations: v.optional(v.record(v.string(), nonEmptyString)),
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

export type Specification = v.InferOutput<typeof specificationSchema>

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
    const issues = [...validateExtensionFields(parsed), ...validateClaimShape(parsed)]

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

function validateExtensionFields(spec: Specification): string[] {
  const issues: string[] = []

  issues.push(...validateExtensibleObjectFields('', spec, rootFields))
  issues.push(...validateExtensibleObjectFields('info', spec.info, infoFields))

  if (spec.sources) {
    issues.push(...validateExtensibleObjectFields('sources', spec.sources, sourcesFields))
  }

  for (const [claimId, claim] of Object.entries(spec.claims)) {
    issues.push(...validateExtensibleObjectFields(`claims.${claimId}`, claim, claimFields))
    issues.push(
      ...validateExtensibleObjectFields(`claims.${claimId}.traces`, claim.traces, tracesFields)
    )
  }

  return issues
}

function validateExtensibleObjectFields(
  path: string,
  object: Record<string, unknown>,
  knownFields: ReadonlySet<string>
) {
  const issues: string[] = []

  for (const field of Object.keys(object)) {
    if (!knownFields.has(field) && !field.startsWith('x-')) {
      const fieldPath = path ? `${path}.${field}` : field

      issues.push(`${fieldPath} is not supported; use x-* for extension fields`)
    }
  }

  return issues
}

function validateClaimShape(spec: Specification): string[] {
  const issues: string[] = []
  const claimNames = new Set<string>()

  for (const [claimId, claim] of Object.entries(spec.claims)) {
    if (invalidClaimIdPattern.test(claimId)) {
      issues.push(`claims.${claimId} must not contain . or []`)
    }

    if (claimNames.has(claim.name)) {
      issues.push(`claims.${claimId}.name ${claim.name} is duplicated`)
    }

    claimNames.add(claim.name)

    if (!claim.details) {
      issues.push(`claims.${claimId} must include details`)
    }

    if (claim.details) {
      issues.push(...validateDetailShape(claimId, claim.details))
    }

    if (claim.details && claim.aliases) {
      issues.push(...validateAliasShape(claimId, claim.details, claim.aliases))
    }
  }

  return issues
}

function validateDetailShape(
  claimId: string,
  details: NonNullable<Specification['claims'][string]['details']>
): string[] {
  const issues: string[] = []
  const detailIds = new Set<string>()

  for (const detailId of details) {
    if (reservedIdentityDetailPaths.has(detailId)) {
      issues.push(`claims.${claimId}.details.${detailId} is a reserved identity detail path`)
    }

    if (detailIds.has(detailId)) {
      issues.push(`claims.${claimId}.details.${detailId} is duplicated`)
    }

    detailIds.add(detailId)
  }

  issues.push(...validateDetailPaths(claimId, [...detailIds]))

  return issues
}

function validateAliasShape(
  claimId: string,
  details: NonNullable<Specification['claims'][string]['details']>,
  aliases: NonNullable<Specification['claims'][string]['aliases']>
): string[] {
  const detailIds = new Set(details)

  return Object.keys(aliases).flatMap(aliasPath =>
    detailIds.has(aliasPath)
      ? []
      : [`claims.${claimId}.aliases.${aliasPath} must also be listed in details`]
  )
}

function validateDetailPaths(claimId: string, detailIds: string[]): string[] {
  const issues: string[] = []
  const detailPaths = detailIds.map(detailId => ({
    detailId,
    segments: detailId.split('.')
  }))

  for (const detailPath of detailPaths) {
    if (detailPath.segments.some(segment => segment === '')) {
      issues.push(
        `claims.${claimId}.details.${detailPath.detailId} must not contain empty path segments`
      )
    }

    const invalidSegment = detailPath.segments.find(
      segment => segment !== '' && !validDetailPathSegmentPattern.test(segment)
    )

    if (invalidSegment) {
      issues.push(
        `claims.${claimId}.details.${detailPath.detailId} segment ${invalidSegment} must be either <name> or <name>[]`
      )
    }
  }

  for (let index = 0; index < detailPaths.length; index += 1) {
    const left = detailPaths[index]

    for (let otherIndex = index + 1; otherIndex < detailPaths.length; otherIndex += 1) {
      const right = detailPaths[otherIndex]
      const prefixPair = getStrictPrefixPair(left, right)

      if (prefixPair) {
        issues.push(
          `claims.${claimId}.details.${prefixPair.prefix.detailId} must not be a strict prefix of ${prefixPair.prefixed.detailId}`
        )
      }

      const conflictSegment = getArrayObjectConflictSegment(left.segments, right.segments)

      if (conflictSegment) {
        issues.push(
          `claims.${claimId}.details.${left.detailId} conflicts with ${right.detailId} because segment ${conflictSegment} uses both object and array form`
        )
      }
    }
  }

  return issues
}

function getStrictPrefixPair(
  left: { readonly detailId: string; readonly segments: readonly string[] },
  right: { readonly detailId: string; readonly segments: readonly string[] }
) {
  if (isStrictDetailPathPrefix(left.segments, right.segments)) {
    return {
      prefix: left,
      prefixed: right
    }
  }

  if (isStrictDetailPathPrefix(right.segments, left.segments)) {
    return {
      prefix: right,
      prefixed: left
    }
  }

  return undefined
}

function isStrictDetailPathPrefix(
  prefixSegments: readonly string[],
  prefixedSegments: readonly string[]
) {
  return (
    prefixSegments.length < prefixedSegments.length &&
    prefixSegments.every((segment, index) => segment === prefixedSegments[index])
  )
}

function getArrayObjectConflictSegment(
  leftSegments: readonly string[],
  rightSegments: readonly string[]
) {
  const segmentCount = Math.min(leftSegments.length, rightSegments.length)

  for (let index = 0; index < segmentCount; index += 1) {
    const leftSegment = leftSegments[index]
    const rightSegment = rightSegments[index]

    if (leftSegment === rightSegment) {
      continue
    }

    const leftName = getDetailPathSegmentName(leftSegment)
    const rightName = getDetailPathSegmentName(rightSegment)

    if (leftName === rightName) {
      return leftName
    }

    return undefined
  }

  return undefined
}

function getDetailPathSegmentName(segment: string) {
  return segment.endsWith('[]') ? segment.slice(0, -2) : segment
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
