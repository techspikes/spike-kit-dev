import { parseArgs } from 'node:util'
import { gunzipSync, gzipSync } from 'node:zlib'
import { load as yamlLoad } from 'js-yaml'
import type { RelationalDbProjection } from '../core/projector.ts'
import { project, relationalDbProjector, validateRelationalDbProjection } from '../core/projector.ts'
import { readTextFile, resolveCwdRelativeFilePath, writeTextFile } from '../core/utils.ts'
import { openApiValidator, validate } from '../core/validator.ts'

// ─── Snapshot types ────────────────────────────────────────────────────────────

type DbProjectionSnapshot = {
  readonly 'data-sketch/relational-db-projection': '1.0.0-draft.3'
  readonly tables: RelationalDbProjection['tables']
}

type SnapshotTable = DbProjectionSnapshot['tables'][string]
type SnapshotCheckConstraint = NonNullable<NonNullable<SnapshotTable['constraints']>['check']>[number]
type SnapshotTableEntry = { id: string; table: SnapshotTable }

// ─── Usage ────────────────────────────────────────────────────────────────────

const usage = () =>
  [
    'Usage: shot kysely-migration [OPTION]... SPEC_FILE',
    '',
    'Validate a Data Sketch Specification v1 YAML or JSON file and write a Kysely migration.',
    '',
    'Options:',
    '  -o, --output MIGRATION_FILE        Output TypeScript migration file path (required)',
    '  -p, --previous-migration PREV_FILE Read embedded snapshot from PREV_FILE for diff migration',
    '      --types-output TYPES_FILE      Write Database interface declaration file (must end in .d.ts)',
    '      --dry-run                      Perform all steps without writing files',
    '  -h, --help                         Show this help'
  ].join('\n')

// ─── Main entry point ─────────────────────────────────────────────────────────

