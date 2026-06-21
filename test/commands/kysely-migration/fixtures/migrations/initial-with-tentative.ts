// ---
// data-sketch/relational-db-projection/embedded: 1.0.0-draft.3
// generated_at: <GENERATED_AT>
// payload: |
//   H4sIAAAAAAAAA6WSTU/DMAyG/4tPIGVlDMShN4Qm4MJhQlymqgqtt4WmaZc4aNPU/47SdmnGxpe4
//   RLFl+7Ufewc5Jz4yBVK2utAoOYlKcTnKX0e1rt4wczbEcBmNo/Eo13xB0RUwIP4q0UC8g8waqkrU
//   7b+StlQG4vkORA6xexgoXuL+T9va/e8ebmdnk5tzaFgf2Qb52N7qo19uZ23C5XgcZNSrSgUp3rRS
//   uuYgJm3xRI3J9Tk0CYMCt+0Ai0qjWCqI5wmDWouS6+3hME4vGYSKdD+zgabx/sDJoNL5v5EY4mTN
//   EO3tTyNNQip+HUd9nZJKGGSVMqS5UNStc4VZ0XbbdR7qorKlw1GjyoVaAgOzEnWNboocpXhHjSGp
//   rEhbDibtSzg9q8TaYqDQEvYavtuhjF0flvH4oUkaBkLluEHzRcUkgL050c7xFQSTB+gKoRxe3NRS
//   ZIIGvAs/ZAia6yXSsH+/6+4yw1tpfn11nUx4cntPf2+RICzNPPnn3XW3eyjyXXyvGq0tVyRoO6QG
//   nj778el5ej+d/Yx+r9pzN6RtRlZzeUw+bRtIfZ8/sPcY/wa+Uzmi793NB/ZLvDhMBQAA
// ---

import type { Kysely } from 'kysely'

interface MigrationDatabase {
  'customers': {
    'id': string
    'name': string
    'phone': string | null
  }
  'orders': {
    'id': string
    'status': string
    'customer': string
  }
  'order_items': {
    'id': string
    'order': string
    'quantity': number
  }
}

export async function up(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema
    .createTable('customers')
    .addColumn('id', 'char(26)', column => column.notNull())
    .addColumn('name', 'varchar(100)', column => column.notNull())
    .addColumn('phone', 'varchar(1024)')
    .addPrimaryKeyConstraint('pk_customers', ['id'])
    .execute()

  await db.schema
    .createTable('orders')
    .addColumn('id', 'char(26)', column => column.notNull())
    .addColumn('status', 'varchar(20)', column => column.notNull())
    .addColumn('customer', 'char(26)', column => column.notNull())
    .addPrimaryKeyConstraint('pk_orders', ['id'])
    .addForeignKeyConstraint('fk_orders_customer', ['customer'], 'customers', ['id'])
    .addUniqueConstraint('uq_orders_status_customer', ['status', 'customer'])
    .execute()

  await db.schema
    .createTable('order_items')
    .addColumn('id', 'char(26)', column => column.notNull())
    .addColumn('order', 'char(26)', column => column.notNull())
    .addColumn('quantity', 'integer', column => column.notNull())
    .addPrimaryKeyConstraint('pk_order_items', ['id'])
    .addForeignKeyConstraint('fk_order_items_order', ['order'], 'orders', ['id'])
    .execute()

  await db.schema
    .createIndex('idx_orders_status')
    .on('orders')
    .columns(['status'])
    .execute()
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.dropIndex('idx_orders_status').execute()

  await db.schema.dropTable('order_items').execute()
  await db.schema.dropTable('orders').execute()
  await db.schema.dropTable('customers').execute()
}
