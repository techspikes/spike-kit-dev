// ---
// data-sketch/relational-db-projection/embedded: 1.0.0-draft.3
// generated_at: <GENERATED_AT>
// payload: |
//   H4sIAAAAAAAAA32QzU7DMBCEXwXtqUhOSALikFsolUAqVOqBSxVVru2CSWKn/kGNIr87skmTwIGL
//   tWPPt+vZHig2ONIVM+TjRrEaGy4FriN6iFolPxnxGnJI4yROIqrw0cS3gMDgQ8005D20SlJLjC+J
//   rG0jNOS7HjiF3B8IBG7YpTZd6+vlU7FdZPfX4NDg1JWdrD9i8L4V22BPk+xuBrSKEzYhFzlAj6vl
//   80uxXqQJuspmFCaGf82wUQ/cw2azXhWv4EoERAptFObChJxW8JNlIduUM3y1HNvZ035Yh977F1c6
//   BFxQdmb6f5LT818UQcW6MPooFePvAvJdiXzSBqvu9759uqlZW429wLnZjsY79w3Pilx7+QEAAA==
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
    .createTable('products')
    .addColumn('id', 'char(26)', column => column.notNull())
    .addColumn('sku', 'varchar(1024)', column => column.notNull())
    .addColumn('price', 'decimal(10, 2)', column => column.notNull())
    .addColumn('active', 'boolean', column => column.notNull())
    .addPrimaryKeyConstraint('pk_products', ['id'])
    .addUniqueConstraint('uq_products_sku', ['sku'])
    .execute()

  await db.schema
    .createIndex('idx_products_sku')
    .on('products')
    .columns(['sku'])
    .execute()
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.dropIndex('idx_products_sku').execute()

  await db.schema.dropTable('products').execute()
}