export function executeKyselyMigration(args: readonly string[]) {
  try {
    const options = parseArgs({
      allowPositionals: true,
      strict: true,
      args: [...args],
      options: {
        output: { type: 'string', short: 'o' },
        'previous-migration': { type: 'string', short: 'p' },
        'types-output': { type: 'string' },
        'dry-run': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' }
      }
    })

    if (options.values.help) {
      console.log(usage())

      return 0
    }

    const specFilePath = options.positionals[0]
    const outputFilePath = options.values.output
    const previousMigrationFilePath = options.values['previous-migration']
    const typesOutputFilePath = options.values['types-output']
    const dryRun = options.values['dry-run'] ?? false

    if (!specFilePath || !outputFilePath) {
      process.stderr.write(`${usage()}\n`)

      return 1
    }

    if (typesOutputFilePath !== undefined && !typesOutputFilePath.endsWith('.d.ts')) {
      process.stderr.write(`Error: --types-output path must end in .d.ts\n\n${usage()}\n`)

      return 1
    }

    const validated = validate({
      specFilePath,
      trace: true,
      validators: [openApiValidator]
    })

    const projection = project(validated, [relationalDbProjector]).get<RelationalDbProjection>('relational-db')

    // Tentative tables are included, but migration users should review them.
    const allTableIds = Object.keys(projection.tables)
    const tentativeWarnings: string[] = []

    for (const tableId of allTableIds) {
      const claimId = tableId.split('.')[0]
      const claim = validated.spec.claims[claimId]

      if (claim?.tentative === true) {
        tentativeWarnings.push(
          `Warning: Tentative table included in migration and needs review: ${projection.tables[tableId].name}`
        )
      }
    }

    const afterSnapshot = buildSnapshot(projection, allTableIds)

    let beforeSnapshot: DbProjectionSnapshot | undefined

    if (previousMigrationFilePath) {
      const previousMigrationContent = readTextFile(resolveCwdRelativeFilePath(previousMigrationFilePath))

      beforeSnapshot = parseEmbeddedSnapshot(previousMigrationContent)
    }

    const checkWarnings: string[] = []

    if (beforeSnapshot) {
      // Diff mode: warn about added/removed check constraints
      const beforeCheckMap = new Map<string, SnapshotCheckConstraint[]>()

      for (const { id, table } of getSnapshotTableEntries(beforeSnapshot)) {
        beforeCheckMap.set(id, [...getCheckConstraints(table)])
      }

      for (const { id, table } of getSnapshotTableEntries(afterSnapshot)) {
        const beforeChecks = beforeCheckMap.get(id) ?? []
        const beforeCheckNames = new Set(beforeChecks.map(c => c.name))
        const afterCheckNames = new Set(getCheckConstraints(table).map(c => c.name))

        for (const ck of getCheckConstraints(table)) {
          if (!beforeCheckNames.has(ck.name)) {
            checkWarnings.push(`Warning: Check constraint ignored by migration renderer: ${table.name}.${ck.name}`)
          }
        }

        for (const ck of beforeChecks) {
          if (!afterCheckNames.has(ck.name)) {
            checkWarnings.push(`Warning: Check constraint ignored by migration renderer: ${table.name}.${ck.name}`)
          }
        }
      }
    } else {
      // Initial mode: warn about all check constraints in the after snapshot
      for (const { table } of getSnapshotTableEntries(afterSnapshot)) {
        for (const ck of getCheckConstraints(table)) {
          checkWarnings.push(`Warning: Check constraint ignored by migration renderer: ${table.name}.${ck.name}`)
        }
      }
    }

    let migrationContent: string
    let typesContent: string | undefined

    if (beforeSnapshot) {
      migrationContent = renderDiffMigrationFile(beforeSnapshot, afterSnapshot, checkWarnings)
    } else {
      migrationContent = renderInitialMigrationFile(afterSnapshot, checkWarnings)
    }

    if (typesOutputFilePath) {
      typesContent = renderTypesFile(afterSnapshot)
    }

    for (const warning of [...tentativeWarnings, ...checkWarnings]) {
      process.stderr.write(`${warning}\n`)
    }

    if (dryRun) {
      console.log('Dry run completed')

      return 0
    }

    writeTextFile(resolveCwdRelativeFilePath(outputFilePath), migrationContent)

    if (typesOutputFilePath && typesContent) {
      writeTextFile(resolveCwdRelativeFilePath(typesOutputFilePath), typesContent)
    }

    console.log('Migration generated')

    return 0
  } catch (error) {
    console.error((error as Error).message)

    return 1
  }
}

function buildSnapshot(projection: RelationalDbProjection, includedTableIds: string[]): DbProjectionSnapshot {
  const tables: Record<string, SnapshotTable> = {}

  for (const tableId of getDependencySortedTableIds(projection.tables, includedTableIds)) {
    tables[tableId] = projection.tables[tableId]
  }

  return {
    'data-sketch/relational-db-projection': '1.0.0-draft.3',
    tables
  }
}

function encodeSnapshot(snapshot: DbProjectionSnapshot, generatedAt: string): string {
  const json = canonicalizeJson(snapshot)
  const compressed = gzipSync(Buffer.from(json, 'utf-8'))
  const b64 = compressed.toString('base64')

  // Wrap at 76 chars per line
  const lines: string[] = []

  for (let i = 0; i < b64.length; i += 76) {
    lines.push(b64.slice(i, i + 76))
  }

  const payloadLines = lines.map(line => `//   ${line}`).join('\n')

  return [
    '// ---',
    '// data-sketch/relational-db-projection/embedded: 1.0.0-draft.3',
    `// generated_at: ${generatedAt}`,
    '// payload: |',
    payloadLines,
    '// ---'
  ].join('\n')
}

