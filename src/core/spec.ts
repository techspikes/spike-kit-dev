export type DataSketch<
  P extends Record<string, (() => unknown) | undefined> = Record<
    string,
    (() => unknown) | undefined
  >
> = {
  readonly spec: unknown
  readonly metadata: {
    readonly version: string
    readonly basePath: string
    readonly validated?: boolean
  }
  readonly projections: P
}
