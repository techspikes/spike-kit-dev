import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'
import type { Specification } from '../core/parser.ts'
import type { RelationalDbProjection } from '../core/projector.ts'
import { project, relationalDbProjector } from '../core/projector.ts'
import { getFileName, resolveCwdRelativeFilePath, writeTextFile } from '../core/utils.ts'
import { openApiValidator, validate } from '../core/validator.ts'

export type RenderTablesDocOptions = {
  readonly includeFrontMatter?: boolean
}

const usage = () =>
  [
    'Usage: shot tables-doc [OPTION]... SPEC_FILE',
    '',
    'Validate a Data Sketch Specification v1 YAML or JSON file and write a Markdown table document.',
    '',
    'Options:',
    '  -o, --output TABLES_DOC_FILE  Output Markdown file path',
    '      --no-front-matter         Write Markdown without YAML front matter',
    '  -h, --help                    Show this help'
  ].join('\n')

export function executeTableDoc(args: readonly string[]) {
  try {
    const options = parseArgs({
      allowPositionals: true,
      strict: true,
      args: [...args],
      options: {
        output: { type: 'string', short: 'o' },
        'no-front-matter': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' }
      }
    })

    const specFilePath = options.positionals[0]
    const outputFilePath = options.values.output

    if (options.values.help) {
      console.log(usage())

      return 0
    }

    if (!specFilePath || !outputFilePath) {
      console.log(usage())

      return 1
    }

    const validated = validate({
      specFilePath,
      trace: true,
      validators: [openApiValidator]
    })

    const projection = project(validated, [relationalDbProjector]).get<RelationalDbProjection>('relational-db')
    const markdown = renderTablesDoc(validated.spec, projection, getFileName(specFilePath), {
      includeFrontMatter: options.values['no-front-matter'] !== true
    })

    writeTextFile(resolveCwdRelativeFilePath(outputFilePath), markdown)

    return 0
  } catch (error) {
    console.error((error as Error).message)

    return 1
  }
}

export function renderTablesDoc(
  spec: Specification,
  projection: RelationalDbProjection,
  sourceLabel: string,
  renderOptions: RenderTablesDocOptions = {}
): string {
  const lines: string[] = []

  if (renderOptions.includeFrontMatter !== false) {
    lines.push(
      '---',
      `source: ${sourceLabel}`,
      `sha256: ${computeSha256(spec)}`,
      `generated_at: ${new Date().toISOString()}`,
      '---',
      ''
    )
  }

  lines.push(`# ${spec.info.name}`)

  lines.push(...renderMarkdownTableSections(spec, projection))
  lines.push(...renderDdlSection(projection))
  lines.push(...renderMermaidErDiagramSection(projection))

  return `${lines.join('\n')}\n`
}

function renderMarkdownTableSections(spec: Specification, projection: RelationalDbProjection): string[] {
  const lines: string[] = []

  for (const [tableId, table] of Object.entries(projection.tables)) {
    const claimId = tableId.split('.')[0]
    const claim = spec.claims[claimId]

    lines.push('', `## ${table.name}`, '', claim.reason)

    if (claim.tentative === true) {
      lines.push('', '> [!CAUTION]', '> This table is tentative and needs review.')
    }

    lines.push('', '| Column | Data Type | Nullable | Description |', '| --- | --- | --- | --- |')

    for (const column of table.columns) {
      const description =
        column.id === 'id' ? 'Auto-assigned surrogate key' : (claim.aliases?.[column.id]?.join(', ') ?? '-')

      lines.push(
        `| ${esc(column.name)} | ${esc(column.type)} | ${column.nullable ? 'yes' : 'no'} | ${esc(description)} |`
      )
    }

    lines.push(
      '',
      '### Primary Key',
      '',
      '| Constraint Name | Columns |',
      '| --- | --- |',
      `| ${esc(table.keys.primary.name)} | ${esc(table.keys.primary.columns.join(', '))} |`
    )

    if (table.keys.foreign.length > 0) {
      lines.push(
        '',
        '### Foreign Keys',
        '',
        '| Constraint Name | Column | Referenced Table | Referenced Column | Kind |',
        '| --- | --- | --- | --- | --- |'
      )

      for (const fk of table.keys.foreign) {
        lines.push(
          `| ${esc(fk.name)} | ${esc(fk.column)} | ${esc(fk.target.table)} | ${esc(fk.target.column)} | ${esc(fk.kind)} |`
        )
      }
    }

    if (table.constraints?.unique && table.constraints.unique.length > 0) {
      lines.push('', '### Unique Constraints', '', '| Constraint Name | Columns |', '| --- | --- |')

      for (const uq of table.constraints.unique) {
        lines.push(`| ${esc(uq.name)} | ${esc(uq.columns.join(', '))} |`)
      }
    }

    if (table.constraints?.check && table.constraints.check.length > 0) {
      lines.push(
        '',
        '### Check Constraints',
        '',
        '| Constraint Name | Column | Allowed Values |',
        '| --- | --- | --- |'
      )

      for (const ck of table.constraints.check) {
        lines.push(`| ${esc(ck.name)} | ${esc(ck.column)} | ${esc(ck.enum.join(', '))} |`)
      }
    }
  }

  return lines
}