function parseEmbeddedSnapshot(fileContent: string): DbProjectionSnapshot {
  const lines = fileContent.split('\n')
  let inBlock = false
  const blockLines: string[] = []

  for (const line of lines) {
    if (line === '// ---') {
      if (inBlock) {
        // End of block — try to parse
        const yaml = blockLines.join('\n')

        try {
          const parsed = yamlLoad(yaml)

          if (
            parsed !== null &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed) &&
            (parsed as Record<string, unknown>)['data-sketch/relational-db-projection/embedded'] === '1.0.0-draft.3' &&
            typeof (parsed as Record<string, unknown>).payload === 'string'
          ) {
            const payload = (parsed as Record<string, unknown>).payload as string
            const b64 = payload.replace(/\s+/g, '')
            const compressed = Buffer.from(b64, 'base64')
            const json = gunzipSync(compressed).toString('utf-8')
            const snapshot = JSON.parse(json) as unknown

            if (
              snapshot !== null &&
              typeof snapshot === 'object' &&
              !Array.isArray(snapshot) &&
              (snapshot as Record<string, unknown>)['data-sketch/relational-db-projection'] === '1.0.0-draft.3'
            ) {
              return snapshot as DbProjectionSnapshot
            }
          }
          /* c8 ignore next 7 */
        } catch {
          // Not a valid block, continue scanning
        }

        inBlock = false
        blockLines.length = 0
      } else {
        inBlock = true
        blockLines.length = 0
      }
    } else if (inBlock) {
      // Strip leading `// ` (3 chars)
      if (line.startsWith('// ')) {
        blockLines.push(line.slice(3))
        /* c8 ignore next 7 */
      } else if (line === '//') {
        blockLines.push('')
      } else {
        // Malformed block, reset
        inBlock = false
        blockLines.length = 0
      }
    }
  }

  throw new Error('No embedded relational DB projection found in previous migration file')
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderInitialMigrationFile(snapshot: DbProjectionSnapshot, _warnings: string[]): string {
  validateRelationalDbProjection(snapshot)

  const generatedAt = new Date().toISOString()
  const embeddedBlock = encodeSnapshot(snapshot, generatedAt)

  const lines: string[] = [embeddedBlock, '']

  lines.push("import type { Kysely } from 'kysely'")
  lines.push('')

  // MigrationDatabase interface
  lines.push(...renderMigrationDatabase(snapshot))
  lines.push('')

  // up function
  lines.push('export async function up(db: Kysely<MigrationDatabase>): Promise<void> {')
  lines.push(...renderUpBody(snapshot))
  lines.push('}')
  lines.push('')

  // down function
  lines.push('export async function down(db: Kysely<MigrationDatabase>): Promise<void> {')
  lines.push(...renderDownBody(snapshot))
  lines.push('}')

  return `${lines.join('\n')}\n`
}

function renderMigrationDatabase(snapshot: DbProjectionSnapshot): string[] {
  const lines: string[] = ['interface MigrationDatabase {']

  for (const { table } of getSnapshotTableEntries(snapshot)) {
    lines.push(`  ${tsString(table.name)}: {`)

    for (const col of table.columns) {
      lines.push(`    ${tsString(col.name)}: ${sqlTypeToTs(col.type, col.nullable === true)}`)
    }

    lines.push('  }')
  }

  lines.push('}')

  return lines
}

function renderUpBody(snapshot: DbProjectionSnapshot): string[] {
  const lines: string[] = []

  for (const { table } of getSnapshotTableEntries(snapshot)) {
    lines.push(`  await db.schema`)
    lines.push(`    .createTable(${tsString(table.name)})`)

    for (const col of table.columns) {
      const typeStr = (col.type as string).toLowerCase()

      if (col.nullable === true) {
        lines.push(`    .addColumn(${tsString(col.name)}, ${tsString(typeStr)})`)
      } else {
        lines.push(`    .addColumn(${tsString(col.name)}, ${tsString(typeStr)}, column => column.notNull())`)
      }
    }

    lines.push(
      `    .addPrimaryKeyConstraint(${tsString(table.keys.primary.name)}, ${renderStringArray(table.keys.primary.columns)})`
    )

    for (const fk of table.keys.foreign) {
      lines.push(
        `    .addForeignKeyConstraint(${tsString(fk.name)}, ${renderStringArray([fk.column])}, ${tsString(fk.target.table)}, ${renderStringArray([fk.target.column])})`
      )
    }

    for (const uq of getUniqueConstraints(table)) {
      lines.push(`    .addUniqueConstraint(${tsString(uq.name)}, ${renderStringArray(uq.columns)})`)
    }

    lines.push('    .execute()')
    lines.push('')
  }

  // Indexes after all createTable calls
  for (const { table } of getSnapshotTableEntries(snapshot)) {
    for (const ix of getIndexes(table)) {
      lines.push(`  await db.schema`)
      lines.push(`    .createIndex(${tsString(ix.name)})`)
      lines.push(`    .on(${tsString(table.name)})`)
      lines.push(`    .columns(${renderStringArray(ix.columns)})`)
      lines.push('    .execute()')
      lines.push('')
    }
  }

  // Remove trailing blank line
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }

  return lines
}

