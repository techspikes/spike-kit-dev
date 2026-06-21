// ---
// data-sketch/relational-db-projection/embedded: 1.0.0-draft.3
// generated_at: <GENERATED_AT>
// payload: |
//   H4sIAAAAAAAAA42QP0/DMBDFv8stUMkJKUgM3ioW5g4sbRRd4yuYOLbrP1KjyN8dxUpTwsRiPd+9
//   +93TjSAwYOE7Cu3XkyOFQRqNqhCnwjrzTe30Bw7bsiqrQjg8h/IFGAQ8KfLAR2ijD6Ynl7VRsdce
//   +GEEKYBPDwONPd10GOyk3953+8fn1w0kNjuzafEK6a3C4Xicy/PYx26fJ7dVtYFUM2iN9sGh1CFn
//   iVpeIuX19yh/YPWyJF6aW/hm7Ul1YiC1oCv5/9KkuC64B9/MHAYdDTnb2TiSnxr4oWZgnezRDeub
//   TYe482z3CwcpLY1VNf0AGiBQ3cIBAAA=
// ---

import type { Kysely } from 'kysely'

interface MigrationDatabase {
  'customer\'s': {
    'id': string
    'display\\name': string
  }
}

export async function up(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema
    .createTable('customer\'s')
    .addColumn('id', 'char(26)', column => column.notNull())
    .addColumn('display\\name', 'varchar(100)', column => column.notNull())
    .addPrimaryKeyConstraint('pk_customer\'s', ['id'])
    .addUniqueConstraint('uq_customer_display\\name', ['display\\name'])
    .execute()

  await db.schema
    .createIndex('idx_customer\'s_name')
    .on('customer\'s')
    .columns(['display\\name'])
    .execute()
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.dropIndex('idx_customer\'s_name').execute()

  await db.schema.dropTable('customer\'s').execute()
}
