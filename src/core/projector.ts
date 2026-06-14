import type { Specification } from './parser.ts'
import type { DataSketch } from './spec.ts'

export type RelationalDbProjection = {
  readonly 'data-sketch/relational-db-projection': '1.0.0-draft.3'
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
  readonly keys: RelationalDbProjectionKeys
  readonly constraints?: RelationalDbProjectionConstraints
  readonly indexes?: readonly RelationalDbProjectionIndex[]
}

type RelationalDbProjectionKeys = {
  readonly primary: RelationalDbProjectionPrimaryKey
  readonly foreign: readonly RelationalDbProjectionForeignKey[]
}

type RelationalDbProjectionColumn = {
  readonly id: string
  readonly name: string
  readonly type: RelationalDbProjectionColumnType
  readonly nullable?: true
}

type RelationalDbProjectionColumnType =
  | `CHAR(${number})`
  | 'VARCHAR(1024)'
  | `VARCHAR(${number})`
  | 'INTEGER'
  | 'BOOLEAN'
  | `DECIMAL(${number}, ${number})`

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

type RelationalDbProjectionForeignKeyKind = 'explicit' | 'structural' | 'inferred' | 'extension'

type RelationalDbProjectionConstraints = {
  readonly unique?: readonly RelationalDbProjectionUniqueConstraint[]
  readonly check?: readonly RelationalDbProjectionCheckConstraint[]
}

type RelationalDbProjectionUniqueConstraint = {
  readonly name: string
  readonly columns: readonly string[]
}

type RelationalDbProjectionCheckConstraint = {
  readonly name: string
  readonly expression: string
}

type RelationalDbProjectionIndex = {
  readonly name: string
  readonly columns: readonly string[]
}