function renderDownBody(snapshot: DbProjectionSnapshot): string[] {
  const lines: string[] = []

  // Drop indexes first (in order)
  const allIndexes: Array<{ tableName: string; indexName: string }> = []

  for (const { table } of getSnapshotTableEntries(snapshot)) {
    for (const ix of getIndexes(table)) {
      allIndexes.push({ tableName: table.name, indexName: ix.name })
    }
  }

  for (const { indexName } of allIndexes) {
    lines.push(`  await db.schema.dropIndex(${tsString(indexName)}).execute()`)
  }

  if (allIndexes.length > 0) {
    lines.push('')
  }

  // Drop tables in reverse order
  const reversedTables = getSnapshotTableEntries(snapshot).reverse()

  for (const { table } of reversedTables) {
    lines.push(`  await db.schema.dropTable(${tsString(table.name)}).execute()`)
  }

  return lines
}

// ─── Diff migration rendering ─────────────────────────────────────────────────

function renderDiffMigrationFile(
  before: DbProjectionSnapshot,
  after: DbProjectionSnapshot,
  _warnings: string[]
): string {
  validateRelationalDbProjection(before)
  validateRelationalDbProjection(after)

  const generatedAt = new Date().toISOString()
  const embeddedBlock = encodeSnapshot(after, generatedAt)

  const lines: string[] = [embeddedBlock, '']

  lines.push("import type { Kysely } from 'kysely'")
  lines.push('')

  // MigrationDatabase for up uses after snapshot
  lines.push(...renderMigrationDatabase(after))
  lines.push('')

  // up function
  lines.push('export async function up(db: Kysely<MigrationDatabase>): Promise<void> {')
  lines.push(...renderDiffUp(before, after))
  lines.push('}')
  lines.push('')

  // down function
  lines.push('export async function down(db: Kysely<MigrationDatabase>): Promise<void> {')
  lines.push(...renderDiffDown(before, after))
  lines.push('}')

  return `${lines.join('\n')}\n`
}

