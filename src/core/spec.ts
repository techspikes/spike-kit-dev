import type { Specification } from './parser.ts'

export type DataSketch<
  P extends Record<string, (() => unknown) | undefined> = Record<
    string,
    (() => unknown) | undefined
  >
> = {
  readonly spec: Specification
  readonly sources?: {
    readonly openapi?: unknown
  }
  readonly metadata: {
    readonly version: string
    readonly basePath: string
    readonly validated?: boolean
  }
  readonly projections: P
}
