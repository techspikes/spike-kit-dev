import type { Specification } from './parser.ts'
import type { DataSketch } from './spec.ts'

export type RelationalDbProjection = {
  readonly 'data-sketch/relational-db-projection': '1.0.0-draft.2'
  readonly tables: Readonly<Record<string, RelationalDbProjectionTable>>
}

export type ExtensionProjection = {
  readonly 'data-sketch/extension-projection': '1.0.0-draft.2'
  readonly extensions: readonly ExtensionProjectionEntry[]
}

type ExtensionProjectionEntry = {
  readonly path: string
  readonly values: Readonly<Record<string, unknown>>
}

type RelationalDbProjectionTable = {
  readonly name: string
  readonly columns: readonly RelationalDbProjectionColumn[]
  readonly primaryKey: RelationalDbProjectionPrimaryKey
  readonly foreignKeys: readonly RelationalDbProjectionForeignKey[]
}

type RelationalDbProjectionColumn = {
  readonly id: string
  readonly name: string
  readonly type: RelationalDbProjectionColumnType
}

type RelationalDbProjectionColumnType = 'VARCHAR(26)' | 'VARCHAR(1024)' | 'INTEGER' | 'BOOLEAN'

type RelationalDbProjectionPrimaryKey = {
  readonly name: string
  readonly columns: readonly string[]
}

type RelationalDbProjectionForeignKey = {
  readonly name: string
  readonly column: string
  readonly target: {
    readonly table: string
    readonly column: string
  }
  readonly kind: RelationalDbProjectionForeignKeyKind
}

type RelationalDbProjectionForeignKeyKind = 'explicit' | 'structural' | 'inferred'

type MutableRelationalDbProjectionTable = {
  name: string
  columns: RelationalDbProjectionColumn[]
  primaryKey: RelationalDbProjectionPrimaryKey
  foreignKeys: RelationalDbProjectionForeignKey[]
}

