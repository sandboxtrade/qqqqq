export function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class SeededRandom {
  private state: number;

  constructor(seed: string | number) {
    const value = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
    this.state = value || 0x9e3779b9;
  }

  next(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 0x1_0000_0000;
  }

  int(maxExclusive: number): number {
    if (maxExclusive <= 1) return 0;
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(values: readonly T[]): T | undefined {
    return values.length ? values[this.int(values.length)] : undefined;
  }
}
