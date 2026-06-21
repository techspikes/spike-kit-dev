import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { gunzipSync, gzipSync } from 'node:zlib'
import { load as yamlLoad } from 'js-yaml'
import { parse } from '../core/parser.ts'
import type { RelationalDbProjection } from '../core/projector.ts'
import { resolveCwdRelativePath } from '../core/utils.ts'
import { validate } from '../core/validator.ts'

// ─── Snapshot types ────────────────────────────────────────────────────────────

type DbProjectionSnapshot = {
  'data-sketch/db-projection-snapshot': '1.0.0-draft.0'
  tables: SnapshotTable[]
}

type SnapshotTable = {
  id: string
  name: string
  columns: SnapshotColumn[]
  primaryKey: SnapshotNamedColumns
  uniqueConstraints: SnapshotNamedColumns[]
  foreignKeys: SnapshotForeignKey[]
  indexes: SnapshotIndex[]
  checkConstraints: SnapshotCheckConstraint[]
}

type SnapshotColumn = { id: string; name: string; type: string; nullable: boolean }
type SnapshotNamedColumns = { name: string; columns: string[] }
type SnapshotForeignKey = {
  name: string
  column: string
  target: { table: string; column: string }
}
type SnapshotIndex = { name: string; columns: string[] }
type SnapshotCheckConstraint = { name: string; column: string; enum: string[] }

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
    '      --include-tentative            Include tables from tentative claims',
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
        'include-tentative': { type: 'boolean' },
        'dry-run': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' }
      }
    })

    if (options.values.help) {
      console.log(usage())

      return 0
    }

    const specFile = options.positionals[0]
    const outputFile = options.values.output
    const previousMigration = options.values['previous-migration']
    const typesOutput = options.values['types-output']
    const includeTentative = options.values['include-tentative'] ?? false
    const dryRun = options.values['dry-run'] ?? false

    if (!specFile || !outputFile) {
      process.stderr.write(`${usage()}\n`)

      return 1
    }

    if (typesOutput !== undefined && !typesOutput.endsWith('.d.ts')) {
      process.stderr.write(`Error: --types-output path must end in .d.ts\n\n${usage()}\n`)

      return 1
    }

    // Parse
    const sketch = parse({ path: specFile })

    console.log('Data Sketch read')

    // Validate
    console.log('Validating Data Sketch')
    const validated = validate({ sketch, trace: true })

    // Build projection
    console.log('Building Relational DB Projection')
    const projection = validated.projections.relationalDb()

    // Determine included table IDs (filter tentative unless --include-tentative)
    const allTableIds = Object.keys(projection.tables)
    const includedTableIds: string[] = []

    for (const tableId of allTableIds) {
      const claimId = tableId.split('.')[0]
      const claim = validated.spec.claims[claimId]

      if (claim?.tentative === true && !includeTentative) {
        process.stderr.write(`Warning: Tentative claim excluded from migration: ${projection.tables[tableId].name}\n`)
      } else {
        includedTableIds.push(tableId)
      }
    }

    // Build snapshot
    const afterSnapshot = buildSnapshot(projection, includedTableIds)

    // Read previous migration if provided
    let beforeSnapshot: DbProjectionSnapshot | undefined

    if (previousMigration) {
      const prevContent = readFileSync(resolveCwdRelativePath(previousMigration), 'utf-8')

      console.log('Previous migration read')
      beforeSnapshot = parseEmbeddedSnapshot(prevContent)
      console.log('Previous DB projection snapshot parsed')
    }

    // Collect check constraint warnings
    const checkWarnings: string[] = []

    if (beforeSnapshot) {
      // Diff mode: warn about added/removed check constraints
      const beforeCheckMap = new Map<string, SnapshotCheckConstraint[]>()

      for (const table of beforeSnapshot.tables) {
        beforeCheckMap.set(table.id, table.checkConstraints)
      }

      for (const table of afterSnapshot.tables) {
        const beforeChecks = beforeCheckMap.get(table.id) ?? []
        const beforeCheckNames = new Set(beforeChecks.map(c => c.name))
        const afterCheckNames = new Set(table.checkConstraints.map(c => c.name))

        for (const ck of table.checkConstraints) {
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
      for (const table of afterSnapshot.tables) {
        for (const ck of table.checkConstraints) {
          checkWarnings.push(`Warning: Check constraint ignored by migration renderer: ${table.name}.${ck.name}`)
        }
      }
    }

    // Render
    let migrationContent: string
    let typesContent: string | undefined

    if (beforeSnapshot) {
      console.log('Rendering diff migration')
      migrationContent = renderDiffMigrationFile(beforeSnapshot, afterSnapshot, checkWarnings)
    } else {
      console.log('Rendering migration')
      migrationContent = renderInitialMigrationFile(afterSnapshot, checkWarnings)
    }

    if (typesOutput) {
      typesContent = renderTypesFile(afterSnapshot)
    }

    // Emit warnings to stderr before writing
    for (const warning of checkWarnings) {
      process.stderr.write(`${warning}\n`)
    }

    if (dryRun) {
      console.log('Dry run completed')

      return 0
    }

    // Write files
    writeFileSync(resolveCwdRelativePath(outputFile), migrationContent)
    console.log('Migration written')

    if (typesOutput && typesContent) {
      writeFileSync(resolveCwdRelativePath(typesOutput), typesContent)
      console.log('Type definitions written')
    }

    console.log('Migration generated')

    return 0
  } catch (error) {
    console.error((error as Error).message)

    return 1
  }
}

