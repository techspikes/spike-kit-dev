import assert from 'node:assert'
import { describe, it } from 'node:test'
import { exec } from './test-helper/exec.ts'
import { getFileImportUrl, readJsonFile, readTextFile } from './test-helper/file-access.ts'
import { runAndCapture } from './test-helper/logger.ts'

const rootUsageLine = 'Usage: shot [OPTION]... COMMAND [ARG]...'

describe('build artifacts', () => {
  it('runs the built CLI help command', () => {
    const result = runAndCapture(() => {
      exec('node bin/cli.mjs --help')
    })

    assert.equal(result.stdout[0]?.split('\n')[0], rootUsageLine)
    assert.deepEqual(result.stderr, [])
  })

  it('runs the built CLI spec-check command', () => {
    const result = runAndCapture(() => {
      exec('node bin/cli.mjs spec-check test/commands/spec-check/fixtures/sketches/online-shop.valid.yaml')
    })

    assert.deepEqual(result.stdout, ['Specification is valid.\n'])
    assert.deepEqual(result.stderr, [])
  })

  it('exports the public library API from lib/index.mjs', async () => {
    const builtLibrary = (await import(getFileImportUrl('lib/index.mjs'))) as Record<string, unknown>

    assert.equal(typeof builtLibrary.parse, 'function')
    assert.equal(typeof builtLibrary.validate, 'function')
    assert.equal(typeof builtLibrary.project, 'function')
    assert.equal(typeof builtLibrary.validateRelationalDbProjection, 'function')
    assert.equal(typeof builtLibrary.renderKyselyMigration, 'function')
    assert.equal(typeof builtLibrary.renderKyselyDatabaseTypes, 'function')
    assert.equal(typeof builtLibrary.renderTablesDoc, 'function')
    assert.equal(typeof builtLibrary.coreValidator, 'object')
    assert.equal(typeof builtLibrary.openApiValidator, 'object')
    assert.equal(typeof builtLibrary.relationalDbProjector, 'object')
  })

  it('publishes the generated library type declarations', () => {
    const packageJson = readJsonFile<{
      readonly main: string
      readonly types: string
      readonly exports: { readonly '.': { readonly import: string; readonly types: string } }
      readonly bin: { readonly shot: string }
    }>('package.json')

    assert.equal(packageJson.main, './lib/index.mjs')
    assert.equal(packageJson.types, './lib/index.d.ts')
    assert.equal(packageJson.exports['.'].import, './lib/index.mjs')
    assert.equal(packageJson.exports['.'].types, './lib/index.d.ts')
    assert.equal(packageJson.bin.shot, './bin/cli.mjs')

    const indexDeclaration = readTextFile('lib/index.d.ts')

    assert.equal(indexDeclaration.includes('export declare function parse'), true)
    assert.equal(indexDeclaration.includes('export declare function validate'), true)
    assert.equal(indexDeclaration.includes('export declare function project'), true)
    assert.equal(indexDeclaration.includes('export declare const relationalDbProjector'), true)
    assert.equal(indexDeclaration.includes('export declare function validateRelationalDbProjection'), true)
    assert.equal(indexDeclaration.includes('export declare function renderKyselyMigration'), true)
    assert.equal(indexDeclaration.includes('export declare function renderKyselyDatabaseTypes'), true)
    assert.equal(indexDeclaration.includes('export declare function renderTablesDoc'), true)
  })
})
