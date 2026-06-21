import { load, YAMLException } from 'js-yaml'
import * as v from 'valibot'
import { readCwdRelativeTextFile, resolveCwdRelativeDirectoryPath } from './utils.ts'

// ! Parser validation stays local to document shape.
// ! Cross-claim references and external sources are checked by validator.ts.

const nonEmptyString = v.pipe(v.string(), v.nonEmpty())
const nonEmptyStringList = v.pipe(v.array(nonEmptyString), v.nonEmpty())

const specificationSchema = v.looseObject({
  'data-sketch': v.literal('1.0.0-draft.2'),
  info: v.looseObject({
    name: nonEmptyString
  }),
  sources: v.optional(
    v.looseObject({
      openapi: v.optional(nonEmptyString),
      arazzo: v.optional(nonEmptyString),
      asyncapi: v.optional(nonEmptyString)
    })
  ),
  claims: v.pipe(
    v.record(
      v.string(),
      v.looseObject({
        name: v.pipe(nonEmptyString, v.regex(/^\S+$/, 'must not contain whitespace')),
        reason: nonEmptyString,
        traces: v.looseObject({
          operations: nonEmptyStringList,
          workflows: v.optional(nonEmptyStringList),
          channels: v.optional(nonEmptyStringList)
        }),
        details: v.optional(nonEmptyStringList),
        optionals: v.optional(v.pipe(v.record(v.string(), v.boolean()), v.minEntries(1))),
        aliases: v.optional(v.pipe(v.record(v.string(), nonEmptyStringList), v.minEntries(1))),
        relations: v.optional(v.record(v.string(), nonEmptyString)),
        tentative: v.optional(v.boolean())
      })
    ),
    v.minEntries(1)
  )
})

export type Specification = v.InferOutput<typeof specificationSchema>

export type DataSketch<
  P extends Record<string, (() => unknown) | undefined> = Record<
    string,
    (() => unknown) | undefined
  >
> = {
  readonly spec: Specification
  readonly sources?: {
    readonly openapi?: unknown
  }
  readonly metadata: {
    readonly version: string
    readonly basePath: string
    readonly validated?: boolean
  }
  readonly projections: P
}

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
    const issues = [...validateExtensionFields(parsed), ...validateClaims(parsed)]

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

function validateClaims(spec: Specification): string[] {
  const issues: string[] = []
  const claimNames = new Set<string>()

  for (const [claimId, claim] of Object.entries(spec.claims)) {
    if (/[.[\]]/u.test(claimId)) {
      issues.push(`claims.${claimId} must not contain . or []`)
    }

    if (claimNames.has(claim.name)) {
      issues.push(`claims.${claimId}.name ${claim.name} is duplicated`)
    }

    claimNames.add(claim.name)

    if (!claim.details) {
      issues.push(`claims.${claimId} must include details`)
    }

    const detailIds = claim.details ?? []
    const relationIds = Object.keys(claim.relations ?? {})

    if (claim.details) {
      issues.push(...validateDetailIds(claimId, detailIds))
    }

    if (claim.relations) {
      issues.push(...validateRelationIds(claimId, relationIds))
    }

    if (claim.details && claim.aliases) {
      issues.push(...validateAliases(claimId, detailIds, claim.aliases))
    }

    if (claim.details && claim.optionals) {
      issues.push(...validateOptionals(claimId, detailIds, claim.optionals))
    }

    const effectiveDetailIds = [...new Set([...detailIds, ...relationIds])]

    if (effectiveDetailIds.length > 0) {
      const detailFields = new Map<string, 'details' | 'relations'>()

      for (const detailId of detailIds) {
        detailFields.set(detailId, 'details')
      }

      for (const relationId of relationIds) {
        if (!detailFields.has(relationId)) {
          detailFields.set(relationId, 'relations')
        }
      }

      issues.push(...validateDetailPathConflicts(claimId, effectiveDetailIds, detailFields))
    }
  }

  return issues
}

function validateDetailIds(
  claimId: string,
  details: NonNullable<Specification['claims'][string]['details']>
): string[] {
  const issues: string[] = []
  const detailIds = new Set<string>()

  for (const detailId of details) {
    if (detailId === 'id' || detailId === '_id') {
      issues.push(`claims.${claimId}.details.${detailId} is a reserved identity detail path`)
    }

    if (detailIds.has(detailId)) {
      issues.push(`claims.${claimId}.details.${detailId} is duplicated`)
    }

    detailIds.add(detailId)
  }

  issues.push(...validateDetailPathSyntax(claimId, 'details', [...detailIds]))

  return issues
}

