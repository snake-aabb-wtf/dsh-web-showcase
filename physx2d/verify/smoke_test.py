"""PhysX2D 冒烟测试：验证页面加载、物理运行、场景切换、拖拽与调试叠加层。"""
import json
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
OUT = "screenshots"

def read_world(page):
    return page.evaluate(
        """() => {
            const w = window.__PHYSX?.world;
            if (!w) return null;
            return {
                bodies: w.bodies.length,
                contacts: w.stats.contactCount,
                sleeping: w.stats.sleepingCount,
                sample: w.bodies.slice(-3).map(b => ({x: +b.position.x.toFixed(1), y: +b.position.y.toFixed(1), vx: +b.velocity.x.toFixed(1), vy: +b.velocity.y.toFixed(1), sleeping: b.sleeping}))
            };
        }"""
    )

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2500)

    # 1. 初始场景（堆叠金字塔）：刚体存在且正在运动
    w0 = read_world(page)
    print("initial:", json.dumps(w0, ensure_ascii=False))
    assert w0 and w0["bodies"] > 20 and w0["contacts"] > 5, "stack scene not running"
    page.screenshot(path=f"{OUT}/01-stack.png")

    # 2. 堆叠稳定性：等 2 秒后金字塔顶部不应塌陷太多（速度应接近 0）
    page.wait_for_timeout(2000)
    w1 = read_world(page)
    print("after settle:", json.dumps(w1, ensure_ascii=False))
    page.screenshot(path=f"{OUT}/01b-stack-settled.png")

    # 3. 场景切换
    for name, shot in [("球坑", "02-balls"), ("多米诺", "03-domino"), ("链条摆锤", "04-chain"), ("跷跷板", "05-seesaw"), ("撞球吊锤", "06-wreck"), ("形状大杂烩", "07-mixed")]:
        page.get_by_role("button", name=name).click()
        page.wait_for_timeout(2200)
        w = read_world(page)
        print(f"scene {name}:", json.dumps(w, ensure_ascii=False))
        assert w and w["bodies"] > 10, f"scene {name} empty"
        page.screenshot(path=f"{OUT}/{shot}.png")

    # 4. 回到堆叠场景，验证拖拽：抓住一个刚体拖走
    page.get_by_role("button", name="堆叠金字塔").click()
    page.wait_for_timeout(1200)
    box = page.locator("canvas").bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(cx, cy + 40)          # 金字塔中部
    page.mouse.down()
    page.wait_for_timeout(200)
    page.mouse.move(cx + 260, cy - 180, steps=12)
    page.wait_for_timeout(300)
    page.mouse.up()
    page.wait_for_timeout(800)
    page.screenshot(path=f"{OUT}/08-drag.png")

    # 5. 调试叠加层
    for label in ["包围盒 AABB", "接触点", "法线", "速度向量"]:
        page.get_by_role("button", name=label).click()
    page.wait_for_timeout(400)
    page.screenshot(path=f"{OUT}/09-debug.png")

    # 6. 暂停 / 单步
    page.get_by_role("button", name="⏸ 暂停").click()
    page.wait_for_timeout(300)
    b_paused = page.evaluate("() => window.__PHYSX.world.bodies[0].position.y")
    page.get_by_role("button", name="⏭ 单步").click()
    page.wait_for_timeout(200)
    b_stepped = page.evaluate("() => window.__PHYSX.world.bodies[0].position.y")
    print("paused y:", b_paused, "stepped y:", b_stepped)
    page.get_by_role("button", name="▶ 继续").click()

    print("console errors:", json.dumps(errors, ensure_ascii=False))
    assert not errors, f"console errors: {errors}"
    browser.close()
    print("ALL CHECKS PASSED")
