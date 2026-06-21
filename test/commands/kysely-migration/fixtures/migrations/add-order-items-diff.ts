// ---
// data-sketch/relational-db-projection/embedded: 1.0.0-draft.3
// generated_at: <GENERATED_AT>
// payload: |
//   H4sIAAAAAAAAA6WSPW/CMBCG/8tNrZRQoFWHbKhLuzJ0QVFkEkPdxHawz1IR8n+v7CROIlIoYkG+
//   y32897ycoCBIYl1SzL+eFK0IMilIFRfbuFbym+YuhgQWs/lsHheK7HD2DBEg2VZUQ3KC3GiUnCr/
//   lpXhQkOyOQErIHE/EQjCaffGY+3eb++r9cPy9RFs1Fb6olDbRm3152rtGxbz5cughXLCqr6nC6eb
//   0ghKevSKd1JRtheQbNIIasU4Ucexejc/DYPrMuuO1GBtyA+SEUhV3M1AI0Gj++oQX+YQHDhTNrVs
//   EkQne9xbMuE5/9QVyxn283dl5u/V2XATUXuKPYJwrvurjHHZf4Nv1gypd5kW+QdSfi/20gyY++Ay
//   8MbrsaI/UOdSaFSECfTEjWAHQwfA/dFuZ3+1OTRXZwwp15n7aFN7xbVOw1XL2qlB8xXTAv/bHGu2
//   nNkW0vYXeKW99HkEAAA=
// ---

import type { Kysely } from 'kysely'

interface MigrationDatabase {
  'customers': {
    'id': string
    'name': string
    'email': string
  }
  'orders': {
    'id': string
    'status': string
    'customer': string
  }
  'order_items': {
    'id': string
    'sku': string
    'order': string
  }
}

export async function up(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.alterTable('orders').dropConstraint('fk_orders_customer').execute()
  await db.schema
    .createTable('order_items')
    .addColumn('id', 'char(26)', column => column.notNull())
    .addColumn('sku', 'varchar(1024)', column => column.notNull())
    .addColumn('order', 'char(26)', column => column.notNull())
    .addPrimaryKeyConstraint('pk_order_items', ['id'])
    .addForeignKeyConstraint('fk_order_items_order', ['order'], 'orders', ['id'])
    .addUniqueConstraint('uq_order_items_sku', ['sku'])
    .execute()

  await db.schema.alterTable('customers').addColumn('email', 'varchar(1024)', col => col.notNull()).execute()
  await db.schema.alterTable('orders').addForeignKeyConstraint('fk_orders_customer', ['customer'], 'customers', ['id']).execute()
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.alterTable('orders').dropConstraint('fk_orders_customer').execute()
  await db.schema.alterTable('order_items').dropConstraint('fk_order_items_order').execute()
  await db.schema.alterTable('order_items').dropConstraint('uq_order_items_sku').execute()
  await db.schema.alterTable('customers').dropColumn('email').execute()
  await db.schema.dropTable('order_items').execute()
  await db.schema.alterTable('orders').addForeignKeyConstraint('fk_orders_customer', ['customer'], 'customers', ['id']).execute()
}
