"""
轻量级 UI 交互探针：主菜单/操作说明/设置/键位/暂停/重置/视角切换/任务面板。
不做实际飞行（避免软件渲染下长时间运行），仅验证 DOM 交互与控制台无错。
"""
import os
import sys
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
ART = os.path.join(os.path.dirname(__file__), "..", "artifacts")
os.makedirs(ART, exist_ok=True)
console_errors = []
page_errors = []
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"  ({detail})" if detail else ""))


def shot(page, name):
    try:
        page.screenshot(path=os.path.join(ART, name), timeout=10000)
    except Exception:
        pass


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1024, "height": 576})
        page.add_init_script("localStorage.setItem('sky172.settings', JSON.stringify({quality:'low'}))")
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.goto(BASE)
        page.wait_for_load_state("networkidle")
        time.sleep(1.5)
        shot(page, "ui-menu.png")

        check("主菜单标题", page.locator(".menu-title").count() > 0)
        page.get_by_role("button", name="操作说明").click()
        time.sleep(0.5)
        check("操作说明键位表", page.locator(".key-table tr").count() >= 14)
        page.get_by_role("button", name="关闭").click()
        time.sleep(0.3)

        page.get_by_role("button", name="设置").click()
        time.sleep(0.5)
        check("设置面板滑杆", page.locator('input[type="range"]').count() >= 3)
        page.get_by_role("button", name="键位").click()
        time.sleep(0.4)
        check("键位编辑行数", page.locator(".keybind-row").count() >= 16)
        page.get_by_role("button", name="关闭").click()
        time.sleep(0.3)

        page.get_by_role("button", name="开始飞行").click()
        time.sleep(4)
        check("飞行画面（HUD+Canvas）", page.locator(".hud").count() > 0 and page.locator("canvas").count() > 0)
        shot(page, "ui-flying.png")

        page.keyboard.press("v")
        time.sleep(1.2)
        vis = page.locator(".instrument-cluster").evaluate("el => getComputedStyle(el).display")
        check("座舱视角仪表簇", vis != "none")
        shot(page, "ui-cockpit.png")
        page.keyboard.press("v")
        time.sleep(0.8)

        page.keyboard.press("p")
        time.sleep(0.6)
        check("暂停菜单", page.locator(".panel-pause").count() > 0)
        shot(page, "ui-pause.png")
        page.keyboard.press("p")
        time.sleep(0.6)
        check("继续后暂停消失", page.locator(".panel-pause").count() == 0)

        page.keyboard.press("r")
        time.sleep(1)
        ias = page.eval_on_selector(".hud-left .hud-block:nth-child(1) .hud-value", "el => el.textContent")
        check("重置后 IAS≈0", int(ias or 99) < 5, f"IAS={ias}")

        page.keyboard.press("Escape")
        time.sleep(0.5)
        page.locator(".panel-pause .btn", has_text="返回主菜单").click()
        time.sleep(0.8)
        check("返回主菜单", page.locator(".menu-title").count() > 0)

        page.get_by_role("button", name="起降任务").click()
        time.sleep(2)
        mvis = page.locator(".mission-panel").evaluate("el => getComputedStyle(el).display")
        check("任务模式面板", mvis == "block")

        time.sleep(1)
        real_errors = [e for e in console_errors if "favicon" not in e.lower()]
        check("控制台无 error", len(real_errors) == 0, "; ".join(real_errors[:4]))
        check("页面无未捕获异常", len(page_errors) == 0, "; ".join(page_errors[:4]))
        browser.close()

    fails = [r for r in results if not r[1]]
    print(f"\nUI 探针结果: {len(results) - len(fails)}/{len(results)} 通过")
    if fails:
        sys.exit(1)


if __name__ == "__main__":
    main()
