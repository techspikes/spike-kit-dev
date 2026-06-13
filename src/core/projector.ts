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
  readonly nullable?: true
}

type RelationalDbProjectionColumnType =
  | 'CHAR(26)'
  | 'VARCHAR(1024)'
  | `VARCHAR(${number})`
  | 'INTEGER'
  | 'BOOLEAN'

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
  readonly type: RelationalDbProjectionColumnType
  readonly nullable: boolean
}

type OpenApiFieldProjectionInput = {
  readonly path: string
  readonly schemaType: string
  readonly maxLength?: number
  readonly required: boolean
}

const httpMethods = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'])

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

    const detailInputs = getDetailProjectionInputs(
      details,
      getOpenApiFieldProjectionInputs(sketch.sources?.openapi, claim.traces.operations)
    )

    for (const detail of detailInputs) {
      const tablePathSegments = getTablePathSegments(detail.path)
      const tableId = getTableId(claimId, tablePathSegments)
      const tableName = getTableName(claimId, claim.name, tablePathSegments)

      ensureProjectionTables(tables, claimId, claim.name, tablePathSegments)

      const table = ensureProjectionTable(tables, tableId, tableName)

      addProjectionColumn(tableId, table, {
        id: detail.path,
        name: getColumnName(detail.path, tablePathSegments),
        type: detail.type,
        ...(detail.nullable ? { nullable: true as const } : {})
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
          type: 'CHAR(26)'
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
  details: NonNullable<Specification['claims'][string]['details']>,
  openApiFields: readonly OpenApiFieldProjectionInput[]
): DetailProjectionInput[] {
  return details.map(path => ({
    path,
    ...getDetailProjection(path, openApiFields)
  }))
}

function getDetailProjection(
  path: string,
  openApiFields: readonly OpenApiFieldProjectionInput[]
): Omit<DetailProjectionInput, 'path'> {
  const matches = openApiFields.filter(field => field.path === path)

  if (matches.length === 0) {
    return {
      type: 'VARCHAR(1024)',
      nullable: false
    }
  }

  return {
    type: getInferredColumnType(matches),
    nullable: matches.some(match => !match.required)
  }
}

function getInferredColumnType(
  matches: readonly OpenApiFieldProjectionInput[]
): RelationalDbProjectionColumnType {
  const fieldTypes = new Set(matches.map(match => getOpenApiProjectionType(match.schemaType)))

  if (fieldTypes.size !== 1) {
    return 'VARCHAR(1024)'
  }

  const [fieldType] = fieldTypes

  if (fieldType === 'number') {
    return 'INTEGER'
  }

  if (fieldType === 'boolean') {
    return 'BOOLEAN'
  }

  if (fieldType === 'string') {
    const maxLengths = matches
      .map(match => match.maxLength)
      .filter((maxLength): maxLength is number => typeof maxLength === 'number')

    if (maxLengths.length > 0) {
      return `VARCHAR(${Math.max(...maxLengths)})`
    }
  }

  return 'VARCHAR(1024)'
}

function getOpenApiProjectionType(schemaType: string) {
  if (schemaType === 'integer' || schemaType === 'number') {
    return 'number'
  }

  if (schemaType === 'string' || schemaType === 'boolean') {
    return schemaType
  }

  return 'unknown'
}

function getOpenApiFieldProjectionInputs(
  openApi: unknown,
  operationIds: readonly string[]
): OpenApiFieldProjectionInput[] {
  const operationIdSet = new Set(operationIds)
  const openApiRecord = isRecord(openApi) ? openApi : {}
  const paths = isRecord(openApiRecord.paths) ? openApiRecord.paths : {}

  return Object.values(paths)
    .filter(isRecord)
    .flatMap(pathItem =>
      Object.entries(pathItem)
        .filter((entry): entry is [string, Record<string, unknown>] => {
          const [method, operation] = entry

          return httpMethods.has(method) && isRecord(operation)
        })
        .filter(([, operation]) => operationIdSet.has(getOperationId(operation)))
        .flatMap(([, operation]) => getOperationFieldProjectionInputs(operation))
    )
}

function getOperationId(operation: Record<string, unknown>) {
  return typeof operation.operationId === 'string' ? operation.operationId : ''
}

function getOperationFieldProjectionInputs(
  operation: Record<string, unknown>
): OpenApiFieldProjectionInput[] {
  return [
    ...getRequestBodyFieldProjectionInputs(operation.requestBody),
    ...getResponseFieldProjectionInputs(operation.responses)
  ]
}

function getRequestBodyFieldProjectionInputs(input: unknown): OpenApiFieldProjectionInput[] {
  const requestBody = isRecord(input) ? input : undefined

  if (!requestBody) {
    return []
  }

  const jsonContent = getJsonContent(requestBody.content)

  if (!jsonContent) {
    return []
  }

  return getSchemaFieldProjectionInputs(jsonContent.schema, '', requestBody.required === true)
}

function getResponseFieldProjectionInputs(input: unknown): OpenApiFieldProjectionInput[] {
  const responses = isRecord(input) ? input : {}

  return Object.values(responses).flatMap(response => {
    const responseRecord = isRecord(response) ? response : undefined
    const jsonContent = responseRecord ? getJsonContent(responseRecord.content) : undefined

    if (!jsonContent) {
      return []
    }

    return getSchemaFieldProjectionInputs(jsonContent.schema, '', true)
  })
}

function getJsonContent(input: unknown) {
  const content = isRecord(input) ? input : undefined

  if (!content) {
    return undefined
  }

  const jsonContentEntry = Object.entries(content).find(([contentType]) =>
    isJsonContentType(contentType)
  )

  if (!jsonContentEntry) {
    return undefined
  }

  const [, mediaType] = jsonContentEntry
  const mediaTypeRecord = isRecord(mediaType) ? mediaType : {}

  return {
    schema: mediaTypeRecord.schema
  }
}

function isJsonContentType(contentType: string) {
  return contentType === 'application/json' || contentType.endsWith('+json')
}

function getSchemaFieldProjectionInputs(
  input: unknown,
  pathPrefix: string,
  ancestorsRequired: boolean
): OpenApiFieldProjectionInput[] {
  const schema = isRecord(input) ? input : {}
  const schemaType = getSchemaType(schema)

  if (schemaType === 'array') {
    return getArraySchemaFieldProjectionInputs(schema, pathPrefix, ancestorsRequired)
  }

  if (schemaType === 'object' || isRecord(schema.properties)) {
    return getObjectSchemaFieldProjectionInputs(schema, pathPrefix, ancestorsRequired)
  }

  if (pathPrefix) {
    return [
      {
        path: pathPrefix,
        schemaType,
        ...(getMaxLength(schema) !== undefined ? { maxLength: getMaxLength(schema) } : {}),
        required: ancestorsRequired
      }
    ]
  }

  return []
}

function getObjectSchemaFieldProjectionInputs(
  schema: Record<string, unknown>,
  pathPrefix: string,
  ancestorsRequired: boolean
) {
  const properties = isRecord(schema.properties) ? schema.properties : {}

  const requiredProperties = Array.isArray(schema.required)
    ? new Set(schema.required.filter((field): field is string => typeof field === 'string'))
    : new Set<string>()

  return Object.entries(properties).flatMap(([propertyName, propertySchema]) => {
    const propertyPath = pathPrefix ? `${pathPrefix}.${propertyName}` : propertyName
    const propertyRequired = ancestorsRequired && requiredProperties.has(propertyName)

    return getSchemaFieldProjectionInputs(propertySchema, propertyPath, propertyRequired)
  })
}

function getArraySchemaFieldProjectionInputs(
  schema: Record<string, unknown>,
  pathPrefix: string,
  ancestorsRequired: boolean
) {
  const arrayPath = `${pathPrefix}[]`
  const items = isRecord(schema.items) ? schema.items : {}
  const itemType = getSchemaType(items)

  if (itemType === 'object' || isRecord(items.properties)) {
    return getSchemaFieldProjectionInputs(items, arrayPath, ancestorsRequired)
  }

  return [
    {
      path: arrayPath,
      schemaType: itemType,
      ...(getMaxLength(items) !== undefined ? { maxLength: getMaxLength(items) } : {}),
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

function getMaxLength(schema: Record<string, unknown>) {
  return Number.isInteger(schema.maxLength) && Number(schema.maxLength) > 0
    ? Number(schema.maxLength)
    : undefined
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
          type: 'CHAR(26)'
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
      type: 'CHAR(26)'
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

function toSnakeCase(value: string) {
  return value
    .replace(/\[\]$/u, '')
    .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
    .replace(/[-\s]+/gu, '_')
    .toLowerCase()
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}
