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
