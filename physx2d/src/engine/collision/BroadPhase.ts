import type { Body } from '../bodies/Body'
import type { AABB } from './AABB'

/**
 * 广相阶段：空间哈希（Spatial Hashing）。
 *
 * 把世界划分成固定大小的网格，每个刚体的 AABB 覆盖到的格子都被登记。
 * 同一格子内的刚体两两构成"候选对"，再交给窄相阶段做精确检测。
 * 相比 O(n²) 的暴力遍历，这里把复杂度降到接近 O(n)。
 *
 * 实现方式：每步重建（clear → insert → query），对演示规模的场景足够快，
 * 且天然避免了对静态/动态刚体的增量维护问题。
 */
export class BroadPhase {
  /** 网格单元大小（像素） */
  cellSize = 64

  private grid = new Map<string, number[]>()
  /** 去重后的候选对，key = "idA|idB"（保证 idA < idB） */
  private pairs = new Set<string>()

  /** 重建整张哈希表 */
  rebuild(bodies: Body[]): void {
    this.grid.clear()

    for (const body of bodies) {
      const minX = Math.floor(body.aabb.lower.x / this.cellSize)
      const minY = Math.floor(body.aabb.lower.y / this.cellSize)
      const maxX = Math.floor(body.aabb.upper.x / this.cellSize)
      const maxY = Math.floor(body.aabb.upper.y / this.cellSize)

      for (let gy = minY; gy <= maxY; gy++) {
        for (let gx = minX; gx <= maxX; gx++) {
          const key = `${gx},${gy}`
          let bucket = this.grid.get(key)
          if (!bucket) {
            bucket = []
            this.grid.set(key, bucket)
          }
          bucket.push(body.id)
        }
      }
    }
  }

  /**
   * 生成候选对列表。返回 { a, b } 数组（bodies 已按 id 排序时可复用 idMap）。
   */
  generatePairs(bodies: Body[]): Array<{ a: Body; b: Body }> {
    const idMap = new Map<number, Body>()
    for (const b of bodies) idMap.set(b.id, b)

    this.pairs.clear()
    const result: Array<{ a: Body; b: Body }> = []
    const aabbs = new Map<number, AABB>()

    for (const [, bucket] of this.grid) {
      const n = bucket.length
      for (let i = 0; i < n; i++) {
        const idA = bucket[i]
        const bodyA = idMap.get(idA)
        if (!bodyA) continue
        for (let j = i + 1; j < n; j++) {
          const idB = bucket[j]
          const bodyB = idMap.get(idB)
          if (!bodyB) continue

          // 规则：跳过自身、static-static 对；只保留 idA < idB 保证每对只处理一次
          if (idA === idB) continue
          if (idA > idB) continue
          if (!bodyA.isDynamic && !bodyB.isDynamic) continue

          const pairKey = `${idA}|${idB}`
          if (this.pairs.has(pairKey)) continue
          this.pairs.add(pairKey)

          // AABB 粗检测
          let aabbA = aabbs.get(idA)
          let aabbB = aabbs.get(idB)
          if (!aabbA) {
            aabbA = bodyA.aabb
            aabbs.set(idA, aabbA)
          }
          if (!aabbB) {
            aabbB = bodyB.aabb
            aabbs.set(idB, aabbB)
          }
          if (!this.overlaps(aabbA, aabbB)) continue

          result.push({ a: bodyA, b: bodyB })
        }
      }
    }
    return result
  }

  private overlaps(a: AABB, b: AABB): boolean {
    return (
      a.lower.x <= b.upper.x &&
      a.upper.x >= b.lower.x &&
      a.lower.y <= b.upper.y &&
      a.upper.y >= b.lower.y
    )
  }

  /** 调试用：当前网格中非空格子数 */
  get bucketCount(): number {
    return this.grid.size
  }
}
