import { readSpecification } from './parser.ts'
import type { DataSketch } from './spec.ts'

export type RelationalDbProjection = {
  readonly 'data-sketch/relational-db-projection': '1.0.0-draft.2'
  readonly claims: readonly RelationalDbProjectionClaim[]
}

type RelationalDbProjectionClaim = {
  readonly id: string
  readonly name: string
  readonly tentative: boolean
  readonly details: readonly RelationalDbProjectionDetail[]
  readonly relations: readonly RelationalDbProjectionRelation[]
}

type RelationalDbProjectionDetail = {
  readonly path: string
  readonly name: string
  readonly type: 'string' | 'number'
  readonly required: boolean
}

type RelationalDbProjectionRelation = {
  readonly path: string
  readonly to: string
  readonly targetName: string
  readonly reason?: string
}

export function useProjectors<
  P extends Record<string, (() => unknown) | undefined>,
  Next extends Record<string, (() => unknown) | undefined>
>(sketch: DataSketch<P>, projectors: Next): DataSketch<P & Next> {
  return {
    ...sketch,
    projections: {
      ...sketch.projections,
      ...projectors
    }
  }
}

type Specification = ReturnType<typeof readSpecification>

export function buildRelationalDbProjection(sketch: DataSketch): RelationalDbProjection {
  if (sketch.metadata.validated !== true) {
    throw new Error('DataSketch must be validated before building a relational DB projection')
  }

  const spec = readSpecification(sketch)

  return {
    'data-sketch/relational-db-projection': '1.0.0-draft.2',
    claims: Object.entries(spec.claims).map(([claimId, claim]) => ({
      id: claimId,
      name: claim.name,
      tentative: claim.tentative ?? false,
      details: getProjectionDetails(claim.details),
      relations: getProjectionRelations(spec, claim.relations)
    }))
  }
}

function getProjectionDetails(details: Specification['claims'][string]['details']) {
  if (!details) {
    return []
  }

  if (Array.isArray(details)) {
    return details.map(path => ({
      path,
      name: getLastPathSegmentName(path),
      type: 'string' as const,
      required: false
    }))
  }

  return Object.entries(details).map(([path, metadata]) => ({
    path,
    name: metadata.name,
    type: metadata.type ?? 'string',
    required: metadata.required ?? true
  }))
}

function getProjectionRelations(
  spec: Specification,
  relations: Specification['claims'][string]['relations']
) {
  if (!relations) {
    return []
  }

  return Object.entries(relations).map(([path, relation]) => {
    const relationTarget = typeof relation === 'string' ? relation : relation.to
    const targetClaim = spec.claims[relationTarget]
    const reason = typeof relation === 'string' ? undefined : relation.reason

    return {
      path,
      to: relationTarget,
      targetName: targetClaim?.name ?? relationTarget,
      ...(reason ? { reason } : {})
    }
  })
}

function getLastPathSegmentName(path: string) {
  const segments = path.split('.')
  const segment = segments[segments.length - 1]

  return segment.endsWith('[]') ? segment.slice(0, -2) : segment
}