function renderDdlSection(projection: RelationalDbProjection): string[] {
  const lines: string[] = []

  const indexStatements = Object.values(projection.tables).flatMap(table =>
    (table.indexes ?? []).map(
      index =>
        `CREATE INDEX ${sqlIdentifier(index.name)} ON ${sqlIdentifier(table.name)} (${index.columns.map(sqlIdentifier).join(', ')});`
    )
  )

  lines.push('', '## DDL', '', '```sql')

  const tables = Object.values(projection.tables)

  for (const [tableIndex, table] of tables.entries()) {
    if (tableIndex > 0) {
      lines.push('')
    }

    lines.push(...renderCreateTable(table))
  }

  for (const stmt of indexStatements) {
    lines.push('', stmt)
  }

  lines.push('```')

  return lines
}

function renderMermaidErDiagramSection(projection: RelationalDbProjection): string[] {
  const lines = ['', '## ER Diagram', '', '```mermaid', 'erDiagram']
  const tables = Object.values(projection.tables)

  for (const table of tables) {
    lines.push(`  ${getMermaidIdentifier(table.name)} {`)

    const primaryKeyColumns = new Set(table.keys.primary.columns)
    const foreignKeyColumns = new Set(table.keys.foreign.map(foreignKey => foreignKey.column))

    for (const column of table.columns) {
      const key = primaryKeyColumns.has(column.name) ? ' PK' : foreignKeyColumns.has(column.name) ? ' FK' : ''

      lines.push(`    ${getMermaidIdentifier(column.type)} ${getMermaidIdentifier(column.name)}${key}`)
    }

    lines.push('  }')
  }

  for (const table of tables) {
    for (const foreignKey of table.keys.foreign) {
      const foreignKeyColumn = table.columns.find(column => column.name === foreignKey.column)
      const sourceCardinality = foreignKeyColumn?.nullable === true ? 'o{' : '|{'

      lines.push(
        `  ${getMermaidIdentifier(foreignKey.target.table)} ||--${sourceCardinality} ${getMermaidIdentifier(table.name)} : ${getMermaidIdentifier(foreignKey.name)}`
      )
    }
  }

  lines.push('```')

  return lines
}

function renderCreateTable(table: RelationalDbProjection['tables'][string]): string[] {
  const definitions: string[] = table.columns.map(
    column => `  ${sqlIdentifier(column.name)} ${column.type}${column.nullable ? '' : ' NOT NULL'}`
  )

  definitions.push(
    `  CONSTRAINT ${sqlIdentifier(table.keys.primary.name)} PRIMARY KEY (${table.keys.primary.columns.map(sqlIdentifier).join(', ')})`
  )

  for (const foreignKey of table.keys.foreign) {
    definitions.push(
      `  CONSTRAINT ${sqlIdentifier(foreignKey.name)} FOREIGN KEY (${sqlIdentifier(foreignKey.column)}) REFERENCES ${sqlIdentifier(foreignKey.target.table)} (${sqlIdentifier(foreignKey.target.column)})`
    )
  }

  if (table.constraints?.unique) {
    for (const uniqueConstraint of table.constraints.unique) {
      definitions.push(
        `  CONSTRAINT ${sqlIdentifier(uniqueConstraint.name)} UNIQUE (${uniqueConstraint.columns.map(sqlIdentifier).join(', ')})`
      )
    }
  }

  if (table.constraints?.check) {
    for (const checkConstraint of table.constraints.check) {
      definitions.push(
        `  CONSTRAINT ${sqlIdentifier(checkConstraint.name)} CHECK (${sqlIdentifier(checkConstraint.column)} IN (${checkConstraint.enum.map(sqlStr).join(', ')}))`
      )
    }
  }

  return [
    `CREATE TABLE ${sqlIdentifier(table.name)} (`,
    ...definitions.map((def, i) => (i < definitions.length - 1 ? `${def},` : def)),
    ');'
  ]
}

function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(',')}]`
  }

  const pairs = Object.keys(value as Record<string, unknown>)
    .sort()
    .map(key => `${JSON.stringify(key)}:${canonicalizeJson((value as Record<string, unknown>)[key])}`)

  return `{${pairs.join(',')}}`
}

function computeSha256(spec: unknown): string {
  return createHash('sha256').update(canonicalizeJson(spec), 'utf-8').digest('hex')
}

function esc(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('_', '\\_')
}

function getMermaidIdentifier(value: string): string {
  const identifier = value
    .replaceAll(/[^A-Za-z0-9_]/g, '_')
    .replaceAll(/_+/g, '_')
    .replaceAll(/^_+|_+$/g, '')

  if (/^[0-9]/.test(identifier)) {
    return `_${identifier}`
  }

  return identifier
}

function sqlStr(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function sqlIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}
