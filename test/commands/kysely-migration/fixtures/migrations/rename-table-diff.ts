// ---
// data-sketch/relational-db-projection/embedded: 1.0.0-draft.3
// generated_at: <GENERATED_AT>
// payload: |
//   H4sIAAAAAAAAA6VRsW6DMBD9l5sayVCSVh3Yoi6dM3SJEHLgSFyMbdmHVIT875URGKJmqNTFunt6
//   997d8wg1J564Fqm6PVuUnIRWXCb1JTFWf2EVeshhn2ZpltSWN5S+AAPiF4kO8hGq3pHu0E61ln2n
//   HOTnEUQNeXgYKN7hUtNgQv3+cTw9Hd524NnMnEiRO3cz+/N4mgb22eF1B75g0OIwmTfaorgqyM8F
//   A2NFx+1wv0hQL6KuactKClTkwPuIRoiBtvW/T3HEqXcrO/aPz1nGYpDrXivyy+xhCMva97OtUEEf
//   v40UlaBVv2lL09vqxh26cmvG7RVpTSFeHD59m5f/c+rRZ5v7FvQ/IPLZD4sCAAA=
// ---

import type { Kysely } from 'kysely'

interface MigrationDatabase {
  'clients': {
    'id': string
    'name': string
  }
  'purchases': {
    'id': string
    'status': string
    'customer': string
  }
}

export async function up(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.alterTable('orders').dropConstraint('fk_orders_customer').execute()
  await db.schema.alterTable('customers').dropConstraint('pk_customers').execute()
  await db.schema.alterTable('orders').dropConstraint('pk_orders').execute()
  await db.schema.alterTable('customers').renameTo('clients').execute()
  await db.schema.alterTable('orders').renameTo('purchases').execute()
  await db.schema.alterTable('clients').addPrimaryKeyConstraint('pk_clients', ['id']).execute()
  await db.schema.alterTable('purchases').addPrimaryKeyConstraint('pk_purchases', ['id']).execute()
  await db.schema.alterTable('purchases').addForeignKeyConstraint('fk_purchases_customer', ['customer'], 'clients', ['id']).execute()
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.alterTable('purchases').dropConstraint('fk_purchases_customer').execute()
  await db.schema.alterTable('clients').dropConstraint('pk_clients').execute()
  await db.schema.alterTable('purchases').dropConstraint('pk_purchases').execute()
  await db.schema.alterTable('clients').renameTo('customers').execute()
  await db.schema.alterTable('purchases').renameTo('orders').execute()
  await db.schema.alterTable('customers').addPrimaryKeyConstraint('pk_customers', ['id']).execute()
  await db.schema.alterTable('orders').addPrimaryKeyConstraint('pk_orders', ['id']).execute()
  await db.schema.alterTable('orders').addForeignKeyConstraint('fk_orders_customer', ['customer'], 'customers', ['id']).execute()
}
