import type {
  DbProjectionColumn,
  DbProjectionSnapshot
} from '../core/projector.ts'

export function renderSqlDdl(snapshot: DbProjectionSnapshot) {
  const tableStatements = snapshot.tables.map(table =>
    renderCreateTableSql(table).join('\n')
  )
  const indexStatements = snapshot.tables.flatMap(table =>
    table.indexes.map(
      index =>
        `CREATE INDEX ${index.name} ON ${table.name} (${index.columns
          .map(column => column.name)
          .join(', ')});`
    )
  )
  const statements = [
    ...tableStatements,
    ...(indexStatements.length > 0 ? [indexStatements.join('\n')] : [])
  ]

  return statements.flatMap((statement, index) =>
    index === 0 ? statement.split('\n') : ['', ...statement.split('\n')]
  )
}

function renderCreateTableSql(table: DbProjectionSnapshot['tables'][number]) {
  const definitions = [
    ...table.columns.map(column => `  ${formatColumnDefinitionSql(column)}`),
    ...(table.primaryKey
      ? [
          `  CONSTRAINT ${table.primaryKey.name} PRIMARY KEY (${table.primaryKey.columns.join(
            ', '
          )})`
        ]
      : []),
    ...table.uniqueConstraints.map(
      uniqueConstraint =>
        `  CONSTRAINT ${uniqueConstraint.name} UNIQUE (${uniqueConstraint.columns.join(
          ', '
        )})`
    ),
    ...table.foreignKeys.map(foreignKey => {
      const actions = [
        foreignKey.onDelete
          ? ` ON DELETE ${formatReferentialActionSql(foreignKey.onDelete)}`
          : '',
        foreignKey.onUpdate
          ? ` ON UPDATE ${formatReferentialActionSql(foreignKey.onUpdate)}`
          : ''
      ].join('')

      return `  CONSTRAINT ${foreignKey.name} FOREIGN KEY (${foreignKey.columns.join(
        ', '
      )}) REFERENCES ${foreignKey.references.table} (${foreignKey.references.columns.join(
        ', '
      )})${actions}`
    }),
    ...table.checkConstraints.map(
      checkConstraint =>
        `  CONSTRAINT ${checkConstraint.name} CHECK (${
          checkConstraint.column
        } IN (${checkConstraint.values.map(formatStringLiteralSql).join(', ')}))`
    )
  ]

  return [
    `CREATE TABLE ${table.name} (`,
    definitions
      .map((definition, index) =>
        index === definitions.length - 1 ? definition : `${definition},`
      )
      .join('\n'),
    ');'
  ]
}

function formatColumnDefinitionSql(column: DbProjectionColumn) {
  return [
    column.name,
    formatTypeSql(column).toUpperCase(),
    column.default.kind === 'value'
      ? `DEFAULT ${formatDefaultValueSql(column.default.value)}`
      : '',
    column.nullable ? '' : 'NOT NULL'
  ]
    .filter(value => value !== '')
    .join(' ')
}

function formatTypeSql(column: DbProjectionColumn) {
  if (column.type.length) {
    return `${column.type.name}(${column.type.length})`
  }

  if (column.type.precision && column.type.scale !== undefined) {
    return `${column.type.name}(${column.type.precision}, ${column.type.scale})`
  }

  if (column.type.precision) {
    return `${column.type.name}(${column.type.precision})`
  }

  return column.type.name
}

function formatDefaultValueSql(value: string | number | boolean | null) {
  if (value === null) {
    return 'NULL'
  }

  if (typeof value === 'string') {
    return formatStringLiteralSql(value)
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE'
  }

  return String(value)
}

function formatStringLiteralSql(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function formatReferentialActionSql(action: string) {
  return action.replace(/[A-Z]/g, letter => ` ${letter}`).toUpperCase()
}
