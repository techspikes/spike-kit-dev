// biome-ignore-all lint/style/noNonNullAssertion: field references are validated before projection.
import type { Specification } from './validator.ts'

export interface DbProjectionSnapshot {
  readonly 'data-sketch/db-projection-snapshot': '1.0.0-draft.1'
  readonly tables: readonly DbProjectionTable[]
}

interface DbProjectionTable {
  readonly name: string
  readonly columns: readonly DbProjectionColumn[]
  readonly uniqueConstraints: readonly DbProjectionNamedColumnList[]
  readonly foreignKeys: readonly DbProjectionForeignKey[]
  readonly indexes: readonly DbProjectionIndex[]
  readonly checkConstraints: readonly DbProjectionCheckConstraint[]
  readonly primaryKey?: DbProjectionNamedColumnList
}

export interface DbProjectionColumn {
  readonly name: string
  readonly type: Specification['stores'][string]['fields'][string]['type']
  readonly nullable: boolean
  readonly default:
    | { readonly kind: 'omitted' }
    | {
        readonly kind: 'value'
        readonly value: string | number | boolean | null
      }
}

interface DbProjectionNamedColumnList {
  readonly name: string
  readonly columns: readonly string[]
}

interface DbProjectionForeignKey {
  readonly name: string
  readonly columns: readonly string[]
  readonly references: {
    readonly table: string
    readonly columns: readonly string[]
  }
  readonly onDelete?: string
  readonly onUpdate?: string
}

interface DbProjectionIndex {
  readonly name: string
  readonly columns: readonly DbProjectionIndexColumn[]
}

interface DbProjectionIndexColumn {
  readonly name: string
  readonly order?: 'asc' | 'desc'
}

interface DbProjectionCheckConstraint {
  readonly name: string
  readonly column: string
  readonly values: readonly string[]
}

export function createDbProjectionSnapshot(
  spec: Specification
): DbProjectionSnapshot {
  return {
    'data-sketch/db-projection-snapshot': '1.0.0-draft.1',
    tables: Object.entries(spec.stores).map(([, store]) => {
      const fields = Object.entries(store.fields)
      const fieldNameById = new Map(
        fields.map(([fieldId, field]) => [fieldId, field.name])
      )

      return {
        name: store.name,
        columns: fields.map(([, field]) => ({
          name: field.name,
          type: field.type,
          nullable: field.nullable,
          default: Object.hasOwn(field, 'default')
            ? { kind: 'value', value: field.default ?? null }
            : { kind: 'omitted' }
        })),
        uniqueConstraints: (store.keys?.unique ?? []).map(uniqueKey => ({
          name: uniqueKey.name,
          columns: uniqueKey.fields.map(fieldId => fieldNameById.get(fieldId)!)
        })),
        foreignKeys: (store.keys?.foreign ?? []).map(foreignKey => {
          const referencedStore = spec.stores[foreignKey.references.store]
          const referencedFieldNameById = new Map(
            Object.entries(referencedStore.fields).map(([fieldId, field]) => [
              fieldId,
              field.name
            ])
          )

          return {
            name: foreignKey.name,
            columns: foreignKey.fields.map(
              fieldId => fieldNameById.get(fieldId)!
            ),
            references: {
              table: referencedStore.name,
              columns: foreignKey.references.fields.map(
                fieldId => referencedFieldNameById.get(fieldId)!
              )
            },
            ...(foreignKey.onDelete ? { onDelete: foreignKey.onDelete } : {}),
            ...(foreignKey.onUpdate ? { onUpdate: foreignKey.onUpdate } : {})
          }
        }),
        indexes: (store.indexes ?? []).map(index => ({
          name: index.name,
          columns: index.fields.map(field => {
            if (typeof field === 'string') {
              return { name: fieldNameById.get(field)! }
            }

            return {
              name: fieldNameById.get(field.field)!,
              order: field.order
            }
          })
        })),
        checkConstraints: fields.flatMap(([, field]) =>
          field.enum
            ? [
                {
                  name: `ck_${store.name}_${field.name}`,
                  column: field.name,
                  values: field.enum
                }
              ]
            : []
        ),
        ...(store.keys?.primary
          ? {
              primaryKey: {
                name: store.keys.primary.name,
                columns: store.keys.primary.fields.map(
                  fieldId => fieldNameById.get(fieldId)!
                )
              }
            }
          : {})
      }
    })
  }
}
