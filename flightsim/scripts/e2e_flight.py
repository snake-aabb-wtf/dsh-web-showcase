"""
轻量级飞行验证探针：加载 ?autopilot=1（6 倍仿真加速），
由内置自动驾驶完成 起飞→爬升→失速改出→返场→软着陆 全序列，
读取 window.__autopilotReport 断言。全程约 2-3 分钟，不依赖键盘时序。
"""
import os
import sys
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173/?autopilot=1&ap_speed=6"
ART = os.path.join(os.path.dirname(__file__), "..", "artifacts")
os.makedirs(ART, exist_ok=True)
console_errors = []
page_errors = []


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1024, "height": 576})
        page.add_init_script("localStorage.setItem('sky172.settings', JSON.stringify({quality:'low'}))")
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.goto(BASE)
        page.wait_for_load_state("networkidle")
        time.sleep(2)
        page.keyboard.press("F1")  # 打开调试面板，便于过程采样
        last_state = ""
        shot1 = False
        report = None
        t0 = time.time()
        while time.time() - t0 < 300:
            try:
                report = page.evaluate("() => window.__autopilotReport ?? null")
            except Exception:
                report = None
            if report and report.get("done"):
                break
            try:
                txt = page.eval_on_selector(".debug-panel pre", "el => el.textContent")
                phase = page.evaluate("() => window.__apPhase ?? '?'")
                if txt != last_state:
                    last_state = txt
                    print(f"  [状态 {phase}] {txt.replace(chr(10), ' | ')}")
            except Exception:
                pass
            if not shot1 and time.time() - t0 > 15:
                try:
                    page.screenshot(path=os.path.join(ART, "ap-early.png"), timeout=10000)
                except Exception:
                    pass
                shot1 = True
            time.sleep(3)

        if report and report.get("done"):
            print(f"[探针] 自动驾驶序列完成，共 {len(report['checks'])} 项检查：")
            fails = 0
            for c in report["checks"]:
                print(f"  {'PASS' if c['pass'] else 'FAIL'}  {c['name']}  ({c['detail']})")
                if not c["pass"]:
                    fails += 1
            print(f"[探针] 结果: {len(report['checks']) - fails}/{len(report['checks'])} 通过")
            ok = fails == 0
        else:
            print("[探针] 超时：自动驾驶序列未完成")
            ok = False

        # 截图（无论成败）
        for name in ["ap-final.png", "ap-cockpit.png"]:
            try:
                page.keyboard.press("v") if name == "ap-cockpit.png" else None
                time.sleep(1)
                page.screenshot(path=os.path.join(ART, name), timeout=12000)
            except Exception:
                pass

        real_errors = [e for e in console_errors if "favicon" not in e.lower()]
        print(f"[探针] 控制台 error: {len(real_errors)}，页面异常: {len(page_errors)}")
        if real_errors:
            print("  " + "; ".join(real_errors[:4]))
        if page_errors:
            print("  " + "; ".join(page_errors[:4]))
        browser.close()

    if not ok or real_errors or page_errors:
        sys.exit(1)
    print("飞行验证探针: 全部通过")


if __name__ == "__main__":
    main()
