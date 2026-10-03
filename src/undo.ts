// Histórico para "Desfazer": guarda estados anteriores completos (imutáveis), em memória.
// Alterações em sequência rápida (digitação, arraste) viram um único passo.
export class UndoHistory<T> {
  private past: T[] = []
  private lastAt = -Infinity
  constructor(private readonly limit = 60, private readonly groupMs = 1200) {}
  record(previous: T, now = Date.now()) {
    if (now - this.lastAt > this.groupMs || !this.past.length) {
      if (this.past.at(-1) !== previous) this.past.push(previous)
      if (this.past.length > this.limit) this.past.shift()
    }
    this.lastAt = now
  }
  undo(): T | undefined { this.lastAt = -Infinity; return this.past.pop() }
  clear() { this.past = []; this.lastAt = -Infinity }
  get size() { return this.past.length }
}
