import stylistic from '@stylistic/eslint-plugin'
import parser from '@typescript-eslint/parser'
import type { Linter } from 'eslint'

export default [
  {
    files: ['**/*.ts'],
    languageOptions: { parser },
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/padding-line-between-statements': [
        'warn',
        { blankLine: 'always', prev: '*', next: 'return' },
        { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
        { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
        { blankLine: 'always', prev: '*', next: ['if', 'for', 'while', 'try'] },
        { blankLine: 'always', prev: ['if', 'for', 'while', 'try'], next: '*' }
      ]
    }
  }
] satisfies Linter.Config[]
