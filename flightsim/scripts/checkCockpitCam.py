# -*- coding: utf-8 -*-
"""第一人称相机断言 v2：视线水平朝机头；拉杆（达到 Vr 后）飞机抬头且相机同步跟随"""
import re
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"


def cam_dir(page):
    try:
        return page.evaluate("() => window.__camDir ?? null")
    except Exception:
        return None


def pitch(page):
    try:
        txt = page.eval_on_selector(".debug-panel pre", "el => el.textContent")
        m = re.search(r"pitch (-?[\d.]+)°", txt)
        return float(m.group(1)) if m else None
    except Exception:
        return None


def ias(page):
    try:
        txt = page.eval_on_selector(".debug-panel pre", "el => el.textContent")
        m = re.search(r"IAS (\d+)", txt)
        return int(m.group(1)) if m else 0
    except Exception:
        return 0


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1024, "height": 576})
    page.add_init_script("localStorage.setItem('sky172.settings', JSON.stringify({quality:'low'}))")
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    time.sleep(1.5)
    page.get_by_role("button", name="开始飞行").click()
    time.sleep(4)
    page.keyboard.press("F1")  # 调试面板（读 pitch/IAS 作对照）
    page.keyboard.down("Shift")
    for _ in range(60):
        if ias(page) >= 60:
            break
        time.sleep(1)
    page.keyboard.up("Shift")
    print("IAS at rotation:", ias(page), "kt")

    page.keyboard.press("v")  # 第一人称
    time.sleep(2)
    d0 = cam_dir(page)
    print("cam dir (level):", d0)
    ok1 = d0 is not None and abs(d0["y"]) < 0.2 and d0["x"] > 0.85
    print("PASS 视线水平且朝机头" if ok1 else "FAIL 视线未对准机头")

    page.keyboard.down("w")  # 拉杆抬头
    time.sleep(3)
    page.keyboard.up("w")
    p1 = pitch(page)
    d1 = cam_dir(page)
    print("pitch after pull: %s deg, cam dir: %s" % (p1, d1))
    ok2 = p1 is not None and p1 > 3 and d1 is not None and d1["y"] > 0.05
    print("PASS 拉杆抬头且相机视线同步上仰" if ok2 else "FAIL 拉杆/相机跟随未生效")

    page.screenshot(path="artifacts/cockpit-fixed.png", timeout=15000)
    browser.close()
    if not (ok1 and ok2):
        raise SystemExit(1)
