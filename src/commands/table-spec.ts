import { createHash } from 'node:crypto'
import { basename } from 'node:path'
import type { ParseArgsConfig, parseArgs } from 'node:util'
import {
  createDbProjectionSnapshot,
  type DbProjectionColumn,
  type DbProjectionSnapshot
} from '../core/projector.ts'
import utils from '../core/utils.ts'
import { parseSpecification, type Specification } from '../core/validator.ts'
import { renderSqlDdl } from './table-spec.ddl.ts'

const usage = () =>
  [
    'Usage: shot table-spec <spec file> --output <table spec file>',
    '',
    'Validate a Valuable Data Specification v1 YAML or JSON file and write a Markdown table specification.',
    '',
    'Options:',
    '  -o, --output <table spec file>  Output Markdown file path',
    '  -h, --help                      Show this help'
  ].join('\n')

export const config: ParseArgsConfig = {
  allowPositionals: true,
  strict: true,
  options: {
    output: { type: 'string', short: 'o' },
    help: { type: 'boolean', short: 'h' }
  }
}

export function execute(options: ReturnType<typeof parseArgs<typeof config>>) {
  try {
    const specPath = options.positionals[0]
    const outputPath = options.values.output

    if (options.values.help || !specPath || typeof outputPath !== 'string') {
      console.log(usage())
    } else {
      const source = utils.readCwdRelativePathSync(specPath).toString('utf-8')
      const spec = parseSpecification(source)
      const snapshot = createDbProjectionSnapshot(spec)
      const markdown = renderMarkdownTableSpec(spec, snapshot, specPath, source)

      utils.writeCwdRelativePathSync(outputPath, markdown)
    }
  } catch (error) {
    console.error(utils.extractErrorMessages(error))
  }
}

export function renderMarkdownTableSpec(
  spec: Specification,
  snapshot: DbProjectionSnapshot,
  specPath: string,
  source: string
) {
  const lines = [
    '---',
    `source: ${basename(specPath)}`,
    `source_sha256: ${createHash('sha256').update(source).digest('hex')}`,
    `generated_at: ${new Date().toISOString()}`,
    '---',
    '',
    `# ${spec.info.name}`
  ]
  const storeEntries = Object.entries(spec.stores)

  for (const [tableIndex, table] of snapshot.tables.entries()) {
    const [, store] = storeEntries[tableIndex]
    const fieldEntries = Object.entries(store.fields)

    lines.push('', `## ${table.name}`, '', store.reason)

    if (store.tentative === true) {
      lines.push(
        '',
        '> [!CAUTION]',
        '> This table is tentative and needs human review.'
      )
    }

    lines.push(
      '',
      '| Column | Data Type | Nullable | Default | Format | Description |',
      '| --- | --- | --- | --- | --- | --- |'
    )

    for (const [columnIndex, column] of table.columns.entries()) {
      const [, field] = fieldEntries[columnIndex]

      lines.push(
        `| ${escapeTableText(column.name)} | ${escapeTableText(
          formatType(column)
        )} | ${column.nullable ? 'yes' : 'no'} | ${escapeTableText(
          formatDefault(column)
        )} | ${escapeTableText(field.format ?? '')} | ${escapeTableText(
          (field.aliases ?? []).join(', ')
        )} |`
      )
    }

    if (table.primaryKey) {
      lines.push(
        '',
        '### Primary Key',
        '',
        '| Constraint Name | Columns |',
        '| --- | --- |',
        `| ${escapeTableText(table.primaryKey.name)} | ${escapeTableText(
          table.primaryKey.columns.join(', ')
        )} |`
      )
    }

    if (table.uniqueConstraints.length > 0) {
      lines.push(
        '',
        '### Unique Constraints',
        '',
        '| Constraint Name | Columns |',
        '| --- | --- |'
      )

      for (const uniqueConstraint of table.uniqueConstraints) {
        lines.push(
          `| ${escapeTableText(uniqueConstraint.name)} | ${escapeTableText(
            uniqueConstraint.columns.join(', ')
          )} |`
        )
      }
    }

    if (table.foreignKeys.length > 0) {
      lines.push(
        '',
        '### Foreign Keys',
        '',
        '| Constraint Name | Columns | Referenced Table | Referenced Columns | On Delete | On Update |',
        '| --- | --- | --- | --- | --- | --- |'
      )

      for (const foreignKey of table.foreignKeys) {
        lines.push(
          `| ${escapeTableText(foreignKey.name)} | ${escapeTableText(
            foreignKey.columns.join(', ')
          )} | ${escapeTableText(foreignKey.references.table)} | ${escapeTableText(
            foreignKey.references.columns.join(', ')
          )} | ${escapeTableText(foreignKey.onDelete ?? '')} | ${escapeTableText(
            foreignKey.onUpdate ?? ''
          )} |`
        )
      }
    }

    if (table.checkConstraints.length > 0) {
      lines.push(
        '',
        '### Check Constraints',
        '',
        '| Constraint Name | Column | Values |',
        '| --- | --- | --- |'
      )

      for (const checkConstraint of table.checkConstraints) {
        lines.push(
          `| ${escapeTableText(checkConstraint.name)} | ${escapeTableText(
            checkConstraint.column
          )} | ${escapeTableText(checkConstraint.values.join(', '))} |`
        )
      }
    }

    if (table.indexes.length > 0) {
      lines.push(
        '',
        '### Indexes',
        '',
        '| Index Name | Indexed Columns | Description |',
        '| --- | --- | --- |'
      )

      for (const [indexIndex, index] of table.indexes.entries()) {
        const indexSpec = store.indexes?.[indexIndex]
        lines.push(
          `| ${escapeTableText(index.name)} | ${escapeTableText(
            index.columns.map(column => column.name).join(', ')
          )} | ${escapeTableText(indexSpec?.reason ?? '')} |`
        )
      }
    }
  }

  lines.push('', '## DDL', '', '```sql')
  lines.push(...renderSqlDdl(snapshot))
  lines.push('```')

  return `${lines.join('\n')}\n`
}

function formatType(column: DbProjectionColumn) {
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

function formatDefault(column: DbProjectionColumn) {
  if (column.default.kind === 'omitted') {
    return ''
  }

  return String(column.default.value)
}

function escapeTableText(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replaceAll('_', '\\_')
}