function renderDiffUp(before: DbProjectionSnapshot, after: DbProjectionSnapshot): string[] {
  const lines: string[] = []
  const beforeEntries = getSnapshotTableEntries(before)
  const afterEntries = getSnapshotTableEntries(after)
  const beforeById = new Map(beforeEntries.map(({ id, table }) => [id, table]))
  const afterById = new Map(afterEntries.map(({ id, table }) => [id, table]))
  const commonTables: Array<{ before: SnapshotTable; after: SnapshotTable }> = []

  for (const { id, table: afterTable } of afterEntries) {
    const beforeTable = beforeById.get(id)

    if (beforeTable !== undefined) {
      commonTables.push({ before: beforeTable, after: afterTable })
    }
  }

  // Step 1: Drop removed/changed non-unique indexes
  for (const { id, table: beforeTable } of beforeEntries) {
    const afterTable = afterById.get(id)
    const afterIndexNames = new Set(afterTable ? getIndexes(afterTable).map(index => index.name) : [])

    for (const index of getIndexes(beforeTable)) {
      if (!afterIndexNames.has(index.name)) {
        lines.push(`  await db.schema.dropIndex(${tsString(index.name)}).execute()`)
      } else {
        // Check if changed
        const afterIndex = getIndexes(afterTable as SnapshotTable).find(candidate => candidate.name === index.name)

        if (afterIndex && JSON.stringify(afterIndex.columns) !== JSON.stringify(index.columns)) {
          lines.push(`  await db.schema.dropIndex(${tsString(index.name)}).execute()`)
        }
      }
    }
  }

  // Step 2: Drop removed/changed FK, UQ, PK
  // Drop all FKs first so referenced PKs can be changed safely.
  for (const { id, table: beforeTable } of beforeEntries) {
    const afterTable = afterById.get(id)
    // Use before table name for alterTable (renames happen in step 3)
    const tableName = beforeTable.name

    const afterForeignKeyNames = new Set(afterTable?.keys.foreign.map(foreignKey => foreignKey.name) ?? [])

    for (const foreignKey of beforeTable.keys.foreign) {
      if (!afterForeignKeyNames.has(foreignKey.name)) {
        lines.push(
          `  await db.schema.alterTable(${tsString(tableName)}).dropConstraint(${tsString(foreignKey.name)}).execute()`
        )
      } else {
        const afterForeignKey = afterTable?.keys.foreign.find(candidate => candidate.name === foreignKey.name)

        if (
          afterForeignKey &&
          (afterForeignKey.column !== foreignKey.column ||
            JSON.stringify(afterForeignKey.target) !== JSON.stringify(foreignKey.target))
        ) {
          lines.push(
            `  await db.schema.alterTable(${tsString(tableName)}).dropConstraint(${tsString(foreignKey.name)}).execute()`
          )
        }
      }
    }
  }

  for (const { id, table: beforeTable } of beforeEntries) {
    const afterTable = afterById.get(id)
    const tableName = beforeTable.name
    const afterUniqueConstraintNames = new Set(
      afterTable ? getUniqueConstraints(afterTable).map(uniqueConstraint => uniqueConstraint.name) : []
    )

    for (const uniqueConstraint of getUniqueConstraints(beforeTable)) {
      if (!afterUniqueConstraintNames.has(uniqueConstraint.name)) {
        lines.push(
          `  await db.schema.alterTable(${tsString(tableName)}).dropConstraint(${tsString(uniqueConstraint.name)}).execute()`
        )
      } else {
        const afterUniqueConstraint = getUniqueConstraints(afterTable as SnapshotTable).find(
          candidate => candidate.name === uniqueConstraint.name
        )

        if (
          afterUniqueConstraint &&
          JSON.stringify(afterUniqueConstraint.columns) !== JSON.stringify(uniqueConstraint.columns)
        ) {
          lines.push(
            `  await db.schema.alterTable(${tsString(tableName)}).dropConstraint(${tsString(uniqueConstraint.name)}).execute()`
          )
        }
      }
    }
  }

  for (const { id, table: beforeTable } of beforeEntries) {
    const afterTable = afterById.get(id)
    const tableName = beforeTable.name

    if (afterTable) {
      const beforePrimaryKey = beforeTable.keys.primary
      const afterPrimaryKey = afterTable.keys.primary

      if (
        beforePrimaryKey.name !== afterPrimaryKey.name ||
        JSON.stringify(beforePrimaryKey.columns) !== JSON.stringify(afterPrimaryKey.columns)
      ) {
        lines.push(
          `  await db.schema.alterTable(${tsString(tableName)}).dropConstraint(${tsString(beforePrimaryKey.name)}).execute()`
        )
      }
    }
  }

  // Step 3: Rename tables (same id, different name)
  for (const { before: beforeTable, after: afterTable } of commonTables) {
    if (beforeTable.name !== afterTable.name) {
      lines.push(
        `  await db.schema.alterTable(${tsString(beforeTable.name)}).renameTo(${tsString(afterTable.name)}).execute()`
      )
    }
  }

  // Step 4: Rename columns
  for (const { before: beforeTable, after: afterTable } of commonTables) {
    const tableName = afterTable.name // use after name since table rename already happened
    const beforeColumnById = new Map(beforeTable.columns.map(column => [column.id, column]))
    const afterColumnById = new Map(afterTable.columns.map(column => [column.id, column]))

    for (const [columnId, beforeColumn] of beforeColumnById) {
      const afterColumn = afterColumnById.get(columnId)

      if (afterColumn && beforeColumn.name !== afterColumn.name) {
        lines.push(
          `  await db.schema.alterTable(${tsString(tableName)}).renameColumn(${tsString(beforeColumn.name)}, ${tsString(afterColumn.name)}).execute()`
        )
      }
    }
  }

  // Step 5: Drop removed columns
  for (const { before: beforeTable, after: afterTable } of commonTables) {
    const tableName = afterTable.name // use after name
    const afterColumnIds = new Set(afterTable.columns.map(column => column.id))

    for (const beforeColumn of beforeTable.columns) {
      if (!afterColumnIds.has(beforeColumn.id)) {
        lines.push(
          `  await db.schema.alterTable(${tsString(tableName)}).dropColumn(${tsString(beforeColumn.name)}).execute()`
        )
      }
    }
  }

  // Step 6: Drop removed tables (reverse topo order of before snapshot)
  const reversedBefore = [...beforeEntries].reverse()

  for (const { id, table: beforeTable } of reversedBefore) {
    if (!afterById.has(id)) {
      lines.push(`  await db.schema.dropTable(${tsString(beforeTable.name)}).execute()`)
    }
  }

  // Step 7: Alter changed column type/nullable
  for (const { before: beforeTable, after: afterTable } of commonTables) {
    const tableName = afterTable.name
    const beforeColumnById = new Map(beforeTable.columns.map(column => [column.id, column]))

    for (const afterColumn of afterTable.columns) {
      const beforeColumn = beforeColumnById.get(afterColumn.id)

      if (!beforeColumn) continue

      const columnName = afterColumn.name
      const typeChanged = (beforeColumn.type as string).toLowerCase() !== (afterColumn.type as string).toLowerCase()
      const nullableChanged = (beforeColumn.nullable === true) !== (afterColumn.nullable === true)

      if (typeChanged) {
        const newType = (afterColumn.type as string).toLowerCase()

        lines.push(`  await db.schema`)
        lines.push(`    .alterTable(${tsString(tableName)})`)
        lines.push(`    .alterColumn(${tsString(columnName)}, col => col.setDataType(${tsString(newType)}))`)
        lines.push('    .execute()')
      }

      if (nullableChanged) {
        const nullabilityMethod = afterColumn.nullable === true ? 'dropNotNull' : 'setNotNull'

        lines.push(`  await db.schema`)
        lines.push(`    .alterTable(${tsString(tableName)})`)
        lines.push(`    .alterColumn(${tsString(columnName)}, col => col.${nullabilityMethod}())`)
        lines.push('    .execute()')
      }
    }
  }

  // Step 8: Add new tables (in after topo order)
  const beforeIds = new Set(beforeEntries.map(({ id }) => id))

  for (const { id, table } of afterEntries) {
    if (!beforeIds.has(id)) {
      lines.push(`  await db.schema`)
      lines.push(`    .createTable(${tsString(table.name)})`)

      for (const col of table.columns) {
        const typeStr = (col.type as string).toLowerCase()

        if (col.nullable === true) {
          lines.push(`    .addColumn(${tsString(col.name)}, ${tsString(typeStr)})`)
        } else {
          lines.push(`    .addColumn(${tsString(col.name)}, ${tsString(typeStr)}, column => column.notNull())`)
        }
      }

      lines.push(
        `    .addPrimaryKeyConstraint(${tsString(table.keys.primary.name)}, ${renderStringArray(table.keys.primary.columns)})`
      )

      for (const fk of table.keys.foreign) {
        lines.push(
          `    .addForeignKeyConstraint(${tsString(fk.name)}, ${renderStringArray([fk.column])}, ${tsString(fk.target.table)}, ${renderStringArray([fk.target.column])})`
        )
      }

      for (const uq of getUniqueConstraints(table)) {
        lines.push(`    .addUniqueConstraint(${tsString(uq.name)}, ${renderStringArray(uq.columns)})`)
      }

      lines.push('    .execute()')
      lines.push('')
    }
  }

  // Step 9: Add new columns to existing tables
  for (const { before: beforeTable, after: afterTable } of commonTables) {
    const tableName = afterTable.name
    const beforeColumnIds = new Set(beforeTable.columns.map(column => column.id))

    for (const afterColumn of afterTable.columns) {
      if (!beforeColumnIds.has(afterColumn.id)) {
        const typeStr = (afterColumn.type as string).toLowerCase()

        if (afterColumn.nullable === true) {
          lines.push(
            `  await db.schema.alterTable(${tsString(tableName)}).addColumn(${tsString(afterColumn.name)}, ${tsString(typeStr)}).execute()`
          )
        } else {
          lines.push(
            `  await db.schema.alterTable(${tsString(tableName)}).addColumn(${tsString(afterColumn.name)}, ${tsString(typeStr)}, col => col.notNull()).execute()`
          )
        }
      }
    }
  }

  // Step 10: Add new/changed PK, FK, UQ
  for (const { before: beforeTable, after: afterTable } of commonTables) {
    const tableName = afterTable.name

    // PK - add if changed
    const beforePrimaryKey = beforeTable.keys.primary
    const afterPrimaryKey = afterTable.keys.primary

    if (
      beforePrimaryKey.name !== afterPrimaryKey.name ||
      JSON.stringify(beforePrimaryKey.columns) !== JSON.stringify(afterPrimaryKey.columns)
    ) {
      lines.push(
        `  await db.schema.alterTable(${tsString(tableName)}).addPrimaryKeyConstraint(${tsString(afterPrimaryKey.name)}, ${renderStringArray(afterPrimaryKey.columns)}).execute()`
      )
    }

    // FKs - add new or changed
    const beforeForeignKeyNames = new Set(beforeTable.keys.foreign.map(foreignKey => foreignKey.name))

    for (const afterForeignKey of afterTable.keys.foreign) {
      const beforeForeignKey = beforeTable.keys.foreign.find(candidate => candidate.name === afterForeignKey.name)
      const isNew = !beforeForeignKeyNames.has(afterForeignKey.name)
      const isChanged =
        beforeForeignKey !== undefined &&
        (beforeForeignKey.column !== afterForeignKey.column ||
          JSON.stringify(beforeForeignKey.target) !== JSON.stringify(afterForeignKey.target))

      if (isNew || isChanged) {
        lines.push(
          `  await db.schema.alterTable(${tsString(tableName)}).addForeignKeyConstraint(${tsString(afterForeignKey.name)}, ${renderStringArray([afterForeignKey.column])}, ${tsString(afterForeignKey.target.table)}, ${renderStringArray([afterForeignKey.target.column])}).execute()`
        )
      }
    }

    // UQs - add new or changed
    const beforeUniqueConstraintNames = new Set(
      getUniqueConstraints(beforeTable).map(uniqueConstraint => uniqueConstraint.name)
    )

    for (const afterUniqueConstraint of getUniqueConstraints(afterTable)) {
      const beforeUniqueConstraint = getUniqueConstraints(beforeTable).find(
        candidate => candidate.name === afterUniqueConstraint.name
      )
      const isNew = !beforeUniqueConstraintNames.has(afterUniqueConstraint.name)
      const isChanged =
        beforeUniqueConstraint !== undefined &&
        JSON.stringify(beforeUniqueConstraint.columns) !== JSON.stringify(afterUniqueConstraint.columns)

      if (isNew || isChanged) {
        lines.push(
          `  await db.schema.alterTable(${tsString(tableName)}).addUniqueConstraint(${tsString(afterUniqueConstraint.name)}, ${renderStringArray(afterUniqueConstraint.columns)}).execute()`
        )
      }
    }
  }

  // Step 11: Add new/changed indexes
  for (const { id, table: afterTable } of afterEntries) {
    const beforeTable = beforeById.get(id)
    const beforeIndexNames = new Set(beforeTable ? getIndexes(beforeTable).map(index => index.name) : [])

    for (const afterIndex of getIndexes(afterTable)) {
      const beforeIndex = beforeTable
        ? getIndexes(beforeTable).find(candidate => candidate.name === afterIndex.name)
        : undefined
      const isNew = !beforeIndexNames.has(afterIndex.name)
      const isChanged =
        beforeIndex !== undefined && JSON.stringify(beforeIndex.columns) !== JSON.stringify(afterIndex.columns)

      if (isNew || isChanged) {
        lines.push(`  await db.schema`)
        lines.push(`    .createIndex(${tsString(afterIndex.name)})`)
        lines.push(`    .on(${tsString(afterTable.name)})`)
        lines.push(`    .columns(${renderStringArray(afterIndex.columns)})`)
        lines.push('    .execute()')
        lines.push('')
      }
    }
  }

  // Remove trailing blank line
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }

  return lines
}

