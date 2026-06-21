// ---
// data-sketch/relational-db-projection/embedded: 1.0.0-draft.3
// generated_at: <GENERATED_AT>
// payload: |
//   H4sIAAAAAAAAA21PPQ+CMBT8LzdpUhA/4tDNuDgzuBhiKjwVKS1py0BI/7spQcTE5eXu5e7dux6F
//   cCKyFbn8uTIkhSu1EjIqblFj9IvywMGxjpM4iQoj7i7egsGJmyQL3iNvrdM1mQFr2dbKgl96lAV4
//   GAxK1PTBrmsCPp4O6WKzX8KzUTmIJu3IRvX5kA6GdZLMHM1Tq5lloq2U4TlwZ1r6c2OzW8JnDBV1
//   Q4G7NlQ+FPglY2hMWQvT/ZYJedk3qLp+Olt4P+3nS/8GTvR4LlkBAAA=
// ---

import type { Kysely } from 'kysely'

interface MigrationDatabase {
  'customers': {
    'id': string
    'name': string
    'phone': string | null
  }
}

export async function up(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.alterTable('customers').addColumn('phone', 'varchar(1024)').execute()
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.alterTable('customers').dropColumn('phone').execute()
}
