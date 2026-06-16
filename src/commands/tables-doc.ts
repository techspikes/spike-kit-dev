import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { parseArgs } from 'node:util'
import type { Specification } from '../core/parser.ts'
import { parse } from '../core/parser.ts'
import type { RelationalDbProjection } from '../core/projector.ts'
import { resolveCwdRelativePath } from '../core/utils.ts'
import { validate } from '../core/validator.ts'

const usage = () =>
  [
    'Usage: shot tables-doc [OPTION]... SPEC_FILE',
    '',
    'Validate a Data Sketch Specification v1 YAML or JSON file and write a Markdown table document.',
    '',
    'Options:',
    '  -o, --output TABLES_DOC_FILE  Output Markdown file path',
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
        help: { type: 'boolean', short: 'h' }
      }
    })

    const specFile = options.positionals[0]
    const outputFile = options.values.output

    if (options.values.help) {
      console.log(usage())

      return 0
    }

    if (!specFile || !outputFile) {
      console.log(usage())

      return 1
    }

    const sketch = parse({ path: specFile })
    const validated = validate({ sketch, trace: true })
    const projection = validated.projections.relationalDb()
    const markdown = renderTablesDoc(validated.spec, projection, specFile)

    writeFileSync(resolveCwdRelativePath(outputFile), markdown)

    return 0
  } catch (error) {
    console.error((error as Error).message)

    return 1
  }
}

export function renderTablesDoc(
  spec: Specification,
  projection: RelationalDbProjection,
  specFile: string
): string {
  const lines: string[] = [
    '---',
    `source: ${basename(specFile)}`,
    `sha256: ${computeSha256(spec)}`,
    `generated_at: ${new Date().toISOString()}`,
    '---',
    '',
    `# ${spec.info.name}`
  ]

  for (const [tableId, table] of Object.entries(projection.tables)) {
    const claimId = tableId.split('.')[0]
    const claim = spec.claims[claimId]

    lines.push('', `## ${table.name}`, '', claim.reason)

    if (claim.tentative === true) {
      lines.push('', '> [!CAUTION]', '> This table is tentative and needs human review.')
    }

    lines.push('', '| Column | Data Type | Nullable | Description |', '| --- | --- | --- | --- |')

    for (const column of table.columns) {
      const description =
        column.id === 'id'
          ? 'Auto-assigned surrogate key'
          : (claim.aliases?.[column.id]?.join(', ') ?? '')

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

  const indexStatements = Object.values(projection.tables).flatMap(table =>
    (table.indexes ?? []).map(
      index => `CREATE INDEX ${index.name} ON ${table.name} (${index.columns.join(', ')});`
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

  return `${lines.join('\n')}\n`
}

function renderCreateTable(table: RelationalDbProjection['tables'][string]): string[] {
  const definitions: string[] = table.columns.map(
    col => `  ${col.name} ${col.type}${col.nullable ? '' : ' NOT NULL'}`
  )

  definitions.push(
    `  CONSTRAINT ${table.keys.primary.name} PRIMARY KEY (${table.keys.primary.columns.join(', ')})`
  )

  for (const fk of table.keys.foreign) {
    definitions.push(
      `  CONSTRAINT ${fk.name} FOREIGN KEY (${fk.column}) REFERENCES ${fk.target.table} (${fk.target.column})`
    )
  }

  if (table.constraints?.unique) {
    for (const uq of table.constraints.unique) {
      definitions.push(`  CONSTRAINT ${uq.name} UNIQUE (${uq.columns.join(', ')})`)
    }
  }

  if (table.constraints?.check) {
    for (const ck of table.constraints.check) {
      definitions.push(
        `  CONSTRAINT ${ck.name} CHECK (${ck.column} IN (${ck.enum.map(sqlStr).join(', ')}))`
      )
    }
  }

  return [
    `CREATE TABLE ${table.name} (`,
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
    .map(
      key => `${JSON.stringify(key)}:${canonicalizeJson((value as Record<string, unknown>)[key])}`
    )

  return `{${pairs.join(',')}}`
}

function computeSha256(spec: unknown): string {
  return createHash('sha256').update(canonicalizeJson(spec), 'utf-8').digest('hex')
}

function esc(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('_', '\\_')
}

function sqlStr(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}
