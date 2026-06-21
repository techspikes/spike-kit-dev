// ---
// data-sketch/relational-db-projection/embedded: 1.0.0-draft.3
// generated_at: <GENERATED_AT>
// payload: |
//   H4sIAAAAAAAAA22QwWrDMBBE/2VOKcium5QedAuFkHMOuQQTFGudqpYtdS0TjPG/ByW1m5ZexOgh
//   vWV2gFZBJW1Fofh4ZrIqGNcom+hT4tl9UhHvkHhJszRLNKsypCsIBHWy1EIOuBh9phBT4WxXNy3k
//   YYDRkPEQaFRNUw69j/l9u94tlm9PGMX3S6avzjDpjSH78GnCx3LinbVxMmTgjmbhfr27OV+zB6fz
//   9y5/nBOenf85coGK+lu/0jGZcwN5yAU8m1px/7ttHJfPfl8d7ytpMY4z/UHjFYqk9+B0AQAA
// ---

import type { Kysely } from 'kysely'

interface MigrationDatabase {
  'widgets': {
    'id': string
    'required_field': string | null
    'optional_field': string
  }
}

export async function up(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema
    .createTable('widgets')
    .addColumn('id', 'char(26)', column => column.notNull())
    .addColumn('required_field', 'varchar(40)')
    .addColumn('optional_field', 'varchar(40)', column => column.notNull())
    .addPrimaryKeyConstraint('pk_widgets', ['id'])
    .execute()
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.dropTable('widgets').execute()
}