type MutableRelationalDbProjectionTable = {
  name: string
  columns: RelationalDbProjectionColumn[]
  keys: {
    primary: {
      name: string
      columns: string[]
    }
    foreign: RelationalDbProjectionForeignKey[]
  }
  constraints?: {
    unique?: RelationalDbProjectionUniqueConstraint[]
    check?: RelationalDbProjectionCheckConstraint[]
  }
  indexes?: RelationalDbProjectionIndex[]
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

  const issues: string[] = []
  const tableNameRenames = new Map<string, string>()
  const columnNameRenames = new Map<string, Map<string, string>>()

  for (const [claimId, claim] of Object.entries(sketch.spec.claims)) {
    const extension = (claim as Record<string, unknown>)['x-relational-db-schema']

    if (extension === undefined) {
      continue
    }

    applyRelationalDbSchemaExtension(
      tables,
      claimId,
      extension,
      issues,
      tableNameRenames,
      columnNameRenames
    )
  }

  if (issues.length > 0) {
    throw new Error(issues.join('\n'))
  }

  applyForeignKeyTargetRenames(tables, tableNameRenames, columnNameRenames)

  return {
    'data-sketch/relational-db-projection': '1.0.0-draft.3',
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
      keys: {
        primary: {
          name: `pk_${tableName}`,
          columns: ['id']
        },
        foreign: []
      }
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
  const matchingColumn = table.columns.find(column => column.id === path)

  if (matchingColumn) {
    table.columns = table.columns.map(column =>
      column.id === path
        ? {
            ...column,
            type: 'CHAR(26)'
          }
        : column
    )
  } else {
    addProjectionColumn(tableId, table, {
      id: path,
      name: columnName,
      type: 'CHAR(26)'
    })
  }

  table.keys.foreign.push({
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

  if (table.keys.foreign.some(foreignKey => foreignKey.name === foreignKeyName)) {
    return
  }

  table.keys.foreign.push({
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

function applyRelationalDbSchemaExtension(
  tables: Record<string, MutableRelationalDbProjectionTable>,
  claimId: string,
  extension: unknown,
  issues: string[],
  tableNameRenames: Map<string, string>,
  columnNameRenames: Map<string, Map<string, string>>
) {
  const prefix = `claims.${claimId}.x-relational-db-schema`

  if (!isRecord(extension)) {
    issues.push(`${prefix} must be an object`)

    return
  }

  for (const member of Object.keys(extension)) {
    if (!['names', 'types', 'keys', 'constraints', 'indexes'].includes(member)) {
      issues.push(`${prefix}.${member} is not a supported x-relational-db-schema member`)
    }
  }

  const claimTableIds = Object.keys(tables).filter(
    tableId => tableId === claimId || tableId.startsWith(`${claimId}.`)
  )

  const originalTableNames = new Map(
    claimTableIds.map(tableId => [tableId, tables[tableId].name] as const)
  )

  applyTypeOverrides(tables, claimTableIds, prefix, extension.types, issues)
  applyForeignKeyOverrides(tables, claimId, prefix, extension.keys, issues)
  applyConstraintOverrides(tables, claimId, prefix, extension.constraints, issues)
  applyIndexOverrides(tables, claimId, prefix, extension.indexes, issues)
  applyNameOverrides(
    tables,
    claimTableIds,
    originalTableNames,
    prefix,
    extension.names,
    issues,
    tableNameRenames,
    columnNameRenames
  )
}

function applyTypeOverrides(
  tables: Record<string, MutableRelationalDbProjectionTable>,
  claimTableIds: readonly string[],
  prefix: string,
  types: unknown,
  issues: string[]
) {
  if (types === undefined) {
    return
  }

  if (!isRecord(types)) {
    issues.push(`${prefix}.types must be an object`)

    return
  }

  for (const [path, override] of Object.entries(types)) {
    const fieldPrefix = `${prefix}.types.${path}`

    const match = claimTableIds
      .map(tableId => ({
        tableId,
        columnIndex: tables[tableId].columns.findIndex(c => c.id === path)
      }))
      .find(({ columnIndex }) => columnIndex !== -1)

    if (!match) {
      issues.push(`${fieldPrefix} does not reference an existing projected column`)
      continue
    }

    const type = resolveColumnTypeOverride(override, fieldPrefix, issues)

    if (type) {
      const table = tables[match.tableId]

      table.columns[match.columnIndex] = {
        ...table.columns[match.columnIndex],
        type
      }
    }
  }
}

function resolveColumnTypeOverride(
  override: unknown,
  fieldPrefix: string,
  issues: string[]
): RelationalDbProjectionColumnType | undefined {
  if (!isRecord(override) || typeof override.type !== 'string') {
    issues.push(`${fieldPrefix} must be an object with a type`)

    return undefined
  }

  const type = override.type.toUpperCase()

  if (type === 'CHAR' || type === 'VARCHAR') {
    const length = override.length

    if (!Number.isInteger(length) || Number(length) <= 0) {
      issues.push(`${fieldPrefix} must specify a positive integer length for type ${type}`)

      return undefined
    }

    return `${type}(${length})` as RelationalDbProjectionColumnType
  }

  if (type === 'INTEGER' || type === 'BOOLEAN') {
    return type
  }

  if (type === 'DECIMAL') {
    const { precision, scale } = override

    if (
      !Number.isInteger(precision) ||
      Number(precision) <= 0 ||
      !Number.isInteger(scale) ||
      Number(scale) < 0
    ) {
      issues.push(
        `${fieldPrefix} must specify a positive integer precision and a non-negative integer scale for type DECIMAL`
      )

      return undefined
    }

    return `DECIMAL(${Number(precision)}, ${Number(scale)})`
  }

  issues.push(`${fieldPrefix}.type ${override.type} is not supported`)

  return undefined
}

function applyForeignKeyOverrides(
  tables: Record<string, MutableRelationalDbProjectionTable>,
  claimId: string,
  prefix: string,
  keys: unknown,
  issues: string[]
) {
  if (keys === undefined) {
    return
  }

  if (!isRecord(keys)) {
    issues.push(`${prefix}.keys must be an object`)

    return
  }

  for (const member of Object.keys(keys)) {
    if (member !== 'foreign') {
      issues.push(`${prefix}.keys.${member} is not a supported x-relational-db-schema member`)
    }
  }

  if (keys.foreign === undefined) {
    return
  }

  if (!Array.isArray(keys.foreign)) {
    issues.push(`${prefix}.keys.foreign must be an array`)

    return
  }

  const table = tables[claimId]
  const matchedExistingIndexes = new Set<number>()

  keys.foreign.forEach((entry, index) => {
    const fieldPrefix = `${prefix}.keys.foreign[${index}]`

    if (!isRecord(entry) || typeof entry.name !== 'string' || entry.name === '') {
      issues.push(`${fieldPrefix}.name must be a non-empty string`)

      return
    }

    const columns = getSingleColumnReference(entry.columns, `${fieldPrefix}.columns`, issues)
    const references = isRecord(entry.references) ? entry.references : undefined

    if (!references || typeof references.table !== 'string') {
      issues.push(`${fieldPrefix}.references.table must be a string`)

      return
    }

    const referenceColumns = getSingleColumnReference(
      references.columns,
      `${fieldPrefix}.references.columns`,
      issues
    )

    if (!columns || !referenceColumns) {
      return
    }

    const sourceColumn = table.columns.find(column => column.id === columns)

    if (!sourceColumn) {
      issues.push(`${fieldPrefix}.columns references unknown column ${columns}`)

      return
    }

    const targetTable = tables[references.table]

    if (!targetTable) {
      issues.push(`${fieldPrefix}.references.table references unknown table ${references.table}`)

      return
    }

    const targetColumn = targetTable.columns.find(column => column.id === referenceColumns)

    if (!targetColumn) {
      issues.push(
        `${fieldPrefix}.references.columns references unknown column ${referenceColumns} in table ${references.table}`
      )

      return
    }

    const existingIndex = table.keys.foreign.findIndex(
      foreignKey => foreignKey.column === sourceColumn.name
    )

    if (existingIndex !== -1) {
      if (matchedExistingIndexes.has(existingIndex)) {
        issues.push(
          `${fieldPrefix} matches the same existing foreign key as another override entry`
        )

        return
      }

      matchedExistingIndexes.add(existingIndex)

      table.keys.foreign[existingIndex] = {
        name: entry.name,
        column: sourceColumn.name,
        target: {
          table: targetTable.name,
          column: targetColumn.name
        },
        kind: table.keys.foreign[existingIndex].kind
      }
    } else {
      table.keys.foreign.push({
        name: entry.name,
        column: sourceColumn.name,
        target: {
          table: targetTable.name,
          column: targetColumn.name
        },
        kind: 'extension'
      })
    }
  })
}

function getSingleColumnReference(value: unknown, fieldPrefix: string, issues: string[]) {
  if (!Array.isArray(value) || value.length !== 1 || typeof value[0] !== 'string') {
    issues.push(`${fieldPrefix} must be an array with exactly one column id`)

    return undefined
  }

  return value[0]
}

function applyConstraintOverrides(
  tables: Record<string, MutableRelationalDbProjectionTable>,
  claimId: string,
  prefix: string,
  constraints: unknown,
  issues: string[]
) {
  if (constraints === undefined) {
    return
  }

  if (!isRecord(constraints)) {
    issues.push(`${prefix}.constraints must be an object`)

    return
  }

  for (const member of Object.keys(constraints)) {
    if (member !== 'unique' && member !== 'check') {
      issues.push(
        `${prefix}.constraints.${member} is not a supported x-relational-db-schema member`
      )
    }
  }

  const table = tables[claimId]

  if (constraints.unique !== undefined) {
    if (!Array.isArray(constraints.unique)) {
      issues.push(`${prefix}.constraints.unique must be an array`)
    } else {
      constraints.unique.forEach((entry, index) => {
        const fieldPrefix = `${prefix}.constraints.unique[${index}]`
        const resolved = resolveNamedColumnList(table, entry, fieldPrefix, issues)

        if (resolved) {
          table.constraints ??= {}
          table.constraints.unique ??= []
          table.constraints.unique.push(resolved)
        }
      })
    }
  }

  if (constraints.check !== undefined) {
    if (!Array.isArray(constraints.check)) {
      issues.push(`${prefix}.constraints.check must be an array`)
    } else {
      constraints.check.forEach((entry, index) => {
        const fieldPrefix = `${prefix}.constraints.check[${index}]`

        if (
          !isRecord(entry) ||
          typeof entry.name !== 'string' ||
          entry.name === '' ||
          typeof entry.expression !== 'string' ||
          entry.expression === ''
        ) {
          issues.push(`${fieldPrefix} must have a non-empty name and expression`)

          return
        }

        table.constraints ??= {}
        table.constraints.check ??= []
        table.constraints.check.push({ name: entry.name, expression: entry.expression })
      })
    }
  }
}

function applyIndexOverrides(
  tables: Record<string, MutableRelationalDbProjectionTable>,
  claimId: string,
  prefix: string,
  indexes: unknown,
  issues: string[]
) {
  if (indexes === undefined) {
    return
  }

  if (!Array.isArray(indexes)) {
    issues.push(`${prefix}.indexes must be an array`)

    return
  }

  const table = tables[claimId]

  indexes.forEach((entry, index) => {
    const fieldPrefix = `${prefix}.indexes[${index}]`
    const resolved = resolveNamedColumnList(table, entry, fieldPrefix, issues)

    if (resolved) {
      table.indexes ??= []
      table.indexes.push(resolved)
    }
  })
}

function resolveNamedColumnList(
  table: MutableRelationalDbProjectionTable,
  entry: unknown,
  fieldPrefix: string,
  issues: string[]
) {
  if (
    !isRecord(entry) ||
    typeof entry.name !== 'string' ||
    entry.name === '' ||
    !Array.isArray(entry.columns) ||
    entry.columns.length === 0
  ) {
    issues.push(`${fieldPrefix} must have a non-empty name and a non-empty columns array`)

    return undefined
  }

  const columnNames: string[] = []

  for (const columnId of entry.columns) {
    const column = table.columns.find(c => c.id === columnId)

    if (!column) {
      issues.push(`${fieldPrefix}.columns references unknown column ${String(columnId)}`)

      return undefined
    }

    columnNames.push(column.name)
  }

  return { name: entry.name, columns: columnNames }
}

function applyNameOverrides(
  tables: Record<string, MutableRelationalDbProjectionTable>,
  claimTableIds: readonly string[],
  originalTableNames: ReadonlyMap<string, string>,
  prefix: string,
  names: unknown,
  issues: string[],
  tableNameRenames: Map<string, string>,
  columnNameRenames: Map<string, Map<string, string>>
) {
  if (names === undefined) {
    return
  }

  if (!isRecord(names)) {
    issues.push(`${prefix}.names must be an object`)

    return
  }

  for (const member of Object.keys(names)) {
    if (member !== 'tables' && member !== 'columns') {
      issues.push(`${prefix}.names.${member} is not a supported x-relational-db-schema member`)
    }
  }

  if (names.tables !== undefined) {
    if (!isRecord(names.tables)) {
      issues.push(`${prefix}.names.tables must be an object`)
    } else {
      for (const [tableId, newName] of Object.entries(names.tables)) {
        const fieldPrefix = `${prefix}.names.tables.${tableId}`

        if (!claimTableIds.includes(tableId)) {
          issues.push(`${fieldPrefix} does not reference a projected table for this claim`)
          continue
        }

        if (typeof newName !== 'string' || newName === '') {
          issues.push(`${fieldPrefix} must be a non-empty string`)
          continue
        }

        const conflict = Object.entries(tables).find(
          ([existingTableId, existingTable]) =>
            existingTableId !== tableId && existingTable.name === newName
        )

        if (conflict) {
          issues.push(
            `Projected table name ${newName} for table ${tableId} conflicts with table ${conflict[0]}`
          )
          continue
        }

        const table = tables[tableId]

        table.name = newName
        tableNameRenames.set(originalTableNames.get(tableId) as string, newName)
      }
    }
  }

  if (names.columns !== undefined) {
    if (!isRecord(names.columns)) {
      issues.push(`${prefix}.names.columns must be an object`)
    } else {
      for (const [tableId, columnOverrides] of Object.entries(names.columns)) {
        const tableFieldPrefix = `${prefix}.names.columns.${tableId}`

        if (!claimTableIds.includes(tableId)) {
          issues.push(`${tableFieldPrefix} does not reference a projected table for this claim`)
          continue
        }

        if (!isRecord(columnOverrides)) {
          issues.push(`${tableFieldPrefix} must be an object`)
          continue
        }

        const table = tables[tableId]

        for (const [columnId, newName] of Object.entries(columnOverrides)) {
          const fieldPrefix = `${tableFieldPrefix}.${columnId}`
          const columnIndex = table.columns.findIndex(column => column.id === columnId)

          if (columnIndex === -1) {
            issues.push(`${fieldPrefix} does not reference an existing projected column`)
            continue
          }

          if (typeof newName !== 'string' || newName === '') {
            issues.push(`${fieldPrefix} must be a non-empty string`)
            continue
          }

          const conflict = table.columns.find(
            (column, index) => index !== columnIndex && column.name === newName
          )

          if (conflict) {
            issues.push(
              `Projected column name ${newName} for column ${columnId} in table ${tableId} conflicts with column ${conflict.id}`
            )
            continue
          }

          const oldColumnName = table.columns[columnIndex].name

          table.columns[columnIndex] = { ...table.columns[columnIndex], name: newName }
          renameTableColumnReferences(table, oldColumnName, newName)

          const originalTableName = originalTableNames.get(tableId) as string
          let columnRenames = columnNameRenames.get(originalTableName)

          if (!columnRenames) {
            columnRenames = new Map()
            columnNameRenames.set(originalTableName, columnRenames)
          }

          columnRenames.set(oldColumnName, newName)
        }
      }
    }
  }
}

function renameTableColumnReferences(
  table: MutableRelationalDbProjectionTable,
  oldColumnName: string,
  newColumnName: string
) {
  table.keys.primary.columns = table.keys.primary.columns.map(column =>
    column === oldColumnName ? newColumnName : column
  )

  table.keys.foreign = table.keys.foreign.map(foreignKey =>
    foreignKey.column === oldColumnName ? { ...foreignKey, column: newColumnName } : foreignKey
  )

  if (table.constraints?.unique) {
    table.constraints.unique = table.constraints.unique.map(constraint => ({
      ...constraint,
      columns: constraint.columns.map(column => (column === oldColumnName ? newColumnName : column))
    }))
  }

  if (table.indexes) {
    table.indexes = table.indexes.map(indexEntry => ({
      ...indexEntry,
      columns: indexEntry.columns.map(column => (column === oldColumnName ? newColumnName : column))
    }))
  }
}

function applyForeignKeyTargetRenames(
  tables: Record<string, MutableRelationalDbProjectionTable>,
  tableNameRenames: ReadonlyMap<string, string>,
  columnNameRenames: ReadonlyMap<string, Map<string, string>>
) {
  for (const table of Object.values(tables)) {
    table.keys.foreign = table.keys.foreign.map(foreignKey => {
      const newTableName = tableNameRenames.get(foreignKey.target.table)

      if (newTableName === undefined) {
        return foreignKey
      }

      const columnRenames = columnNameRenames.get(foreignKey.target.table)
      const newColumnName = columnRenames?.get(foreignKey.target.column)

      return {
        ...foreignKey,
        target: {
          table: newTableName,
          column: newColumnName ?? foreignKey.target.column
        }
      }
    })
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}
