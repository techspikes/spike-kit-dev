// ---
// data-sketch/relational-db-projection/embedded: 1.0.0-draft.3
// generated_at: <GENERATED_AT>
// payload: |
//   H4sIAAAAAAAAA42QX0vDMBTFv4rcpwnpbKv40Lc6BwrTwR58GWVkSaaxbdLlj6yUfHdJl7WdT76E
//   e8L5neTcDig2ONIlM+TrTrEKGy4FriK6jxolvxnxGjJI5vE8jqjCBzO/BwQG7yumIeugUZJaYvxI
//   ZGVroSHbdsApZP5AIHDNLrNpGz8vXvLNLH28BYeCU5d2tJ5F8H7km96exOnDBGgUJ2xELjJAz8vF
//   61u+miUxukknFCaG/0ywQQfuab1eLfN3cAUCIoU2CnNh+p5W8KNlfbexZ/jq+fViiLXHXViL3nmH
//   KxwCLig7Mf2/BE5PfyMQlKztv3KQivFPAdm26Mkaq/Z6/77tGNaUQxY4N9nZcOd+AXfMVwoJAgAA
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
  await db.schema.dropIndex('idx_products_sku').execute()
  await db.schema.alterTable('products').dropConstraint('uq_products_sku').execute()
  await db.schema.alterTable('products').addUniqueConstraint('uq_products_sku', ['sku', 'price']).execute()
  await db.schema
    .createIndex('idx_products_sku')
    .on('products')
    .columns(['sku', 'price'])
    .execute()
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.dropIndex('idx_products_sku').execute()
  await db.schema.alterTable('products').dropConstraint('uq_products_sku').execute()
  await db.schema.alterTable('products').addUniqueConstraint('uq_products_sku', ['sku']).execute()
  await db.schema
    .createIndex('idx_products_sku')
    .on('products')
    .columns(['sku'])
    .execute()
}
