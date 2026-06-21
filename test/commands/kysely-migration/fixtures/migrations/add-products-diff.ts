// ---
// data-sketch/relational-db-projection/embedded: 1.0.0-draft.3
// generated_at: <GENERATED_AT>
// payload: |
//   H4sIAAAAAAAAA7VSsW6DMBD9l5sayVCSVh3Yoi6dM3SJEHKwSV0DRvYhBSH/e2QXDKgMlaIu6O70
//   7t17zwzAKNLISI7F17PmFUWhGlpF7BK1Wn3zwvWQwj5O4iRimpYYvwABpJeKG0gHKDqDquba16rq
//   6sZAeh5AMEjdh0BDaz7V2Leufv84np4ObzuwZER6UMCO3Yj+PJ78wj45vO7AZgQk7/3xUmkurg2k
//   54xAq0VNdb8W4tizwNvKfNJrwNowXwwJKM0etmOQYmdmdOi3LU1rIcxfyraObQYxyV7vStE4fn5r
//   K1EInPlLmXu/Jl9eovrKcY4g2HWvvo7L/jn4nzPL1KeJY1CsK/DR0GW3SNw3//EHjWJXVhYzewdU
//   eaL4VQMAAA==
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
  'products': {
    'id': string
    'sku': string
  }
}

export async function up(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.alterTable('orders').dropConstraint('fk_orders_customer').execute()
  await db.schema
    .createTable('products')
    .addColumn('id', 'char(26)', column => column.notNull())
    .addColumn('sku', 'varchar(1024)', column => column.notNull())
    .addPrimaryKeyConstraint('pk_products', ['id'])
    .execute()

  await db.schema.alterTable('orders').addForeignKeyConstraint('fk_orders_customer', ['customer'], 'customers', ['id']).execute()
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.alterTable('orders').dropConstraint('fk_orders_customer').execute()
  await db.schema.dropTable('products').execute()
  await db.schema.alterTable('orders').addForeignKeyConstraint('fk_orders_customer', ['customer'], 'customers', ['id']).execute()
}
