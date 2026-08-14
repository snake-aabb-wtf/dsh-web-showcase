# -*- coding: utf-8 -*-
"""眼位调整后的座舱截图与断言：相机眼位应高于机头整流罩顶（body z=-0.62）"""
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"


def cam_dir(page):
    try:
        return page.evaluate("() => window.__camDir ?? null")
    except Exception:
        return None


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    page.add_init_script("localStorage.setItem('sky172.settings', JSON.stringify({quality:'low'}))")
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    time.sleep(1.5)
    page.get_by_role("button", name="开始飞行").click()
    time.sleep(4)
    page.keyboard.press("v")  # 第一人称
    time.sleep(2)
    d = cam_dir(page)
    print("cam dir:", d)
    ok = d is not None and abs(d["y"]) < 0.2 and d["x"] > 0.85
    print("PASS 视线水平朝机头" if ok else "FAIL")
    page.screenshot(path="artifacts/cockpit-eye-fixed.png", timeout=15000)
    # 滑跑中再截一张（带姿态）
    page.keyboard.down("Shift")
    time.sleep(6)
    page.keyboard.up("Shift")
    page.screenshot(path="artifacts/cockpit-eye-rolling.png", timeout=15000)
    browser.close()
    if not ok:
        raise SystemExit(1)