type DetailProjectionInput = {
  readonly path: string
  readonly type: 'string' | 'number' | 'boolean'
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

export function buildRelationalDbProjection(sketch: DataSketch): RelationalDbProjection {
  if (sketch.metadata.validated !== true) {
    throw new Error('DataSketch must be validated before building a relational DB projection')
  }

  const tables: Record<string, MutableRelationalDbProjectionTable> = {}

  for (const [claimId, claim] of Object.entries(sketch.spec.claims)) {
    ensureProjectionTable(tables, claimId, claim.name)

    const details = claim.details as NonNullable<Specification['claims'][string]['details']>
    const detailInputs = getDetailProjectionInputs(details)

    for (const detail of detailInputs) {
      const tablePathSegments = getTablePathSegments(detail.path)
      const tableId = getTableId(claimId, tablePathSegments)
      const tableName = getTableName(claimId, claim.name, tablePathSegments)

      ensureProjectionTables(tables, claimId, claim.name, tablePathSegments)

      const table = ensureProjectionTable(tables, tableId, tableName)

      addProjectionColumn(tableId, table, {
        id: detail.path,
        name: getColumnName(detail.path, tablePathSegments),
        type: getColumnType(detail.type)
      })
    }

    if (claim.relations) {
      addProjectionForeignKeys(tables, sketch.spec, claimId, claim.name, claim.relations)
    }

    addProjectionClaimIdMatchForeignKeys(
      tables,
      sketch.spec,
      claimId,
      claim.name,
      detailInputs,
      claim.relations
    )
  }

  return {
    'data-sketch/relational-db-projection': '1.0.0-draft.2',
    tables
  }
}

export function buildExtensionProjection(sketch: DataSketch): ExtensionProjection {
  if (sketch.metadata.validated !== true) {
    throw new Error('DataSketch must be validated before building an extension projection')
  }

  const extensions: ExtensionProjectionEntry[] = []

  addExtensionProjectionEntry(extensions, '', sketch.spec)
  addExtensionProjectionEntry(extensions, 'info', sketch.spec.info)

  if (sketch.spec.sources) {
    addExtensionProjectionEntry(extensions, 'sources', sketch.spec.sources)
  }

  for (const [claimId, claim] of Object.entries(sketch.spec.claims)) {
    addExtensionProjectionEntry(extensions, `claims.${claimId}`, claim)
    addExtensionProjectionEntry(extensions, `claims.${claimId}.traces`, claim.traces)
  }

  return {
    'data-sketch/extension-projection': '1.0.0-draft.2',
    extensions
  }
}

function addExtensionProjectionEntry(
  entries: ExtensionProjectionEntry[],
  path: string,
  object: Record<string, unknown>
) {
  const values = Object.fromEntries(
    Object.entries(object).filter(([field]) => field.startsWith('x-'))
  )

  if (Object.keys(values).length > 0) {
    entries.push({
      path,
      values
    })
  }
}

function ensureProjectionTable(
  tables: Record<string, MutableRelationalDbProjectionTable>,
  tableId: string,
  tableName: string
) {
  const matchingTable = Object.entries(tables).find(
    ([existingTableId, table]) => existingTableId !== tableId && table.name === tableName
  )

  if (matchingTable) {
    throw new Error(
      `Projected table name ${tableName} for table ${tableId} conflicts with table ${matchingTable[0]}`
    )
  }

  if (!tables[tableId]) {
    tables[tableId] = {
      name: tableName,
      columns: [
        {
          id: 'id',
          name: 'id',
          type: 'VARCHAR(26)'
        }
      ],
      primaryKey: {
        name: `pk_${tableName}`,
        columns: ['id']
      },
      foreignKeys: []
    }
  }

  return tables[tableId]
}

function addProjectionColumn(
  tableId: string,
  table: MutableRelationalDbProjectionTable,
  column: RelationalDbProjectionColumn
) {
  const matchingColumn = table.columns.find(existingColumn => existingColumn.name === column.name)

  if (matchingColumn) {
    throw new Error(
      `Projected column name ${column.name} for column ${column.id} in table ${tableId} conflicts with column ${matchingColumn.id}`
    )
  }

  table.columns.push(column)
}

function getDetailProjectionInputs(
  details: NonNullable<Specification['claims'][string]['details']>
): DetailProjectionInput[] {
  if (Array.isArray(details)) {
    return details.map(path => ({
      path,
      type: 'string'
    }))
  }

  return Object.entries(details).map(([path, metadata]) => ({
    path,
    type: metadata.type ?? 'string'
  }))
}

function addProjectionForeignKeys(
  tables: Record<string, MutableRelationalDbProjectionTable>,
  spec: Specification,
  claimId: string,
  claimName: string,
  relations: NonNullable<Specification['claims'][string]['relations']>
) {
  for (const [path, relation] of Object.entries(relations)) {
    addProjectionForeignKey(tables, spec, claimId, claimName, path, relation, 'explicit')
  }
}

function addProjectionClaimIdMatchForeignKeys(
  tables: Record<string, MutableRelationalDbProjectionTable>,
  spec: Specification,
  claimId: string,
  claimName: string,
  details: readonly DetailProjectionInput[],
  relations: Specification['claims'][string]['relations']
) {
  const explicitRelationPaths = new Set(Object.keys(relations ?? {}))

  for (const detail of details) {
    if (detail.path.endsWith('[]') || explicitRelationPaths.has(detail.path)) {
      continue
    }

    const targetClaimId = getLastDetailPathSegmentName(detail.path)

    if (!spec.claims[targetClaimId]) {
      continue
    }

    addProjectionForeignKey(
      tables,
      spec,
      claimId,
      claimName,
      detail.path,
      targetClaimId,
      'inferred'
    )
  }
}

function addProjectionForeignKey(
  tables: Record<string, MutableRelationalDbProjectionTable>,
  spec: Specification,
  claimId: string,
  claimName: string,
  path: string,
  targetClaimId: string,
  kind: RelationalDbProjectionForeignKeyKind
) {
  const tablePathSegments = getTablePathSegments(path)
  const tableId = getTableId(claimId, tablePathSegments)
  const tableName = getTableName(claimId, claimName, tablePathSegments)

  ensureProjectionTables(tables, claimId, claimName, tablePathSegments)

  const table = ensureProjectionTable(tables, tableId, tableName)
  const columnName = getColumnName(path, tablePathSegments)
  const targetClaim = spec.claims[targetClaimId] as Specification['claims'][string]

  table.columns = table.columns.map(column =>
    column.id === path
      ? {
          ...column,
          type: 'VARCHAR(26)'
        }
      : column
  )

  table.foreignKeys.push({
    name: `fk_${table.name}_${columnName}`,
    column: columnName,
    target: {
      table: targetClaim.name,
      column: 'id'
    },
    kind
  })
}

function ensureProjectionTables(
  tables: Record<string, MutableRelationalDbProjectionTable>,
  claimId: string,
  claimName: string,
  tablePathSegments: readonly string[]
) {
  ensureProjectionTable(tables, claimId, claimName)

  for (let index = 0; index < tablePathSegments.length; index += 1) {
    if (tablePathSegments[index].endsWith('[]')) {
      const childTablePathSegments = tablePathSegments.slice(0, index + 1)
      const childTableId = getTableId(claimId, childTablePathSegments)
      const childTableName = getTableName(claimId, claimName, childTablePathSegments)
      const parentTablePathSegments = getParentTablePathSegments(childTablePathSegments)
      const parentTableId = getTableId(claimId, parentTablePathSegments)
      const parentTableName = getTableName(claimId, claimName, parentTablePathSegments)

      const childTable = ensureProjectionTable(tables, childTableId, childTableName)

      addProjectionStructuralForeignKey(childTable, parentTableId, parentTableName)
    }
  }
}

function addProjectionStructuralForeignKey(
  table: MutableRelationalDbProjectionTable,
  parentTableId: string,
  parentTableName: string
) {
  const columnName = getStructuralParentColumnName(parentTableId)
  const matchingColumn = table.columns.find(existingColumn => existingColumn.name === columnName)

  if (!matchingColumn) {
    table.columns.push({
      id: parentTableId,
      name: columnName,
      type: 'VARCHAR(26)'
    })
  }

  const foreignKeyName = `fk_${table.name}_${columnName}`

  if (table.foreignKeys.some(foreignKey => foreignKey.name === foreignKeyName)) {
    return
  }

  table.foreignKeys.push({
    name: foreignKeyName,
    column: columnName,
    target: {
      table: parentTableName,
      column: 'id'
    },
    kind: 'structural'
  })
}

function getParentTablePathSegments(tablePathSegments: readonly string[]) {
  let parentTableSegmentIndex = -1

  for (let index = 0; index < tablePathSegments.length - 1; index += 1) {
    if (tablePathSegments[index].endsWith('[]')) {
      parentTableSegmentIndex = index
    }
  }

  if (parentTableSegmentIndex === -1) {
    return []
  }

  return tablePathSegments.slice(0, parentTableSegmentIndex + 1)
}

function getTablePathSegments(path: string) {
  const segments = path.split('.')
  let tableSegmentIndex = -1

  for (let index = 0; index < segments.length - 1; index += 1) {
    if (segments[index].endsWith('[]')) {
      tableSegmentIndex = index
    }
  }

  if (tableSegmentIndex === -1) {
    return []
  }

  return segments.slice(0, tableSegmentIndex + 1)
}

function getTableId(claimId: string, tablePathSegments: readonly string[]) {
  if (tablePathSegments.length === 0) {
    return claimId
  }

  return `${claimId}.${tablePathSegments.join('.')}`
}

function getTableName(claimId: string, claimName: string, tablePathSegments: readonly string[]) {
  if (tablePathSegments.length === 0) {
    return claimName
  }

  return [claimId, ...tablePathSegments].map(toSnakeCase).join('_')
}

function getColumnName(path: string, tablePathSegments: readonly string[]) {
  const columnSegments = path.split('.').slice(tablePathSegments.length)

  return columnSegments.map(toSnakeCase).join('_')
}

function getLastDetailPathSegmentName(path: string) {
  const segments = path.split('.')

  return segments[segments.length - 1]
}

function getStructuralParentColumnName(parentTableId: string) {
  return parentTableId.split('.').map(toSnakeCase).join('_')
}

function getColumnType(type: 'string' | 'number' | 'boolean'): RelationalDbProjectionColumnType {
  if (type === 'number') {
    return 'INTEGER'
  }

  if (type === 'boolean') {
    return 'BOOLEAN'
  }

  return 'VARCHAR(1024)'
}

function toSnakeCase(value: string) {
  return value
    .replace(/\[\]$/u, '')
    .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
    .replace(/[-\s]+/gu, '_')
    .toLowerCase()
}