// ─── Snapshot building ────────────────────────────────────────────────────────

export function buildSnapshot(projection: RelationalDbProjection, includedTableIds: string[]): DbProjectionSnapshot {
  const tables = projection.tables

  // Build name→id map for topological sort
  const nameToId = new Map<string, string>()

  for (const tableId of includedTableIds) {
    nameToId.set(tables[tableId].name, tableId)
  }

  // Topological sort: FK targets before tables that reference them
  const visited = new Set<string>()
  const sorted: string[] = []

  function visit(tableId: string) {
    if (visited.has(tableId)) return

    visited.add(tableId)

    const table = tables[tableId]

    for (const fk of table.keys.foreign) {
      const depId = nameToId.get(fk.target.table)

      if (depId !== undefined && includedTableIds.includes(depId)) {
        visit(depId)
      }
    }

    sorted.push(tableId)
  }

  for (const tableId of includedTableIds) {
    visit(tableId)
  }

  const snapshotTables: SnapshotTable[] = sorted.map(tableId => {
    const table = tables[tableId]

    return {
      id: tableId,
      name: table.name,
      columns: table.columns.map(col => ({
        id: col.id,
        name: col.name,
        type: col.type as string,
        nullable: col.nullable === true
      })),
      primaryKey: {
        name: table.keys.primary.name,
        columns: [...table.keys.primary.columns]
      },
      uniqueConstraints: (table.constraints?.unique ?? []).map(uq => ({
        name: uq.name,
        columns: [...uq.columns]
      })),
      foreignKeys: table.keys.foreign.map(fk => ({
        name: fk.name,
        column: fk.column,
        target: {
          table: fk.target.table,
          column: fk.target.column
        }
      })),
      indexes: (table.indexes ?? []).map(ix => ({
        name: ix.name,
        columns: [...ix.columns]
      })),
      checkConstraints: (table.constraints?.check ?? []).map(ck => ({
        name: ck.name,
        column: ck.column,
        enum: [...ck.enum]
      }))
    }
  })

  return {
    'data-sketch/db-projection-snapshot': '1.0.0-draft.0',
    tables: snapshotTables
  }
}

// ─── Snapshot encoding/decoding ───────────────────────────────────────────────

export function encodeSnapshot(snapshot: DbProjectionSnapshot, generatedAt: string): string {
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
    '// data-sketch/embedded-db-projection-snapshot: 1.0.0-draft.0',
    `// generated_at: ${generatedAt}`,
    '// payload: |',
    payloadLines,
    '// ---'
  ].join('\n')
}

