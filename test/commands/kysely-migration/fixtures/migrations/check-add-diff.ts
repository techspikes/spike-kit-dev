// ---
// data-sketch/relational-db-projection/embedded: 1.0.0-draft.3
// generated_at: <GENERATED_AT>
// payload: |
//   H4sIAAAAAAAAA1VPPWvDMBD9L29qQHadtHTQFrp0ztDFmKBIl1i1LQlJLhij/17kOk67HO8ed+9j
//   hhJRFKGjKNtnT72I2hrRF+pSOG+/SOYdHPuyKqtCeXGN5QsYorj0FMBnWK/IZyBtPw4mgNcztALP
//   g8GIge44Ti7j94/j6enwtkNi62WIIo7hcb3t68fn8bQ87avD6w6pYZDWhOiFNnEJIVuS3eL8m+Kv
//   BplxAK/hyChtbmAIrXaOciJFvf4mTwrNZi6789IpnFeJ1CSGjqbF6Wo96ZsBrxsG5/Ug/PS/fa70
//   UHN3NaS0kRuTfgAgeLu3gQEAAA==
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
