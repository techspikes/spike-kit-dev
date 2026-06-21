// ---
// data-sketch/relational-db-projection/embedded: 1.0.0-draft.3
// generated_at: <GENERATED_AT>
// payload: |
//   H4sIAAAAAAAAA1WOwWrDMBBEf6XMqQHZTVroQbc0DSRQmpKSkzFhY8muYlsSsnIwRv9eFFybXpY3
//   w+zuDBDkKelq6YufJycb8spoahJxSawzV1lEDY5VukyXiXBU+vQFDJ4ujezAB1hnxK3wEQvT3Frd
//   gWcDlACPg0FTK//Y9zbyZrc+Pj6/LhDYmHTkla7m9KTHjffD6e1j+/B13G723/vDJ0LOUMv+XqE0
//   TqpKg2c5g3WqJdf/7xOf5NNxW5/H1h1CmO3ZC7+bYRDVGQEAAA==
// ---

import type { Kysely } from 'kysely'

interface MigrationDatabase {
  'products': {
    'id': string
    'rating': number
  }
}

export async function up(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema
    .createTable('products')
    .addColumn('id', 'char(26)', column => column.notNull())
    .addColumn('rating', 'double precision', column => column.notNull())
    .addPrimaryKeyConstraint('pk_products', ['id'])
    .execute()
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.dropTable('products').execute()
}