export function parseEmbeddedSnapshot(fileContent: string): DbProjectionSnapshot {
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
            (parsed as Record<string, unknown>)['data-sketch/embedded-db-projection-snapshot'] === '1.0.0-draft.0' &&
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
              (snapshot as Record<string, unknown>)['data-sketch/db-projection-snapshot'] === '1.0.0-draft.0'
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

  throw new Error('No embedded DB projection snapshot found in previous migration file')
}

// ─── Rendering ────────────────────────────────────────────────────────────────

export function renderInitialMigrationFile(snapshot: DbProjectionSnapshot, _warnings: string[]): string {
  const generatedAt = new Date().toISOString()
  const embeddedBlock = encodeSnapshot(snapshot, generatedAt)

  const lines: string[] = [embeddedBlock, '']

  lines.push("import type { Kysely } from 'kysely'", '')

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

  for (const table of snapshot.tables) {
    lines.push(`  '${table.name}': {`)

    for (const col of table.columns) {
      lines.push(`    '${col.name}': ${sqlTypeToTs(col.type, col.nullable)}`)
    }

    lines.push('  }')
  }

  lines.push('}')

  return lines
}

function renderUpBody(snapshot: DbProjectionSnapshot): string[] {
  const lines: string[] = []

  for (const table of snapshot.tables) {
    lines.push(`  await db.schema`)
    lines.push(`    .createTable('${table.name}')`)

    for (const col of table.columns) {
      const typeStr = (col.type as string).toLowerCase()

      if (col.nullable) {
        lines.push(`    .addColumn('${col.name}', '${typeStr}')`)
      } else {
        lines.push(`    .addColumn('${col.name}', '${typeStr}', column => column.notNull())`)
      }
    }

    lines.push(
      `    .addPrimaryKeyConstraint('${table.primaryKey.name}', [${table.primaryKey.columns.map(c => `'${c}'`).join(', ')}])`
    )

    for (const fk of table.foreignKeys) {
      lines.push(
        `    .addForeignKeyConstraint('${fk.name}', ['${fk.column}'], '${fk.target.table}', ['${fk.target.column}'])`
      )
    }

    for (const uq of table.uniqueConstraints) {
      lines.push(`    .addUniqueConstraint('${uq.name}', [${uq.columns.map(c => `'${c}'`).join(', ')}])`)
    }

    lines.push('    .execute()')
    lines.push('')
  }

  // Indexes after all createTable calls
  for (const table of snapshot.tables) {
    for (const ix of table.indexes) {
      lines.push(`  await db.schema`)
      lines.push(`    .createIndex('${ix.name}')`)
      lines.push(`    .on('${table.name}')`)
      lines.push(`    .columns([${ix.columns.map(c => `'${c}'`).join(', ')}])`)
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

  for (const table of snapshot.tables) {
    for (const ix of table.indexes) {
      allIndexes.push({ tableName: table.name, indexName: ix.name })
    }
  }

  for (const { indexName } of allIndexes) {
    lines.push(`  await db.schema.dropIndex('${indexName}').execute()`)
  }

  if (allIndexes.length > 0) {
    lines.push('')
  }

  // Drop tables in reverse order
  const reversedTables = [...snapshot.tables].reverse()

  for (const table of reversedTables) {
    lines.push(`  await db.schema.dropTable('${table.name}').execute()`)
  }

  return lines
}

// ─── Diff migration rendering ─────────────────────────────────────────────────

export function renderDiffMigrationFile(
  before: DbProjectionSnapshot,
  after: DbProjectionSnapshot,
  _warnings: string[]
): string {
  const generatedAt = new Date().toISOString()
  const embeddedBlock = encodeSnapshot(after, generatedAt)

  const lines: string[] = [embeddedBlock, '']

  lines.push("import type { Kysely } from 'kysely'", '')

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
  const beforeById = new Map(before.tables.map(t => [t.id, t]))
  const afterById = new Map(after.tables.map(t => [t.id, t]))

  // Common tables
  const commonIds = [...afterById.keys()].filter(id => beforeById.has(id))

  // Step 1: Drop removed/changed non-unique indexes
  for (const bTable of before.tables) {
    const aTable = afterById.get(bTable.id)
    const afterIndexNames = new Set(aTable?.indexes.map(ix => ix.name) ?? [])

    for (const ix of bTable.indexes) {
      if (!afterIndexNames.has(ix.name)) {
        lines.push(`  await db.schema.dropIndex('${ix.name}').execute()`)
      } else {
        // Check if changed
        const aIx = aTable?.indexes.find(x => x.name === ix.name)

        if (aIx && JSON.stringify(aIx.columns) !== JSON.stringify(ix.columns)) {
          lines.push(`  await db.schema.dropIndex('${ix.name}').execute()`)
        }
      }
    }
  }

  // Step 2: Drop removed/changed FK, UQ, PK
  for (const bTable of before.tables) {
    const aTable = afterById.get(bTable.id)
    // Use before table name for alterTable (renames happen in step 3)
    const tableName = bTable.name

    // FKs
    const afterFkNames = new Set(aTable?.foreignKeys.map(fk => fk.name) ?? [])

    for (const fk of bTable.foreignKeys) {
      if (!afterFkNames.has(fk.name)) {
        lines.push(`  await db.schema.alterTable('${tableName}').dropConstraint('${fk.name}').execute()`)
      } else {
        const aFk = aTable?.foreignKeys.find(f => f.name === fk.name)

        if (aFk && (aFk.column !== fk.column || JSON.stringify(aFk.target) !== JSON.stringify(fk.target))) {
          lines.push(`  await db.schema.alterTable('${tableName}').dropConstraint('${fk.name}').execute()`)
        }
      }
    }

    // UQ
    const afterUqNames = new Set(aTable?.uniqueConstraints.map(uq => uq.name) ?? [])

    for (const uq of bTable.uniqueConstraints) {
      if (!afterUqNames.has(uq.name)) {
        lines.push(`  await db.schema.alterTable('${tableName}').dropConstraint('${uq.name}').execute()`)
      } else {
        const aUq = aTable?.uniqueConstraints.find(u => u.name === uq.name)

        if (aUq && JSON.stringify(aUq.columns) !== JSON.stringify(uq.columns)) {
          lines.push(`  await db.schema.alterTable('${tableName}').dropConstraint('${uq.name}').execute()`)
        }
      }
    }

    // PK - check if PK changed (name or columns)
    if (aTable) {
      const bPk = bTable.primaryKey
      const aPk = aTable.primaryKey

      if (bPk.name !== aPk.name || JSON.stringify(bPk.columns) !== JSON.stringify(aPk.columns)) {
        lines.push(`  await db.schema.alterTable('${tableName}').dropConstraint('${bPk.name}').execute()`)
      }
    }
  }

  // Step 3: Rename tables (same id, different name)
  for (const id of commonIds) {
    const bTable = beforeById.get(id)!
    const aTable = afterById.get(id)!

    if (bTable.name !== aTable.name) {
      lines.push(`  await db.schema.renameTable('${bTable.name}', '${aTable.name}').execute()`)
    }
  }

  // Step 4: Rename columns
  for (const id of commonIds) {
    const bTable = beforeById.get(id)!
    const aTable = afterById.get(id)!
    const tableName = aTable.name // use after name since table rename already happened
    const bColById = new Map(bTable.columns.map(c => [c.id, c]))
    const aColById = new Map(aTable.columns.map(c => [c.id, c]))

    for (const [colId, bCol] of bColById) {
      const aCol = aColById.get(colId)

      if (aCol && bCol.name !== aCol.name) {
        lines.push(
          `  await db.schema.alterTable('${tableName}').renameColumn('${bCol.name}', '${aCol.name}').execute()`
        )
      }
    }
  }

  // Step 5: Drop removed columns
  for (const id of commonIds) {
    const bTable = beforeById.get(id)!
    const aTable = afterById.get(id)!
    const tableName = aTable.name // use after name
    const aColIds = new Set(aTable.columns.map(c => c.id))

    for (const bCol of bTable.columns) {
      if (!aColIds.has(bCol.id)) {
        lines.push(`  await db.schema.alterTable('${tableName}').dropColumn('${bCol.name}').execute()`)
      }
    }
  }

  // Step 6: Drop removed tables (reverse topo order of before snapshot)
  const reversedBefore = [...before.tables].reverse()

  for (const bTable of reversedBefore) {
    if (!afterById.has(bTable.id)) {
      lines.push(`  await db.schema.dropTable('${bTable.name}').execute()`)
    }
  }

  // Step 7: Alter changed column type/nullable
  for (const id of commonIds) {
    const bTable = beforeById.get(id)!
    const aTable = afterById.get(id)!
    const tableName = aTable.name
    const bColById = new Map(bTable.columns.map(c => [c.id, c]))

    for (const aCol of aTable.columns) {
      const bCol = bColById.get(aCol.id)

      if (!bCol) continue

      const colName = aCol.name
      const typeChanged = (bCol.type as string).toLowerCase() !== (aCol.type as string).toLowerCase()
      const nullableChanged = bCol.nullable !== aCol.nullable

      if (typeChanged || nullableChanged) {
        const newType = (aCol.type as string).toLowerCase()

        if (!aCol.nullable) {
          lines.push(`  await db.schema`)
          lines.push(`    .alterTable('${tableName}')`)
          lines.push(`    .alterColumn('${colName}', col => col.setDataType('${newType}').setNotNull())`)
          lines.push('    .execute()')
          /* c8 ignore next 6 */
        } else {
          lines.push(`  await db.schema`)
          lines.push(`    .alterTable('${tableName}')`)
          lines.push(`    .alterColumn('${colName}', col => col.setDataType('${newType}'))`)
          lines.push('    .execute()')
        }
      }
    }
  }

  // Step 8: Add new tables (in after topo order)
  const beforeIds = new Set(before.tables.map(t => t.id))

  for (const table of after.tables) {
    if (!beforeIds.has(table.id)) {
      lines.push(`  await db.schema`)
      lines.push(`    .createTable('${table.name}')`)

      for (const col of table.columns) {
        const typeStr = (col.type as string).toLowerCase()

        /* c8 ignore next 2 */
        if (col.nullable) {
          lines.push(`    .addColumn('${col.name}', '${typeStr}')`)
        } else {
          lines.push(`    .addColumn('${col.name}', '${typeStr}', column => column.notNull())`)
        }
      }

      lines.push(
        `    .addPrimaryKeyConstraint('${table.primaryKey.name}', [${table.primaryKey.columns.map(c => `'${c}'`).join(', ')}])`
      )

      for (const fk of table.foreignKeys) {
        lines.push(
          `    .addForeignKeyConstraint('${fk.name}', ['${fk.column}'], '${fk.target.table}', ['${fk.target.column}'])`
        )
      }

      for (const uq of table.uniqueConstraints) {
        lines.push(`    .addUniqueConstraint('${uq.name}', [${uq.columns.map(c => `'${c}'`).join(', ')}])`)
      }

      lines.push('    .execute()')
      lines.push('')
    }
  }

  // Step 9: Add new columns to existing tables
  for (const id of commonIds) {
    const bTable = beforeById.get(id)!
    const aTable = afterById.get(id)!
    const tableName = aTable.name
    const bColIds = new Set(bTable.columns.map(c => c.id))

    for (const aCol of aTable.columns) {
      if (!bColIds.has(aCol.id)) {
        const typeStr = (aCol.type as string).toLowerCase()

        if (aCol.nullable) {
          lines.push(`  await db.schema.alterTable('${tableName}').addColumn('${aCol.name}', '${typeStr}').execute()`)
        } else {
          lines.push(
            `  await db.schema.alterTable('${tableName}').addColumn('${aCol.name}', '${typeStr}', col => col.notNull()).execute()`
          )
        }
      }
    }
  }

  // Step 10: Add new/changed PK, FK, UQ
  for (const id of commonIds) {
    const bTable = beforeById.get(id)!
    const aTable = afterById.get(id)!
    const tableName = aTable.name

    // PK - add if changed
    const bPk = bTable.primaryKey
    const aPk = aTable.primaryKey

    /* c8 ignore next 5 */
    if (bPk.name !== aPk.name || JSON.stringify(bPk.columns) !== JSON.stringify(aPk.columns)) {
      lines.push(
        `  await db.schema.alterTable('${tableName}').addPrimaryKeyConstraint('${aPk.name}', [${aPk.columns.map(c => `'${c}'`).join(', ')}]).execute()`
      )
    }

    // FKs - add new or changed
    const bFkNames = new Set(bTable.foreignKeys.map(fk => fk.name))

    for (const aFk of aTable.foreignKeys) {
      const bFk = bTable.foreignKeys.find(f => f.name === aFk.name)
      const isNew = !bFkNames.has(aFk.name)
      const isChanged =
        bFk !== undefined && (bFk.column !== aFk.column || JSON.stringify(bFk.target) !== JSON.stringify(aFk.target))

      if (isNew || isChanged) {
        lines.push(
          `  await db.schema.alterTable('${tableName}').addForeignKeyConstraint('${aFk.name}', ['${aFk.column}'], '${aFk.target.table}', ['${aFk.target.column}']).execute()`
        )
      }
    }

    // UQs - add new or changed
    const bUqNames = new Set(bTable.uniqueConstraints.map(uq => uq.name))

    for (const aUq of aTable.uniqueConstraints) {
      const bUq = bTable.uniqueConstraints.find(u => u.name === aUq.name)
      const isNew = !bUqNames.has(aUq.name)
      const isChanged = bUq !== undefined && JSON.stringify(bUq.columns) !== JSON.stringify(aUq.columns)

      if (isNew || isChanged) {
        lines.push(
          `  await db.schema.alterTable('${tableName}').addUniqueConstraint('${aUq.name}', [${aUq.columns.map(c => `'${c}'`).join(', ')}]).execute()`
        )
      }
    }
  }

  // Step 11: Add new/changed indexes
  for (const aTable of after.tables) {
    const bTable = beforeById.get(aTable.id)
    const bIxNames = new Set(bTable?.indexes.map(ix => ix.name) ?? [])

    for (const aIx of aTable.indexes) {
      const bIx = bTable?.indexes.find(x => x.name === aIx.name)
      const isNew = !bIxNames.has(aIx.name)
      const isChanged = bIx !== undefined && JSON.stringify(bIx.columns) !== JSON.stringify(aIx.columns)

      if (isNew || isChanged) {
        lines.push(`  await db.schema`)
        lines.push(`    .createIndex('${aIx.name}')`)
        lines.push(`    .on('${aTable.name}')`)
        lines.push(`    .columns([${aIx.columns.map(c => `'${c}'`).join(', ')}])`)
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

export function renderTypesFile(snapshot: DbProjectionSnapshot): string {
  const generatedAt = new Date().toISOString()
  const embeddedBlock = encodeSnapshot(snapshot, generatedAt)

  const lines: string[] = [embeddedBlock, '']

  lines.push('export interface Database {')

  for (const table of snapshot.tables) {
    lines.push(`  '${table.name}': {`)

    for (const col of table.columns) {
      lines.push(`    '${col.name}': ${sqlTypeToTs(col.type, col.nullable)}`)
    }

    lines.push('  }')
  }

  lines.push('}')

  return `${lines.join('\n')}\n`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sqlTypeToTs(sqlType: string, nullable: boolean): string {
  const upper = sqlType.toUpperCase()
  let tsType: string

  if (
    upper.startsWith('CHAR(') ||
    upper.startsWith('VARCHAR(') ||
    upper === 'TEXT' ||
    upper === 'DATE' ||
    upper === 'TIME' ||
    upper === 'TIMESTAMP'
  ) {
    tsType = 'string'
  } else if (
    upper === 'INTEGER' ||
    upper === 'BIGINT' ||
    upper === 'SMALLINT' ||
    upper.startsWith('DECIMAL(') ||
    /* c8 ignore next */
    upper.startsWith('NUMERIC(')
  ) {
    tsType = 'number'
  } else if (upper === 'BOOLEAN') {
    tsType = 'boolean'
  } /* c8 ignore next 3 */ else {
    // Defensive fallback for SQL types not generated by the projector
    tsType = 'string'
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
