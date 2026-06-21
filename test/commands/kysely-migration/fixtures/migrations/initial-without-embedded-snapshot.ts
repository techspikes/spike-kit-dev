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
  await db.schema
    .createTable('customers')
    .addColumn('id', 'char(26)', column => column.notNull())
    .addColumn('name', 'varchar(1024)', column => column.notNull())
    .addPrimaryKeyConstraint('pk_customers', ['id'])
    .execute()

  await db.schema
    .createTable('orders')
    .addColumn('id', 'char(26)', column => column.notNull())
    .addColumn('status', 'varchar(1024)', column => column.notNull())
    .addColumn('customer', 'char(26)', column => column.notNull())
    .addPrimaryKeyConstraint('pk_orders', ['id'])
    .addForeignKeyConstraint('fk_orders_customer', ['customer'], 'customers', ['id'])
    .execute()
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.dropTable('orders').execute()
  await db.schema.dropTable('customers').execute()
}
