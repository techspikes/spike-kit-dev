// ---
// data-sketch/relational-db-projection/embedded: 1.0.0-draft.3
// generated_at: <GENERATED_AT>
// payload: |
//   H4sIAAAAAAAAA21Qu2rEMBD8l60SkB3nQQp1R5qkSXFFmsMY2dq7UyzJYrUKGON/DzKx7w7SiNHM
//   7gyzE2jFqog9cnd+ILSKzeCVLXRbBBq+sct/kPBYVmVVaFJHLp9BAKvWYgQ5QTyb4NBzxt1gk/MR
//   5GECo0HmR4BXDlfMY8j47X23v3t6vYdZ/E0yqa43/vSZXIt02Vr5xm9Csjang2RKuFl+7faL60t1
//   5arRmh+k8cNHprSUiRfvVW3MrfyfYy2gx3FpfBwIzcmDPNQCAhmnaLxtn8PrLSb0zXqkCPO88dfk
//   /AsdGAQ/igEAAA==
// ---

import type { Kysely } from 'kysely'

interface MigrationDatabase {
  'shipments': {
    'id': string
    'tracking_number': string | null
    'delivery_instructions': string
  }
}

export async function up(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema
    .createTable('shipments')
    .addColumn('id', 'char(26)', column => column.notNull())
    .addColumn('tracking_number', 'varchar(40)')
    .addColumn('delivery_instructions', 'varchar(40)', column => column.notNull())
    .addPrimaryKeyConstraint('pk_shipments', ['id'])
    .execute()
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.dropTable('shipments').execute()
}