function renderDiffDown(before: DbProjectionSnapshot, after: DbProjectionSnapshot): string[] {
  // down is the reverse: generate the same diff with before/after swapped
  return renderDiffUp(after, before)
}

// ─── Types file rendering ─────────────────────────────────────────────────────

function renderTypesFile(snapshot: DbProjectionSnapshot): string {
  validateRelationalDbProjection(snapshot)

  const generatedAt = new Date().toISOString()
  const embeddedBlock = encodeSnapshot(snapshot, generatedAt)

  const lines: string[] = [embeddedBlock, '']

  lines.push('export interface Database {')

  for (const { table } of getSnapshotTableEntries(snapshot)) {
    lines.push(`  ${tsString(table.name)}: {`)

    for (const col of table.columns) {
      lines.push(`    ${tsString(col.name)}: ${sqlTypeToTs(col.type, col.nullable === true)}`)
    }

    lines.push('  }')
  }

  lines.push('}')

  return `${lines.join('\n')}\n`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSnapshotTableEntries(snapshot: DbProjectionSnapshot): SnapshotTableEntry[] {
  return getDependencySortedTableIds(snapshot.tables, Object.keys(snapshot.tables)).map(tableId => ({
    id: tableId,
    table: snapshot.tables[tableId]
  }))
}

function getDependencySortedTableIds(tables: DbProjectionSnapshot['tables'], tableIds: readonly string[]) {
  const nameToId = new Map<string, string>()

  for (const tableId of tableIds) {
    nameToId.set(tables[tableId].name, tableId)
  }

  const includedIds = new Set(tableIds)
  const visited = new Set<string>()
  const sorted: string[] = []

  const visit = (tableId: string) => {
    if (visited.has(tableId)) {
      return
    }

    visited.add(tableId)

    for (const fk of tables[tableId].keys.foreign) {
      const dependencyId = nameToId.get(fk.target.table)

      if (dependencyId !== undefined && includedIds.has(dependencyId)) {
        visit(dependencyId)
      }
    }

    sorted.push(tableId)
  }

  for (const tableId of tableIds) {
    visit(tableId)
  }

  return sorted
}

function getUniqueConstraints(table: SnapshotTable) {
  return table.constraints?.unique ?? []
}

function getCheckConstraints(table: SnapshotTable) {
  return table.constraints?.check ?? []
}

function getIndexes(table: SnapshotTable) {
  return table.indexes ?? []
}

function tsString(value: string) {
  return `'${value.replace(/\\/gu, '\\\\').replace(/'/gu, "\\'")}'`
}

function renderStringArray(values: readonly string[]) {
  return `[${values.map(tsString).join(', ')}]`
}

function sqlTypeToTs(sqlType: SnapshotTable['columns'][number]['type'], nullable: boolean): string {
  const upper = sqlType.toUpperCase()
  let tsType: string

  if (upper.startsWith('CHAR(') || upper.startsWith('VARCHAR(')) {
    tsType = 'string'
  } else if (upper === 'INTEGER' || upper === 'DOUBLE PRECISION') {
    tsType = 'number'
  } else if (upper === 'BIGINT') {
    tsType = 'string'
  } else if (upper === 'BOOLEAN') {
    tsType = 'boolean'
  } else if (/^DECIMAL\(\d+, \d+\)$/u.test(upper)) {
    tsType = 'string'
  } /* c8 ignore next 3 */ else {
    throw new Error(`Unsupported relational DB projection column type: ${sqlType}`)
  }

  return nullable ? `${tsType} | null` : tsType
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
