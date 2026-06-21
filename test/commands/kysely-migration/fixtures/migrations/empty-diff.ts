// ---
// data-sketch/relational-db-projection/embedded: 1.0.0-draft.3
// generated_at: <GENERATED_AT>
// payload: |
//   H4sIAAAAAAAAA6VRTWuEMBD9L3PqQrTutvTgbeml5z30sohkTdymahKSESqS/16SalTqodBLmBne
//   zPvICIwiTWzDsfp4NLylKJSkbcJuiTbqk1e+hxyOaZZmCTO0xvQJCCC9tdxCPkLVW1QdN6FWbd9J
//   C/l1BMEg9w8BSTs+1zhoX7++nS8Pp5cDODIhAyhip25Cv58vYeGYnZ4P4AoCDR8Cea0MF3cJ+bUg
//   oI3oqBm2Qvz1It7VTTnrteBcnK+GBJRh/7ZjkWJvF3Ts9y3NazHMX8r2yHaDmGVvdxsh/X3+pVtR
//   CVzu100Z/NpyzUTNneMSQbTrf30bl/tz8D8069TjxH0DfH7Ww4gCAAA=
// ---

import type { Kysely } from 'kysely'

interface MigrationDatabase {
  'customers': {
    'id': string
    'name': string
  }
  'orders': {
    'id': string
    'status': string
    'customer': string
  }
}

export async function up(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.alterTable('orders').dropConstraint('fk_orders_customer').execute()
  await db.schema.alterTable('orders').addForeignKeyConstraint('fk_orders_customer', ['customer'], 'customers', ['id']).execute()
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.alterTable('orders').dropConstraint('fk_orders_customer').execute()
  await db.schema.alterTable('orders').addForeignKeyConstraint('fk_orders_customer', ['customer'], 'customers', ['id']).execute()
}
