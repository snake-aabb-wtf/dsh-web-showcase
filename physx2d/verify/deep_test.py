"""PhysX2D 深度验证：对每个场景做定量物理断言（非仅截图）。"""
import json
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"

JS_SNAPSHOT = """
() => {
  const w = window.__PHYSX?.world;
  if (!w) return null;
  return {
    stats: w.stats,
    bodies: w.bodies.map(b => ({
      hue: b.hue, x: b.position.x, y: b.position.y,
      a: b.angle, vx: b.velocity.x, vy: b.velocity.y,
      r: b.shape.radius ?? 0, sleeping: b.sleeping, type: b.type,
    })),
    joints: w.joints.length,
  };
}
"""

def snap(page):
    return page.evaluate(JS_SNAPSHOT)

def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name} {detail}")
    assert cond, f"{name}: {detail}"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE)
    page.wait_for_load_state("networkidle")

    def switch_scene(name, wait_ms):
        page.get_by_role("button", name=name).click()
        page.wait_for_timeout(wait_ms)

    # ============ 1. 堆叠金字塔 ============
    switch_scene("堆叠金字塔", 4500)
    s = snap(page)
    dyn = [b for b in s["bodies"] if b["type"] == "dynamic"]
    sleeping = sum(1 for b in dyn if b["sleeping"])
    check("堆叠: 大部分砖块已休眠", sleeping >= len(dyn) * 0.6, f"{sleeping}/{len(dyn)} 休眠")
    # 穿透检查：底部砖块应坐在地面上（地面顶 606，砖半高 24）
    bottoms = [b["y"] + 24 for b in dyn if b["hue"] >= 210 and b["hue"] <= 282]
    max_bottom = max(bottoms)
    check("堆叠: 无过度穿透", max_bottom <= 608.5, f"最大底部 y={max_bottom:.1f} (≤608.5)")
    # 顶砖仍站得住
    top = min(dyn, key=lambda b: b["y"])
    check("堆叠: 顶部未倒塌", top["y"] < 380, f"顶砖 y={top['y']:.1f}")

    # ============ 2. 球坑 ============
    switch_scene("球坑", 3500)
    s = snap(page)
    balls = [b for b in s["bodies"] if b["type"] == "dynamic" and b["r"] > 0]
    below = sum(1 for b in balls if b["y"] > 280)
    check("球坑: 大部分球已进入漏斗区域", below >= len(balls) * 0.8, f"{below}/{len(balls)} 球在漏斗下方")
    basin = [b for b in balls if -70 < b["x"] < 70 and 380 < b["y"] < 590]
    check("球坑: 有球落入收集盆", len(basin) >= 3, f"{len(basin)} 球在盆中")

    # ============ 3. 多米诺 ============
    switch_scene("多米诺", 3000)
    s = snap(page)
    dominoes = [b for b in s["bodies"] if b["type"] == "dynamic" and 40 <= b["hue"] <= 110 and b["r"] == 0]
    fallen = [b for b in dominoes if abs(b["a"]) > 0.35]
    check("多米诺: 发生连锁倒塌", len(fallen) >= 8, f"{len(fallen)}/{len(dominoes)} 已倒")

    # ============ 4. 链条摆锤 ============
    switch_scene("链条摆锤", 1500)
    s1 = snap(page)
    page.wait_for_timeout(800)
    s2 = snap(page)
    h1 = [b for b in s1["bodies"] if b["r"] == 26]
    h2 = [b for b in s2["bodies"] if b["r"] == 26]
    check("链条: 摆锤在摆动", h1 and h2 and (h1[0]["x"] != h2[0]["x"] or h1[0]["y"] != h2[0]["y"]),
          f"锤位置 {h1[0]['x']:.0f},{h1[0]['y']:.0f} → {h2[0]['x']:.0f},{h2[0]['y']:.0f}")
    check("链条: 关节数量正确", s1["joints"] == 22 + 1 + 14, f"joints={s1['joints']}")

    # ============ 5. 跷跷板 ============
    switch_scene("跷跷板", 1200)
    s1 = snap(page)
    page.wait_for_timeout(1800)
    s2 = snap(page)
    def board_angle(s):
        for b in s["bodies"]:
            if b["hue"] == 50 and b["r"] == 0 and abs(b["x"]) < 30:
                return b["a"]
        return None
    a1, a2 = board_angle(s1), board_angle(s2)
    check("跷跷板: 板子被球砸动", a1 is not None and a2 is not None and max(abs(a1), abs(a2)) > 0.04,
          f"角度 {a1:.3f} → {a2:.3f}")

    # ============ 6. 撞球吊锤 ============
    switch_scene("撞球吊锤", 3500)
    s = snap(page)
    bricks = [b for b in s["bodies"] if b["hue"] == 12 and b["r"] == 0]
    displaced = [b for b in bricks if b["x"] < 125 or b["y"] > 610 or abs(b["a"]) > 0.15]
    check("吊锤: 砖墙被砸动", len(displaced) >= 5, f"{len(displaced)}/{len(bricks)} 块砖位移/倒塌")
    fallen = [b for b in displaced if b["y"] > 580]
    check("吊锤: 有砖塌落", len(fallen) >= 3, f"{len(fallen)} 块砖塌落")

    # ============ 7. 拖拽交互 ============
    switch_scene("堆叠金字塔", 1500)
    world_pos = page.evaluate("""() => {
        const w = window.__PHYSX.world;
        const dyn = w.bodies.filter(x => x.type === 'dynamic');
        const b = dyn.reduce((a, c) => c.position.y < a.position.y ? c : a);
        const r = window.__PHYSX.renderer;
        const s = r.worldToScreen(b.position);
        return { wx: b.position.x, wy: b.position.y, sx: s.x, sy: s.y };
    }""")
    box = page.locator("canvas").bounding_box()
    sx, sy = box["x"] + world_pos["sx"], box["y"] + world_pos["sy"]
    page.mouse.move(sx, sy)
    page.mouse.down()
    page.wait_for_timeout(150)
    page.mouse.move(sx + 200, sy - 150, steps=15)
    page.wait_for_timeout(250)
    page.mouse.up()
    page.wait_for_timeout(400)
    moved = page.evaluate("""(orig) => {
        const w = window.__PHYSX.world;
        const b = w.bodies.find(x => x.type === 'dynamic');
        return Math.hypot(b.position.x - orig.wx, b.position.y - orig.wy);
    }""", world_pos)
    check("拖拽: 刚体跟随鼠标移动", moved > 80, f"位移 {moved:.0f}px")

    # ============ 8. 参数联动（UI → 引擎） ============
    slider0 = page.locator("input[type=range]").nth(0)
    slider0.evaluate("""el => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, '0');
        el.dispatchEvent(new Event('input', {bubbles: true}));
    }""")
    page.wait_for_timeout(300)
    g = page.evaluate("() => window.__PHYSX.world.gravity.y")
    check("参数: 重力滑杆联动", g == 0, f"gravity={g}")
    slider0.evaluate("""el => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, '1500');
        el.dispatchEvent(new Event('input', {bubbles: true}));
    }""")

    # ============ 9. 休眠与统计 ============
    page.wait_for_timeout(4000)
    s = snap(page)
    check("统计: 无控制台错误", not errors, json.dumps(errors))
    print("final stats:", json.dumps(s["stats"]))

    browser.close()
    print("ALL DEEP CHECKS PASSED")
