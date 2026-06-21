// ---
// data-sketch/relational-db-projection/embedded: 1.0.0-draft.3
// generated_at: <GENERATED_AT>
// payload: |
//   H4sIAAAAAAAAA1VOPQvCMBT8LzcpJLV+4JBNXJwdXEqRZxO1Nm1Kkg6l5L9LikZcHnfH3bubIMkT
//   d43y1XNllSZfm440lzfeW/NSVeQQWGd5lnNp6e6zLRg83bRyEBOMlcpGUBk9tJ2DKCbUEiIeho5a
//   9cV+7CM+ng7nxWa/RGAfp/PkB/dzJ/5JXA7nObTON7slQsnQqHFuvxur6kcHUZQMva1bsuP/mNhQ
//   ps99c50HO4SQxKSEN/nEIRcQAQAA
// ---

import type { Kysely } from 'kysely'

interface MigrationDatabase {
  'orders': {
    'id': string
    'status': string
  }
}

export async function up(db: Kysely<MigrationDatabase>): Promise<void> {
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
}
