// mulberry32; state is a uint32
export class Rng {
  private s: number;

  constructor(state: number) {
    this.s = state >>> 0;
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  pick<T>(xs: readonly T[]): T {
    return xs[this.int(xs.length)];
  }

  get state(): number {
    return this.s;
  }
}
