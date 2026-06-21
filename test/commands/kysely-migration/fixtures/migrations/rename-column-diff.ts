// ---
// data-sketch/relational-db-projection/embedded: 1.0.0-draft.3
// generated_at: <GENERATED_AT>
// payload: |
//   H4sIAAAAAAAAA21PsWrDMBT8l5sakF0nLR20hS6dM3QJJijyS+NaloT0PBijfy8yjutCl8e9x927
//   uwmNYlXEjljfnwMZxa2zyhTNtfDBfZPOOyT2ZVVWRRPUjcsXCLC6GoqQE/QQ2fUUZuzM0NsIeZ7Q
//   NpB5CFjV0wPz6DN+/zieng5vOySxMGfSyl22hf15PM2CfVVtFP7u7EainWWl+bKeB2NySEgOA/3z
//   6/C6Q6oFOhrnIjcXqP2ykOdawIe2V2H8Wyr71quh7y6P7hEp/QbZHNMPWf8PzmEBAAA=
// ---

import type { Kysely } from 'kysely'

interface MigrationDatabase {
  'customers': {
    'id': string
    'name': string
    'contact_phone': string | null
  }
}

export async function up(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.alterTable('customers').renameColumn('phone', 'contact_phone').execute()
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.alterTable('customers').renameColumn('contact_phone', 'phone').execute()
}
