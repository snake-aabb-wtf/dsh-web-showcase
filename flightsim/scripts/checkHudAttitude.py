# -*- coding: utf-8 -*-
"""第三人称 HUD 姿态仪验证：chase 可见且画布非空白，cockpit 隐藏"""
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"


def att_visible(page):
    return page.locator(".hud-attitude").evaluate("el => getComputedStyle(el).display") != "none"


def att_painted(page):
    return page.eval_on_selector(
        ".hud-attitude canvas",
        "el => { const c = document.createElement('canvas'); c.width = el.width; c.height = el.height; "
        "const ctx = c.getContext('2d'); ctx.drawImage(el, 0, 0); const d = ctx.getImageData(0, 0, c.width, c.height).data; "
        "let n = 0; for (let i = 0; i < d.length; i += 40) if (d[i] > 40) n++; return n > 300; }",
    )


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    page.add_init_script("localStorage.setItem('sky172.settings', JSON.stringify({quality:'low'}))")
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    time.sleep(1.5)
    page.get_by_role("button", name="开始飞行").click()
    time.sleep(4)

    v1 = att_visible(page)
    p1 = att_painted(page)
    print("chase: visible=%s painted=%s" % (v1, p1))
    ok1 = v1 and p1
    print("PASS 第三人称显示姿态仪且已绘制" if ok1 else "FAIL")

    page.keyboard.press("v")
    time.sleep(1.5)
    v2 = att_visible(page)
    print("cockpit: visible=%s" % v2)
    ok2 = not v2
    print("PASS 第一人称隐藏小姿态仪" if ok2 else "FAIL")

    page.screenshot(path="artifacts/hud-attitude-chase.png", timeout=15000)
    page.keyboard.press("v")
    time.sleep(1)
    page.screenshot(path="artifacts/hud-attitude-cockpit.png", timeout=15000)

    real = [e for e in errors if "favicon" not in e.lower()]
    print("console errors: %d" % len(real))
    ok3 = len(real) == 0
    print("PASS 控制台无 error" if ok3 else "FAIL " + "; ".join(real[:3]))

    browser.close()
    if not (ok1 and ok2 and ok3):
        raise SystemExit(1)