function validateRelationIds(claimId: string, relationIds: string[]): string[] {
  const issues: string[] = []

  for (const relationId of relationIds) {
    if (relationId === 'id' || relationId === '_id') {
      issues.push(`claims.${claimId}.relations.${relationId} is a reserved identity detail path`)
    }
  }

  issues.push(...validateDetailPathSyntax(claimId, 'relations', relationIds))

  return issues
}

function validateAliases(
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

function validateOptionals(
  claimId: string,
  details: NonNullable<Specification['claims'][string]['details']>,
  optionals: NonNullable<Specification['claims'][string]['optionals']>
): string[] {
  const detailIds = new Set(details)

  return Object.keys(optionals).flatMap(optionalPath =>
    detailIds.has(optionalPath)
      ? []
      : [`claims.${claimId}.optionals.${optionalPath} must also be listed in details`]
  )
}

function validateDetailPathSyntax(
  claimId: string,
  fieldName: 'details' | 'relations',
  detailIds: string[]
): string[] {
  const issues: string[] = []

  const detailPaths = detailIds.map(detailId => ({
    detailId,
    segments: detailId.split('.')
  }))

  for (const detailPath of detailPaths) {
    if (detailPath.segments.some(segment => segment === '')) {
      issues.push(
        `claims.${claimId}.${fieldName}.${detailPath.detailId} must not contain empty path segments`
      )
    }

    const invalidSegment = detailPath.segments.find(
      segment => segment !== '' && !/^[^[\]]+(?:\[\])?$/u.test(segment)
    )

    if (invalidSegment) {
      issues.push(
        `claims.${claimId}.${fieldName}.${detailPath.detailId} segment ${invalidSegment} must be either <name> or <name>[]`
      )
    }
  }

  return issues
}

function validateDetailPathConflicts(
  claimId: string,
  detailIds: string[],
  detailFields: ReadonlyMap<string, 'details' | 'relations'>
): string[] {
  const issues: string[] = []

  const detailPaths = detailIds.map(detailId => ({
    detailId,
    segments: detailId.split('.')
  }))

  function getDetailPathIssuePath(detailId: string) {
    const detailField = detailFields.get(detailId) as 'details' | 'relations'

    return `claims.${claimId}.${detailField}.${detailId}`
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

      const leftName = leftSegment.replace(/\[\]$/u, '')
      const rightName = rightSegment.replace(/\[\]$/u, '')

      if (leftName === rightName) {
        return leftName
      }

      return undefined
    }

    return undefined
  }

  for (let index = 0; index < detailPaths.length; index += 1) {
    const left = detailPaths[index]

    for (let otherIndex = index + 1; otherIndex < detailPaths.length; otherIndex += 1) {
      const right = detailPaths[otherIndex]

      if (isStrictDetailPathPrefix(left.segments, right.segments)) {
        issues.push(
          `${getDetailPathIssuePath(left.detailId)} must not be a strict prefix of ${right.detailId}`
        )
      }

      if (isStrictDetailPathPrefix(right.segments, left.segments)) {
        issues.push(
          `${getDetailPathIssuePath(right.detailId)} must not be a strict prefix of ${left.detailId}`
        )
      }

      const conflictSegment = getArrayObjectConflictSegment(left.segments, right.segments)

      if (conflictSegment) {
        issues.push(
          `${getDetailPathIssuePath(left.detailId)} conflicts with ${right.detailId} because segment ${conflictSegment} uses both object and array form`
        )
      }
    }
  }

  return issues
}

function validateExtensionFields(spec: Specification): string[] {
  const issues: string[] = []

  issues.push(
    ...validateExtensibleObjectFields('', spec, ['data-sketch', 'info', 'sources', 'claims'])
  )
  issues.push(...validateExtensibleObjectFields('info', spec.info, ['name']))

  if (spec.sources) {
    issues.push(
      ...validateExtensibleObjectFields('sources', spec.sources, ['openapi', 'arazzo', 'asyncapi'])
    )
  }

  for (const [claimId, claim] of Object.entries(spec.claims)) {
    issues.push(
      ...validateExtensibleObjectFields(`claims.${claimId}`, claim, [
        'name',
        'reason',
        'traces',
        'details',
        'optionals',
        'aliases',
        'relations',
        'tentative'
      ])
    )
    issues.push(
      ...validateExtensibleObjectFields(`claims.${claimId}.traces`, claim.traces, [
        'operations',
        'workflows',
        'channels'
      ])
    )
  }

  return issues
}

function validateExtensibleObjectFields(
  path: string,
  object: Record<string, unknown>,
  knownFields: readonly string[]
) {
  const issues: string[] = []

  for (const field of Object.keys(object)) {
    if (!knownFields.includes(field) && !field.startsWith('x-')) {
      const fieldPath = path ? `${path}.${field}` : field

      issues.push(`${fieldPath} is not supported; use x-* for extension fields`)
    }
  }

  return issues
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
