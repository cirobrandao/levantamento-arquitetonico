// Carrega módulos TypeScript de src/ transpilando sob demanda (sem build), resolvendo imports relativos.
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const cache = new Map()
export function moduleUrl(name) {
  if (cache.has(name)) return cache.get(name)
  let source = ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  source = source.replace(/(['"])\.\/([^'"]+)\1/g, (_, quote, dependency) => JSON.stringify(moduleUrl(dependency)))
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  cache.set(name, url); return url
}
export const load = name => import(moduleUrl(name))
