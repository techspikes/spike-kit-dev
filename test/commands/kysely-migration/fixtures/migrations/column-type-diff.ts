// ---
// data-sketch/relational-db-projection/embedded: 1.0.0-draft.3
// generated_at: <GENERATED_AT>
// payload: |
//   H4sIAAAAAAAAA32QzU7DMBCEXwXtqUhOSArikFsolUAqVOqBSxVVrr0Fk8RO/YMaVX535JAmgQMX
//   a8eeb9ezZ+DU0siUaNnHjcaKWqEkrSK+jxqtPpEFDRmkcRInEdf0YONbIGDpvkID2RkarbhjNpRM
//   Va6WBrLtGQSHLBwEJK3xUtu2CfXiKd/M5vfX4EnvNKUbrT+i977lm86eJvO7CdBowXBELrKHHpeL
//   55d8NUsTcjWlKLPia4INuuce1uvVMn8FXxBgShqrqZC2y+mkODrsso05u68WQzt33PXrMLvw4gtP
//   QEiOJzT/k4Kf/qIESmy70QelUbxLyLYFCUlrqtvf+w7pxmZNOfQC7yc7Gu78Nxm/Pzr5AQAA
// ---

import type { Kysely } from 'kysely'

interface MigrationDatabase {
  'products': {
    'id': string
    'sku': string
    'price': string
    'active': boolean
  }
}

export async function up(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema
    .alterTable('products')
    .alterColumn('price', col => col.setDataType('decimal(10, 4)'))
    .execute()
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema
    .alterTable('products')
    .alterColumn('price', col => col.setDataType('decimal(10, 2)'))
    .execute()
}
