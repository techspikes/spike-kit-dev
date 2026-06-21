// ---
// data-sketch/relational-db-projection/embedded: 1.0.0-draft.3
// generated_at: <GENERATED_AT>
// payload: |
//   H4sIAAAAAAAAA1VQTUvEMBT8K/JOK6S1reIht7ouKKwu7MHLUpZsktXYNsnmQygl/11Su229hDcv
//   M8PM64ERRxJbc0e/7gxviBNKkiZhp0Qb9c1pxIAhT7M0S5ghZ5feAwJHTg23gHvQRjFPXRypanwr
//   LeBDD4IBjg8CSVp+nV2n47x+Kfer4vEWAhqZtvYz9Q+M3I9yP9DzrHhYCLQRlM+SKxxFz5v161u5
//   XeUZuikWKkKd+FnIJjzqnna77aZ8h1AhoEpaZ4iQbujppbh4PnSbew5Rq8nOX47jOewx/oQqIKh5
//   NxicleHiUwI+VCjmbYnp/l8tZpzNdD2ZQQiLptMu/AI/X2tWvwEAAA==
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
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema
    .createIndex('idx_products_sku')
    .on('products')
    .columns(['sku'])
    .execute()
}
