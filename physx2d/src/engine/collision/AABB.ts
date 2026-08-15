/**
 * AABB — 轴对齐包围盒，用于广相阶段的快速剔除。
 */
export class AABB {
  lower = { x: 0, y: 0 }
  upper = { x: 0, y: 0 }

  constructor(minX = 0, minY = 0, maxX = 0, maxY = 0) {
    this.lower.x = minX
    this.lower.y = minY
    this.upper.x = maxX
    this.upper.y = maxY
  }

  set(minX: number, minY: number, maxX: number, maxY: number): void {
    this.lower.x = minX
    this.lower.y = minY
    this.upper.x = maxX
    this.upper.y = maxY
  }

  /** 两个 AABB 是否相交 */
  static overlaps(a: AABB, b: AABB): boolean {
    return (
      a.lower.x <= b.upper.x &&
      a.upper.x >= b.lower.x &&
      a.lower.y <= b.upper.y &&
      a.upper.y >= b.lower.y
    )
  }
}
