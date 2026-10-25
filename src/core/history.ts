/** Bounded immutable scene history. Rapid edits to one control transaction coalesce. */
export class SceneHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  private current: T;
  private lastKey = '';
  private lastTime = -Infinity;
  readonly limit: number;
  constructor(initial: T, limit = 80) { this.current = structuredClone(initial); this.limit = limit; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  get retainedValues(): readonly T[] { return [...this.past, this.current, ...this.future]; }
  push(next: T, key = '', now = performance.now()) {
    if (JSON.stringify(next) === JSON.stringify(this.current)) return;
    if (!key || key !== this.lastKey || now - this.lastTime > 600) {
      this.past.push(this.current);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.current = structuredClone(next); this.future = [];
    this.lastKey = key; this.lastTime = now;
  }
  undo(): T | undefined {
    if (!this.canUndo) return;
    this.future.push(this.current); this.current = this.past.pop()!; this.lastKey = '';
    return structuredClone(this.current);
  }
  redo(): T | undefined {
    if (!this.canRedo) return;
    this.past.push(this.current); this.current = this.future.pop()!; this.lastKey = '';
    return structuredClone(this.current);
  }
}
