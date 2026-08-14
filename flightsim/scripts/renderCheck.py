# -*- coding: utf-8 -*-
"""渲染确认：第三人称观察修复后的飞机模型（无 console error + 截图存档）"""
import os
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5174"
ART = os.path.join(os.path.dirname(__file__), "..", "artifacts")
os.makedirs(ART, exist_ok=True)
errors = []
page_errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    page.add_init_script("localStorage.setItem('sky172.settings', JSON.stringify({quality:'low'}))")
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: page_errors.append(str(e)))
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.get_by_role("button", name="开始飞行").click()
    time.sleep(5)
    page.keyboard.down("Shift")
    time.sleep(8)
    page.keyboard.up("Shift")
    for i in range(3):
        time.sleep(1)
        page.screenshot(path=os.path.join(ART, "model-fix-%d.png" % i), timeout=15000)
    page.keyboard.press("v")
    time.sleep(1.5)
    page.screenshot(path=os.path.join(ART, "model-fix-cockpit.png"), timeout=15000)
    real = [e for e in errors if "favicon" not in e.lower()]
    print("console errors: %d" % len(real))
    for e in real[:5]:
        print(" ", e)
    print("page errors: %d" % len(page_errors))
    for e in page_errors[:5]:
        print(" ", e)
    print("screenshots saved to artifacts/model-fix-*.png")
    browser.close()
