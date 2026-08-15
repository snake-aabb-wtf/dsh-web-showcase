"""为最终交付拍摄一组演示截图。"""
from playwright.sync_api import sync_playwright

SCENES = [("堆叠金字塔", "01-stack"), ("球坑", "02-ballpit"), ("多米诺", "03-domino"), ("链条摆锤", "04-chain"), ("跷跷板", "05-seesaw"), ("撞球吊锤", "06-wrecking"), ("形状大杂烩", "07-mixed")]
WAITS = {"堆叠金字塔": 2000, "球坑": 3000, "多米诺": 2500, "链条摆锤": 1800, "跷跷板": 2500, "撞球吊锤": 3000, "形状大杂烩": 3000}

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.goto("http://localhost:5173")
    pg.wait_for_load_state("networkidle")
    for name, shot in SCENES:
        pg.get_by_role("button", name=name).click()
        pg.wait_for_timeout(WAITS[name])
        pg.screenshot(path=f"screenshots/{shot}.png")
    # 调试叠加层
    pg.get_by_role("button", name="堆叠金字塔").click()
    pg.wait_for_timeout(1500)
    for label in ["包围盒 AABB", "接触点", "法线", "速度向量"]:
        pg.get_by_role("button", name=label).click()
    pg.wait_for_timeout(500)
    pg.screenshot(path="screenshots/08-debug-overlays.png")
    pg.get_by_role("button", name="⏸ 暂停").click()
    pg.get_by_role("button", name="⏭ 单步").click()
    pg.get_by_role("button", name="▶ 继续").click()
    b.close()
print("screenshots taken")
