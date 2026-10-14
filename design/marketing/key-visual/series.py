#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Серия вертикальных картинок 9:16 (02–05) в чёрно-белом стиле kv-vertical.

Пишет series-02.tpl.html … series-05.tpl.html; дальше как обычно:
    python3 build.py series-02.tpl.html series-02.html
    node shot.mjs "$PWD/series-02.html" "$PWD/LogiCore_9x16_02_monitoring.png" 1080 1920 2
"""
import math, os, re

HERE = os.path.dirname(os.path.abspath(__file__))

# ───────── карта Казахстана точками ─────────
KZ = [(49.2, 46.4), (48.0, 46.7), (46.7, 48.3), (46.6, 49.1), (47.4, 50.3), (48.7, 50.6), (49.5, 51.2),
      (50.6, 51.7), (52.5, 51.6), (55.4, 50.6), (57.3, 51.1), (59.0, 50.6), (60.0, 51.0), (61.6, 51.3),
      (61.0, 52.0), (61.0, 53.0), (62.0, 53.9), (65.0, 54.6), (67.0, 54.9), (69.2, 55.4), (71.0, 54.6),
      (73.3, 54.0), (74.0, 53.5), (76.5, 54.2), (76.8, 53.3), (78.5, 52.5), (80.0, 51.3), (81.5, 50.8),
      (83.4, 51.0), (85.0, 50.0), (87.3, 49.2), (86.8, 48.5), (85.6, 47.1), (83.0, 47.2), (82.3, 45.5),
      (80.0, 45.0), (80.2, 44.0), (80.3, 42.9), (79.0, 42.7), (75.0, 42.9), (73.5, 42.4), (71.5, 42.6),
      (70.9, 42.2), (70.0, 41.5), (69.0, 41.2), (68.0, 41.0), (66.5, 41.9), (66.0, 43.0), (64.0, 43.6),
      (62.0, 43.5), (61.0, 44.4), (58.6, 45.6), (56.0, 45.0), (56.0, 41.3), (55.4, 41.3), (54.0, 42.3),
      (53.0, 42.1), (52.5, 41.8), (51.3, 43.2), (50.8, 44.3), (50.3, 44.6), (51.3, 45.3), (53.0, 45.3),
      (53.2, 46.3), (52.2, 46.6), (51.0, 47.0)]
CITIES = {
    "Алматы": (76.95, 43.25), "Астана": (71.45, 51.17), "Шымкент": (69.6, 42.32), "Караганда": (73.1, 49.8),
    "Актобе": (57.2, 50.28), "Атырау": (51.9, 47.1), "Павлодар": (76.95, 52.29), "Усть-Каменогорск": (82.6, 49.95),
    "Костанай": (63.6, 53.2), "Тараз": (71.37, 42.9), "Актау": (51.2, 43.65), "Кызылорда": (65.5, 44.85),
    "Уральск": (51.37, 51.23), "Семей": (80.25, 50.4), "Балхаш": (74.98, 46.85),
}
COS = math.cos(math.radians(48))


def proj(lon, lat, k, ox=0, oy=0):
    return (ox + (lon - 46.2) * COS * k, oy + (55.8 - lat) * k)


def inside(x, y, poly):
    c = False
    for i in range(len(poly)):
        x1, y1 = poly[i]; x2, y2 = poly[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def dotmap(k, step, r, fill):
    poly = [proj(lo, la, k) for lo, la in KZ]
    w = (87.6 - 46.2) * COS * k; h = (55.8 - 40.8) * k
    out = []
    y = step / 2
    while y < h:
        x = step / 2
        while x < w:
            if inside(x, y, poly):
                out.append('<circle cx="%.1f" cy="%.1f" r="%s"/>' % (x, y, r))
            x += step
        y += step
    return '<g fill="%s">%s</g>' % (fill, "".join(out)), w, h


def city(name, k):
    return proj(*CITIES[name], k)


def curve(a, b, k, bend=0.18):
    (x1, y1), (x2, y2) = city(a, k), city(b, k)
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    dx, dy = x2 - x1, y2 - y1
    cx, cy = mx - dy * bend, my + dx * bend
    return "M%.1f %.1f Q %.1f %.1f %.1f %.1f" % (x1, y1, cx, cy, x2, y2), (x1, y1, cx, cy, x2, y2)


def at(c, t):
    x1, y1, cx, cy, x2, y2 = c
    return ((1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t * t * x2, (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t * t * y2)


TRUCK = ('<g stroke="#0b0d12" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round">'
         '<path d="M10.5 13.5V4.5a1.5 1.5 0 0 0-1.5-1.5H3a1.5 1.5 0 0 0-1.5 1.5v8.25a.75.75 0 0 0 .75.75h1.5"/>'
         '<path d="M11.25 13.5H6.75"/><path d="M14.25 13.5h1.5a.75.75 0 0 0 .75-.75v-2.74a.75.75 0 0 0-.16-.47l-2.6-3.26a.75.75 0 0 0-.59-.28H10.5"/>'
         '<circle cx="12.75" cy="13.5" r="1.5"/><circle cx="5.25" cy="13.5" r="1.5"/></g>')


def monitoring_map(k=34.0):
    dots, w, h = dotmap(k, 13, 2.1, "rgba(255,255,255,.17)")
    routes = [("Алматы", "Астана", .6, "ЗК-2607", True), ("Шымкент", "Алматы", .55, "ЗК-2610", False),
              ("Актобе", "Атырау", .7, "ЗК-2612", False), ("Павлодар", "Караганда", .45, "ЗК-2613", False),
              ("Костанай", "Астана", .5, "ЗК-2609", False), ("Усть-Каменогорск", "Семей", .5, "ЗК-2611", False)]
    g = []
    for a, b, t, no, main in routes:
        d, c = curve(a, b, k, .16 if main else .12)
        g.append('<path d="%s" stroke="rgba(255,255,255,%s)" stroke-width="%s" stroke-dasharray="2 6" stroke-linecap="round" fill="none"/>'
                 % (d, ".35" if main else ".22", "2.4" if main else "1.6"))
        # пройденная часть
        n = 24; pts = [at(c, t * i / n) for i in range(n + 1)]
        g.append('<path d="M%s" stroke="%s" stroke-width="%s" stroke-linecap="round" fill="none"/>'
                 % (" L".join("%.1f %.1f" % p for p in pts), "url(#rtw)" if main else "rgba(255,255,255,.7)", "3.6" if main else "2.2"))
    for a, b, t, no, main in routes:
        _, c = curve(a, b, k, .16 if main else .12)
        x, y = at(c, t)
        if main:
            g.append('<circle cx="%.1f" cy="%.1f" r="34" fill="url(#glw)"/><circle cx="%.1f" cy="%.1f" r="16" fill="#fff"/>'
                     '<g transform="translate(%.1f %.1f)">%s</g>' % (x, y, x, y, x - 9, y - 9, TRUCK))
            g.append('<g transform="translate(%.1f %.1f)"><rect width="150" height="30" rx="15" fill="#fff"/>'
                     '<text x="14" y="20" fill="#0b0d12" font-family="Inter" font-size="13" font-weight="700">%s</text>'
                     '<text x="82" y="20" fill="#5f6672" font-family="Inter" font-size="12.5">в пути</text></g>' % (x + 24, y - 15, no))
        else:
            g.append('<circle cx="%.1f" cy="%.1f" r="7" fill="#fff" stroke="rgba(11,13,18,.9)" stroke-width="3"/>' % (x, y))
            g.append('<text x="%.1f" y="%.1f" fill="rgba(255,255,255,.75)" font-family="Inter" font-size="13" font-weight="600">%s</text>' % (x + 13, y + 5, no))
    labels = []
    for nm in ["Астана", "Алматы", "Шымкент", "Караганда", "Актобе", "Атырау", "Павлодар", "Костанай", "Семей", "Балхаш", "Актау", "Уральск", "Кызылорда"]:
        x, y = city(nm, k)
        labels.append('<circle cx="%.1f" cy="%.1f" r="3" fill="rgba(255,255,255,.55)"/>'
                      '<text x="%.1f" y="%.1f" fill="rgba(255,255,255,.42)" font-family="Inter" font-size="13">%s</text>' % (x, y, x + 8, y - 8, nm))
    defs = ('<defs><linearGradient id="rtw" x1="0" x2="1"><stop offset="0" stop-color="#8d929b"/><stop offset="1" stop-color="#fff"/></linearGradient>'
            '<radialGradient id="glw"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>')
    return '<svg width="%d" height="%d" viewBox="0 0 %d %d">%s%s%s%s</svg>' % (w, h, w, h, defs, dots, "".join(labels), "".join(g))


def bg_map():
    dots, w, h = dotmap(30, 14, 1.6, "rgba(255,255,255,.07)")
    return '<svg class="bgmap" width="%d" height="%d" viewBox="0 0 %d %d">%s</svg>' % (w, h, w, h, dots)


# ───────── общее оформление серии ─────────
BASE_CSS = r"""
/*FONTS*/
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1920px;overflow:hidden;background:#070708}
body{font-family:Inter,system-ui,sans-serif;color:#0b0d12;-webkit-font-smoothing:antialiased;font-feature-settings:"cv11","ss01"}
.ic{display:block;flex:none}
.num{font-variant-numeric:tabular-nums}
.scene{position:relative;width:1080px;height:1920px;overflow:hidden;background:
  radial-gradient(760px 620px at 62% 58%, rgba(255,255,255,.075), transparent 64%),
  radial-gradient(900px 500px at 20% 0%, rgba(255,255,255,.05), transparent 60%),
  radial-gradient(1000px 700px at 50% 112%, rgba(255,255,255,.06), transparent 60%),#070708}
.grid{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.07) 1px, transparent 1.2px);background-size:28px 28px;
  -webkit-mask-image:radial-gradient(900px 1000px at 55% 60%, #000 25%, transparent 75%)}
.grain{position:absolute;inset:0;opacity:.05;mix-blend-mode:overlay;z-index:9;pointer-events:none;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}
.brand{position:absolute;left:72px;top:80px;z-index:6;font:700 30px/1 Unbounded;color:#fff;letter-spacing:-.02em}
.brand span{color:rgba(255,255,255,.42)}
.idx{position:absolute;right:72px;top:90px;z-index:6;font:500 13px/1 Inter;color:rgba(255,255,255,.42);letter-spacing:.14em;text-transform:uppercase}
.copy{position:absolute;left:72px;right:72px;top:180px;z-index:6;color:#fff}
.eyebrow{display:inline-flex;align-items:center;gap:10px;height:36px;padding:0 16px 0 8px;border-radius:999px;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);font:500 14px/1 Inter;color:rgba(255,255,255,.82)}
.eyebrow b{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:999px;background:#fff;color:#0b0d12;font:600 12px/1 Inter}
h1{margin-top:34px;font:700 100px/1.0 Unbounded;letter-spacing:-.04em;color:#fff}
h1 .acc{background:linear-gradient(180deg,#fff 0%,#c9cbd0 55%,#7d828c 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.lead{margin-top:30px;max-width:900px;font:400 25px/1.45 Inter;color:rgba(255,255,255,.62);letter-spacing:-.005em}
.lead strong{display:block;margin-top:6px;color:#fff;font-weight:500}
.stats{position:absolute;left:72px;right:72px;bottom:118px;z-index:6;display:grid;grid-template-columns:repeat(3,1fr);
  border-top:1px solid rgba(255,255,255,.14);padding-top:30px;color:#fff}
.stat{padding-right:24px;margin-right:24px;border-right:1px solid rgba(255,255,255,.10)}
.stat:last-child{border:0;margin:0;padding:0}
.stat .v{font:700 46px/1 Unbounded;letter-spacing:-.03em}
.stat .v small{font-size:22px;color:rgba(255,255,255,.55);margin-left:6px;letter-spacing:0}
.stat .l{margin-top:12px;font:400 15px/1.35 Inter;color:rgba(255,255,255,.5)}
.feat{position:absolute;left:72px;right:72px;bottom:58px;z-index:6;display:flex;justify-content:space-between;align-items:center;font:500 13.5px/1 Inter;color:rgba(255,255,255,.34)}
.feat i{width:3px;height:3px;border-radius:50%;background:rgba(255,255,255,.25)}
.feat .on{color:#fff}
.bgmap{position:absolute;z-index:1}

.fl{position:absolute;z-index:3}
.glass{background:rgba(18,19,22,.74);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(22px) saturate(140%);-webkit-backdrop-filter:blur(22px) saturate(140%);
  border-radius:24px;color:#fff;box-shadow:0 40px 90px -10px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.08)}
.wcard{background:#fff;border-radius:22px;box-shadow:0 0 0 1px rgba(11,13,18,.06),0 40px 90px -16px rgba(0,0,0,.7),0 12px 30px rgba(0,0,0,.25)}
.pill{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px 0 7px;border:1px solid #e7e8ec;border-radius:999px;font-size:12.5px;color:#3c414b;white-space:nowrap;background:#fff}
.pill .ic{color:#8a909b}
.pill.ok .ic{color:#16a34a}
.pill.wait .ic{color:#ea8a0c}
.toast{display:flex;gap:12px;align-items:center;padding:14px 16px}
.toast .ico{width:42px;height:42px;border-radius:13px;background:#0b0d12;color:#fff;display:grid;place-items:center;flex:none}
.toast .t{font-size:14.5px;font-weight:600;letter-spacing:-.01em}
.toast .s{font-size:12.5px;color:#5f6672;margin-top:3px}
.toast .tm{margin-left:auto;align-self:flex-start;font-size:11.5px;color:#a2a7b0;white-space:nowrap}
.glass.toast .ico{background:#fff;color:#0b0d12}
.glass.toast .s{color:rgba(255,255,255,.55)}
.glass.toast .tm{color:rgba(255,255,255,.4)}

/* телефон */
.phone{width:330px;height:690px;border-radius:54px;background:#0b0d12;padding:10px;
  box-shadow:0 0 0 1.5px #2a2d35,0 0 0 4px #0b0d12,0 70px 120px -20px rgba(0,0,0,.9),0 30px 60px rgba(0,0,0,.45)}
.scr{position:relative;width:100%;height:100%;border-radius:45px;overflow:hidden;background:#fff;color:#0b0d12;padding:48px 14px 0}
.notch{position:absolute;top:11px;left:50%;transform:translateX(-50%);width:96px;height:28px;border-radius:20px;background:#0b0d12;z-index:2}
.sbar{position:absolute;top:16px;left:28px;right:26px;display:flex;font:600 13px Inter;z-index:2}
.sbar .r{margin-left:auto}
.nav{position:absolute;left:18px;right:18px;bottom:16px;height:60px;border-radius:999px;background:#0b0d12;display:flex;align-items:center;justify-content:space-around;padding:0 8px}
.nav span{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;color:rgba(255,255,255,.55)}
.nav span.on{background:#fff;color:#0b0d12}
.ph-h{display:flex;align-items:center;gap:10px;padding:2px 4px 12px}
.ph-h .t{font:700 22px/1.1 Inter;letter-spacing:-.025em}
.ph-h .s{font-size:11.5px;color:#8a909b;margin-top:3px}
.ph-h .rb{margin-left:auto;width:36px;height:36px;border-radius:50%;background:#f2f3f5;display:grid;place-items:center;color:#3c414b}
"""

PAGE = """<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>LogiCore — %(title)s</title>
<style>%(base)s
%(css)s</style></head>
<body><div class="scene">
<div class="grid"></div>
%(bg)s
<div class="brand">Logi<span>Core</span></div>
<div class="idx">%(idx)s</div>
<div class="copy">
  <div class="eyebrow"><b>LogiCore</b>%(eyebrow)s</div>
  <h1>%(h1)s</h1>
  <p class="lead">%(lead)s</p>
</div>
%(body)s
<div class="stats">%(stats)s</div>
<div class="feat">%(feat)s</div>
<div class="grain"></div>
</div></body></html>
"""

FEAT = ["Заявки", "Биржа грузов", "GPS-мониторинг", "Финансы", "Документы", "Приложение водителя"]


def page(slug, title, idx, eyebrow, h1, lead, stats, body, css, on, bg="", h1size=None):
    if h1size:
        css += "\nh1{font-size:%dpx}" % h1size
    st = "".join('<div class="stat"><div class="v">%s%s</div><div class="l">%s</div></div>'
                 % (v, ("<small>%s</small>" % s) if s else "", l) for v, s, l in stats)
    feat = "<i></i>".join('<span class="on">%s</span>' % f if f == on else "<span>%s</span>" % f for f in FEAT)
    html = PAGE % dict(title=title, base=BASE_CSS, css=css, bg=bg, idx=idx, eyebrow=eyebrow, h1=h1, lead=lead,
                       body=body, stats=st, feat=feat)
    left = re.findall(r"1677ff|3b8bff|9cc3ff|bcd6ff|8fbcff|59,139,255|22,119,255", html)
    assert not left, (slug, left)
    open(os.path.join(HERE, "series-%s.tpl.html" % slug), "w", encoding="utf-8").write(html)
    print("ok", slug)


# ═════════ 02 — Мониторинг ═════════
MON_CSS = """
.mapc{left:36px;top:690px;width:1008px;padding:22px 24px 18px;transform:rotate(-1.2deg)}
.mapc .hd{display:flex;align-items:center;gap:10px}
.mapc .hd .t{font:600 19px Inter;letter-spacing:-.015em}
.mapc .hd .live{display:flex;align-items:center;gap:7px;font-size:13px;color:rgba(255,255,255,.55);margin-left:4px}
.mapc .hd .live i{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.2)}
.mapc .chips{margin-left:auto;display:flex;gap:6px}
.mapc .chips span{height:30px;display:inline-flex;align-items:center;gap:7px;padding:0 12px;border-radius:999px;font-size:12.5px;color:rgba(255,255,255,.7);border:1px solid rgba(255,255,255,.12)}
.mapc .chips span b{color:#fff;font-weight:600}
.mapc .chips span.on{background:#fff;color:#0b0d12;border-color:#fff}
.mapc .chips span.on b{color:#0b0d12}
.mapc .mp{margin-top:16px;border-radius:18px;background:#0d0e11;border:1px solid rgba(255,255,255,.06);padding:12px 6px 6px;overflow:hidden}
.trip{left:540px;top:1256px;width:490px;padding:20px;transform:rotate(2deg)}
.trip .hd{display:flex;align-items:center;gap:10px}
.trip .no{font:700 20px Inter;letter-spacing:-.02em}
.trip .hd .r{margin-left:auto;font-size:12.5px;color:#8a909b}
.tl{margin-top:16px;display:grid;grid-template-columns:22px 1fr auto;column-gap:12px;row-gap:0}
.tl .d{width:12px;height:12px;border-radius:50%;background:#0b0d12;margin:4px auto 0}
.tl .d.now{background:#fff;border:3px solid #0b0d12;width:14px;height:14px}
.tl .d.o{background:#fff;border:2px solid #c3c6cc}
.tl .ln{width:2px;height:34px;background:#0b0d12;margin:4px auto}
.tl .ln.g{background:repeating-linear-gradient(#c3c6cc 0 4px,transparent 4px 8px)}
.tl .p{font:600 15px Inter;letter-spacing:-.01em}
.tl .p div{font:400 12.5px Inter;color:#8a909b;margin-top:3px}
.tl .w{font:600 13.5px Inter;text-align:right}
.tl .w div{font:400 11.5px Inter;color:#8a909b;margin-top:3px}
.bar{margin-top:14px;height:6px;border-radius:3px;background:#eef0f2;overflow:hidden}
.bar i{display:block;width:60%;height:100%;background:#0b0d12;border-radius:3px}
.bl{display:flex;justify-content:space-between;margin-top:8px;font-size:12px;color:#8a909b}
.bl b{color:#0b0d12}
.t1{left:40px;top:1372px;width:470px;transform:rotate(-2deg)}
.t2{left:58px;top:1486px;width:440px;transform:rotate(-1deg)}
"""
mon_body = """
<div class="fl glass mapc">
  <div class="hd"><span class="t">Мониторинг</span><span class="live"><i></i>GPS · сейчас</span>
    <span class="chips"><span class="on">Все <b>27</b></span><span>В пути <b>21</b></span><span>Погрузка <b>4</b></span><span>Проблема <b>1</b></span></span></div>
  <div class="mp">%s</div>
</div>
<div class="fl wcard trip">
  <div class="hd"><span class="no">ЗК-2607</span><span class="pill">{{i:loader:13}}В пути</span><span class="r">Ерлан К. · 123 ABC 02</span></div>
  <div class="tl">
    <div><div class="d"></div><div class="ln"></div></div><div class="p">Алматы<div>погружено, склад №3</div></div><div class="w">13.10, 09:40<div>по графику</div></div>
    <div><div class="d now"></div><div class="ln g"></div></div><div class="p">Под Балхашом<div>78 км/ч · трасса A-3</div></div><div class="w">сейчас<div>60%% пути</div></div>
    <div><div class="d o"></div></div><div class="p">Астана<div>пр. Кабанбай батыра, 1</div></div><div class="w">16.10 к 14:00<div>план прибытия</div></div>
  </div>
  <div class="bar"><i></i></div>
  <div class="bl"><span>Пройдено <b>720 км</b></span><span>Осталось <b>≈ 480 км</b></span></div>
</div>
<div class="fl wcard toast t1"><span class="ico">{{i:package-open:19}}</span><div><div class="t">Погрузка завершена</div><div class="s">ЗК-2610 · Шымкент → Алматы · водитель отметил</div></div><span class="tm">2 мин</span></div>
<div class="fl glass toast t2"><span class="ico">{{i:map-pin:19}}</span><div><div class="t">ЗК-2612 прибыл на выгрузку</div><div class="s">Атырау · раньше плана на 40 минут</div></div><span class="tm">сейчас</span></div>
""" % monitoring_map()

page("02", "мониторинг", "(02 — Мониторинг)", "GPS-мониторинг рейсов",
     'Где машина?<br><span class="acc">Уже видно</span>',
     'Каждый рейс на карте — у логиста и руководителя. Статусы от погрузки до выгрузки водитель отмечает в приложении. '
     '<strong>Без звонков «ну что, где едешь?».</strong>',
     [("1", "карта", "все машины компании<br>на одном экране"), ("60%", "", "пройденный путь<br>и время прибытия"), ("0", "", "звонков водителю,<br>чтобы узнать, где груз")],
     mon_body, MON_CSS, "GPS-мониторинг")


# ═════════ 03 — Деньги ═════════
def spark(points, w=200, h=44, color="#0b0d12", fill=True, last=True):
    mx, mn = max(points), min(points)
    xs = [i * w / (len(points) - 1) for i in range(len(points))]
    ys = [h - 4 - (p - mn) / (mx - mn or 1) * (h - 10) for p in points]
    line = " L".join("%.1f %.1f" % (x, y) for x, y in zip(xs, ys))
    s = '<svg width="%d" height="%d" viewBox="0 0 %d %d">' % (w, h, w, h)
    if fill:
        s += '<path d="M%s L%d %d L0 %d Z" fill="rgba(11,13,18,.06)"/>' % (line, w, h, h)
    s += '<path d="M%s" fill="none" stroke="%s" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' % (line, color)
    if last:
        s += '<circle cx="%.1f" cy="%.1f" r="3.6" fill="#fff" stroke="%s" stroke-width="2"/>' % (xs[-1] - 1, ys[-1], color)
    return s + "</svg>"


def bars(vals, w=200, h=44, hl=True):
    n = len(vals); bw = w / n - 4; mx = max(vals)
    s = '<svg width="%d" height="%d" viewBox="0 0 %d %d">' % (w, h, w, h)
    for i, v in enumerate(vals):
        bh = v / mx * (h - 4)
        c = "#0b0d12" if (hl and i == n - 1) else "#d6d8dd"
        s += '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="2.5" fill="%s"/>' % (i * (bw + 4), h - bh, bw, bh, c)
    return s + "</svg>"


FIN_CSS = """
.fin{left:44px;top:606px;width:992px;padding:24px 24px 22px;transform:rotate(-1deg)}
.fin .hd{display:flex;align-items:center}
.fin h3{font:600 24px Inter;letter-spacing:-.025em}
.fin .hd p{font-size:13px;color:#5f6672;margin-top:5px}
.seg{margin-left:auto;display:flex;background:#f1f2f4;border-radius:11px;padding:3px}
.seg span{height:32px;padding:0 14px;display:flex;align-items:center;font-size:13px;color:#5f6672;border-radius:9px}
.seg span.on{background:#fff;color:#0b0d12;font-weight:600;box-shadow:0 1px 3px rgba(11,13,18,.1)}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:20px}
.tile{border:1px solid #e7e8ec;border-radius:16px;padding:16px 16px 12px;box-shadow:0 1px 2px rgba(11,13,18,.04)}
.tile .l{display:flex;align-items:center;font-size:13px;color:#5f6672}
.tile .l .b{margin-left:auto;font-size:11.5px;font-weight:600;border-radius:999px;padding:3px 8px;background:#f1f2f4;color:#0b0d12}
.tile .l .b.g{background:#ecfdf3;color:#16a34a}
.tile .v{font:700 26px/1 Inter;letter-spacing:-.03em;margin-top:12px}
.tile .s{font-size:12px;color:#8a909b;margin-top:5px}
.tile svg{display:block;margin-top:10px}
.acts2{display:flex;gap:8px;margin-top:16px}
.acts2 span{height:36px;display:inline-flex;align-items:center;gap:8px;padding:0 14px;border-radius:10px;border:1px solid #e7e8ec;font-size:13px;font-weight:500}
.acts2 span.p{background:#0b0d12;color:#fff;border-color:#0b0d12}
.calc{left:36px;top:1150px;width:460px;padding:20px;transform:rotate(-2.2deg)}
.calc .hd{display:flex;align-items:center;gap:10px}
.calc .no{font:700 19px Inter;letter-spacing:-.02em}
.calc .hd span.m{font-size:12.5px;color:#8a909b;margin-left:auto}
.calc .r{display:flex;align-items:baseline;padding:13px 0;border-bottom:1px solid #f0f1f3;font-size:14px;color:#5f6672}
.calc .r b{margin-left:auto;font-size:16px;color:#0b0d12;font-weight:600}
.calc .tot{display:flex;align-items:center;margin-top:14px;background:#0b0d12;color:#fff;border-radius:16px;padding:14px 16px}
.calc .tot .l{font-size:13px;color:rgba(255,255,255,.6)}
.calc .tot .v{font:700 26px Inter;letter-spacing:-.03em;margin-top:4px}
.calc .tot .pc{margin-left:auto;font:700 15px Inter;background:#fff;color:#0b0d12;border-radius:999px;padding:6px 12px}
.cal{left:530px;top:1186px;width:500px;padding:20px 20px 12px;transform:rotate(2deg)}
.cal .hd{display:flex;align-items:center;gap:10px;font:600 17px Inter}
.cal .hd span{margin-left:auto;font:400 12.5px Inter;color:rgba(255,255,255,.5)}
.cal .it{display:grid;grid-template-columns:52px 1fr auto;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.08)}
.cal .it:last-child{border:0}
.cal .dt{background:rgba(255,255,255,.07);border-radius:12px;text-align:center;padding:6px 0;font:700 18px/1 Inter}
.cal .dt div{font:500 10.5px Inter;color:rgba(255,255,255,.5);margin-top:3px;text-transform:uppercase}
.cal .w{font-size:14px;font-weight:500}
.cal .w div{font-size:12px;color:rgba(255,255,255,.5);margin-top:3px}
.cal .a{font:600 15.5px Inter}
.cal .a.in{color:#fff}
.cal .a.out{color:rgba(255,255,255,.5)}
.paid{left:540px;top:1514px;width:450px;transform:rotate(-1.5deg)}
"""
fin_body = """
<div class="fl wcard fin">
  <div class="hd"><div><h3>Деньги и документы компании</h3><p>Показатели за октябрь, графики — за 12 месяцев</p></div>
    <div class="seg"><span>Сегодня</span><span class="on">Месяц</span><span>Квартал</span><span>Год</span></div></div>
  <div class="tiles">
    <div class="tile"><div class="l">Выручка</div><div class="v num">48 600 000 ₸</div><div class="s">за период</div>%(s1)s</div>
    <div class="tile"><div class="l">Маржа <span class="b g">18,75%%</span></div><div class="v num">9 120 000 ₸</div><div class="s">заработок за период</div>%(s2)s</div>
    <div class="tile"><div class="l">Баланс</div><div class="v num">12 840 000 ₸</div><div class="s">касса и счета</div>%(s3)s</div>
    <div class="tile"><div class="l">Дебиторка</div><div class="v num">6 305 000 ₸</div><div class="s">ждём от заказчиков</div>%(s4)s</div>
    <div class="tile"><div class="l">Кредиторка</div><div class="v num">4 930 000 ₸</div><div class="s">должны перевозчикам</div>%(s5)s</div>
    <div class="tile"><div class="l">Рейсы с долгом <span class="b">долг</span></div><div class="v num">8</div><div class="s">заявок не оплачено</div>%(s6)s</div>
  </div>
  <div class="acts2"><span class="p">{{i:plus:15:2}} Выставить счёт</span><span>{{i:arrow-down-left:15}} Приход денег</span><span>{{i:arrow-up-right:15}} Расход денег</span><span>{{i:calendar-days:15}} Платёжный календарь</span></div>
</div>
<div class="fl wcard calc">
  <div class="hd"><span class="no">ЗК-2607</span><span class="pill ok">{{i:circle-check:13}}Завершён</span><span class="m">Алматы → Астана</span></div>
  <div class="r">Ставка заказчика<b class="num">620 000 ₸</b></div>
  <div class="r">Ставка перевозчика<b class="num">−470 000 ₸</b></div>
  <div class="tot"><div><div class="l">Маржа по рейсу</div><div class="v num">150 000 ₸</div></div><span class="pc">24,2%%</span></div>
</div>
<div class="fl glass cal">
  <div class="hd">{{i:calendar-days:18}} Платёжный календарь<span>эта неделя</span></div>
  <div class="it"><div class="dt">14<div>ср</div></div><div class="w">ТОО «КазТрансЛогистик»<div>счёт № 1187 · ждём оплату</div></div><div class="a in num">+1 320 000 ₸</div></div>
  <div class="it"><div class="dt">16<div>пт</div></div><div class="w">ИП Сериков А.<div>оплата перевозчику · ЗК-2607</div></div><div class="a out num">−470 000 ₸</div></div>
  <div class="it"><div class="dt">17<div>сб</div></div><div class="w">АО «Каспий Нефть Сервис»<div>счёт № 1192 · по договору</div></div><div class="a in num">+850 000 ₸</div></div>
</div>
<div class="fl wcard toast paid"><span class="ico">{{i:banknote:19}}</span><div><div class="t">Заказчик оплатил счёт № 1180</div><div class="s">ТОО «Астана Строй» · <b style="color:#0b0d12">+640 000 ₸</b></div></div><span class="tm">сейчас</span></div>
""" % dict(s1=spark([22, 25, 24, 29, 31, 30, 34, 36, 35, 40, 43, 48], 270, 40),
           s2=spark([4, 4.6, 4.3, 5.2, 5.8, 5.5, 6.4, 6.9, 6.6, 7.8, 8.2, 9.1], 270, 40),
           s3=spark([8, 9, 8.5, 9.6, 10, 9.4, 10.8, 11.2, 10.9, 11.8, 12.2, 12.8], 270, 40),
           s4=spark([7.2, 7.0, 7.4, 6.9, 7.1, 6.6, 6.8, 6.4, 6.5, 6.2, 6.4, 6.3], 270, 40),
           s5=spark([5.6, 5.4, 5.7, 5.2, 5.3, 5.0, 5.2, 4.9, 5.1, 4.8, 5.0, 4.9], 270, 40),
           s6=bars([12, 10, 11, 9, 11, 8, 10, 9, 7, 9, 8, 8], 270, 40))

page("03", "деньги", "(03 — Финансы)", "Финансы и взаиморасчёты",
     'Маржа<br><span class="acc">каждого рейса</span>',
     'Выручка, расходы и долги — по каждой перевозке, без сводных таблиц. '
     '<strong>Кто кому должен и когда придут деньги — на одном экране.</strong>',
     [("12", "мес.", "графики выручки<br>и маржи"), ("1", "экран", "кто кому должен<br>и когда"), ("1", "ссылка", "заказчику —<br>все его счета")],
     fin_body, FIN_CSS, "Финансы", h1size=84)


# ═════════ 04 — Документы ═════════
def sheet(title, no, rows, total, stamp=True):
    r = "".join('<tr><td>%d</td><td>%s</td><td class="n">%s</td></tr>' % (i + 1, a, b) for i, (a, b) in enumerate(rows))
    st = ('<div class="stamp"><svg width="112" height="112" viewBox="0 0 112 112"><circle cx="56" cy="56" r="52" fill="none" stroke="#8a909b" stroke-width="2"/>'
          '<circle cx="56" cy="56" r="38" fill="none" stroke="#8a909b" stroke-width="1.2"/>'
          '<path id="sc" d="M56 56 m-45 0 a45 45 0 1 1 90 0 a45 45 0 1 1 -90 0" fill="none"/>'
          '<text font-family="Inter" font-size="9.5" font-weight="600" fill="#8a909b" letter-spacing="2.2"><textPath href="#sc">ТОО «ЕВРАЗИЯ КАРГО» · АЛМАТЫ · БИН 190440012345 ·</textPath></text>'
          '<text x="56" y="53" text-anchor="middle" font-family="Unbounded" font-size="11" font-weight="700" fill="#8a909b">ЕВРАЗИЯ</text>'
          '<text x="56" y="67" text-anchor="middle" font-family="Unbounded" font-size="11" font-weight="700" fill="#8a909b">КАРГО</text></svg></div>') if stamp else ""
    return ('<div class="doc-in"><div class="dh"><div class="dt">%s</div><div class="dn">№ %s от 14.10.2026</div></div>'
            '<div class="pt"><span>Исполнитель</span><b>ТОО «Евразия Карго», БИН 190440012345</b></div>'
            '<div class="pt"><span>Заказчик</span><b>ТОО «КазТрансЛогистик», БИН 180340098765</b></div>'
            '<table><tr><th>№</th><th>Наименование</th><th class="n">Сумма, ₸</th></tr>%s</table>'
            '<div class="tot"><span>Итого</span><b>%s ₸</b></div>'
            '<div class="sg"><div><span>Исполнитель</span><i></i></div><div><span>Заказчик</span><i></i></div></div>%s</div>'
            % (title, no, r, total, st))


DOC_CSS = """
.doc{width:520px;height:720px;background:#fff;border-radius:10px;box-shadow:0 0 0 1px rgba(11,13,18,.06),0 50px 100px -20px rgba(0,0,0,.8),0 16px 40px rgba(0,0,0,.35)}
.doc-in{position:relative;padding:40px 38px;height:100%}
.dh{border-bottom:2px solid #0b0d12;padding-bottom:16px}
.dt{font:800 17px/1.25 Inter;letter-spacing:-.01em;text-transform:uppercase}
.dn{font-size:13px;color:#5f6672;margin-top:6px}
.pt{display:grid;grid-template-columns:100px 1fr;font-size:12px;margin-top:14px;gap:10px}
.pt span{color:#8a909b}
.pt b{font-weight:500}
table{width:100%;border-collapse:collapse;margin-top:22px;font-size:12px}
th{text-align:left;font-weight:600;color:#5f6672;padding:8px 6px;border-bottom:1px solid #e7e8ec;background:#f7f8f9}
td{padding:10px 6px;border-bottom:1px solid #f0f1f3}
.n{text-align:right;font-variant-numeric:tabular-nums}
.tot{display:flex;justify-content:flex-end;gap:24px;margin-top:14px;font-size:14px}
.tot b{font-weight:700}
.sg{position:absolute;left:38px;right:38px;bottom:52px;display:grid;grid-template-columns:1fr 1fr;gap:30px;font-size:11.5px;color:#8a909b}
.sg i{display:block;border-bottom:1px solid #c3c6cc;margin-top:28px}
.stamp{position:absolute;left:90px;bottom:28px;transform:rotate(-14deg);opacity:.9}
.d1{left:60px;top:740px;transform:rotate(-9deg)}
.d2{left:150px;top:712px;transform:rotate(-3deg)}
.d3{left:250px;top:700px;transform:rotate(3deg)}
.phone.p4{position:absolute;left:690px;top:900px;transform:rotate(6deg);z-index:4}
.cam{position:absolute;inset:0;background:radial-gradient(400px 400px at 50% 40%,#3a3c41,#151619)}
.cam .ttn{position:absolute;left:44px;top:150px;width:222px;height:300px;background:#f4f4f2;border-radius:4px;transform:rotate(-4deg);box-shadow:0 20px 40px rgba(0,0,0,.5);padding:18px 16px}
.cam .ttn b{display:block;font:800 11px Inter;letter-spacing:.02em}
.cam .ttn i{display:block;height:5px;border-radius:3px;background:#d4d5d8;margin-top:9px}
.cam .ttn i.s{width:60%}
.cam .ttn i.m{width:80%}
.cam .fr{position:absolute;left:32px;right:32px;top:130px;height:340px}
.cam .fr span{position:absolute;width:34px;height:34px;border:3px solid #fff}
.cam .fr .a{left:0;top:0;border-right:0;border-bottom:0;border-radius:12px 0 0 0}
.cam .fr .b{right:0;top:0;border-left:0;border-bottom:0;border-radius:0 12px 0 0}
.cam .fr .c{left:0;bottom:0;border-right:0;border-top:0;border-radius:0 0 0 12px}
.cam .fr .d{right:0;bottom:0;border-left:0;border-top:0;border-radius:0 0 12px 0}
.cam .hint{position:absolute;top:66px;left:0;right:0;text-align:center;color:#fff;font:600 15px Inter}
.cam .hint div{font:400 12px Inter;color:rgba(255,255,255,.6);margin-top:4px}
.cam .ok{position:absolute;left:50%;transform:translateX(-50%);top:488px;height:30px;display:flex;align-items:center;gap:6px;padding:0 12px;border-radius:999px;background:rgba(255,255,255,.14);color:#fff;font-size:12px;font-weight:600;white-space:nowrap}
.cam .shut{position:absolute;left:50%;bottom:40px;transform:translateX(-50%);width:74px;height:74px;border-radius:50%;border:4px solid #fff;display:grid;place-items:center}
.cam .shut i{width:58px;height:58px;border-radius:50%;background:#fff}
.cam .x{position:absolute;left:30px;bottom:60px;color:#fff;font-size:14px}
.cam .g{position:absolute;right:28px;bottom:56px;width:40px;height:40px;border-radius:10px;background:#d4d5d8;border:2px solid #fff}
.inbox{left:40px;top:1400px;width:500px;transform:rotate(-2deg);z-index:5}
.inbox .bt{display:flex;gap:6px;margin-top:10px}
.inbox .bt span{height:30px;display:inline-flex;align-items:center;padding:0 12px;border-radius:9px;font-size:12.5px;font-weight:600;border:1px solid #e7e8ec}
.inbox .bt span.p{background:#0b0d12;color:#fff;border-color:#0b0d12}
.inbox{align-items:flex-start}
.pdf{left:500px;top:1560px;width:370px;transform:rotate(2deg);z-index:5}
"""
doc_body = """
<div class="fl doc d1">%s</div>
<div class="fl doc d2">%s</div>
<div class="fl doc d3">%s</div>
<div class="phone p4"><div class="scr" style="padding:0">
  <div class="cam">
    <div class="hint">Фото документа<div>ТТН, накладная, акт · ЗК-2607</div></div>
    <div class="ttn"><b>ТОВАРНО-ТРАНСПОРТНАЯ НАКЛАДНАЯ</b><i></i><i class="m"></i><i class="s"></i><i></i><i class="m"></i><i></i><i class="s"></i><i class="m"></i><i></i><i class="s"></i><i></i><i class="m"></i></div>
    <div class="fr"><span class="a"></span><span class="b"></span><span class="c"></span><span class="d"></span></div>
    <div class="ok">{{i:check:14:2.4}} Документ в кадре · чётко</div>
    <span class="x">Отмена</span><div class="shut"><i></i></div><span class="g"></span>
  </div>
  <div class="notch"></div><div class="sbar" style="color:#fff"><span>9:41</span><span class="r">●●● ▮</span></div>
</div></div>
<div class="fl wcard toast inbox"><span class="ico">{{i:inbox:19}}</span><div><div class="t">Входящий счёт от перевозчика</div><div class="s">ИП Сериков А. · за ЗК-2607 · <b style="color:#0b0d12">470 000 ₸</b></div>
  <div class="bt"><span class="p">Принять</span><span>Отклонить</span></div></div><span class="tm">5 мин</span></div>
<div class="fl glass toast pdf"><span class="ico">{{i:file-check-2:19}}</span><div><div class="t">Акт № 2601 · PDF</div><div class="s">с печатью компании · готов к отправке</div></div></div>
""" % (sheet("Доверенность", "0412", [("Получение груза: металлопрокат, 18 т", "—"), ("Водитель: Кенжебаев Ерлан", "—")], "—", False),
       sheet("Счёт на оплату", "1187", [("Перевозка Алматы → Астана, ЗК-2607", "620 000"), ("Перевозка Шымкент → Алматы, ЗК-2610", "540 000"), ("Перевозка Астана → Караганда, ЗК-2611", "160 000")], "1 320 000", False),
       sheet("Акт выполненных работ (оказанных услуг)", "2601", [("Перевозка груза Алматы → Астана, заявка ЗК-2601", "620 000"), ("Тент 20 т, гос. номер 123 ABC 02", "")], "620 000"))

page("04", "документы", "(04 — Документы)", "Документооборот",
     'Документы<br><span class="acc">пишутся сами</span>',
     'Счета, акты, доверенности и договоры-заявки собираются из заявки —&nbsp;с&nbsp;реквизитами и&nbsp;печатью. '
     '<strong>Водитель снимает накладную прямо в рейсе.</strong>',
     [("4", "вида", "счёт, акт, доверенность,<br>договор-заявка"), ("PDF", "", "с печатью компании<br>в один клик"), ("1", "фото", "накладной из рейса —<br>сразу у диспетчера")],
     doc_body, DOC_CSS, "Документы")


# ═════════ 05 — Биржа ═════════
EX_CSS = """
.phone.p5{position:absolute;left:688px;top:640px;transform:rotate(5deg) scale(1.04);z-index:4}
.seg2{display:flex;background:#f2f3f5;border-radius:12px;padding:3px;margin:0 2px 12px}
.seg2 span{flex:1;height:32px;display:flex;align-items:center;justify-content:center;font-size:12.5px;color:#5f6672;border-radius:10px}
.seg2 span.on{background:#fff;color:#0b0d12;font-weight:600;box-shadow:0 1px 3px rgba(11,13,18,.1)}
.ld{background:#f2f3f5;border-radius:20px;padding:14px 14px 12px;margin-bottom:9px}
.ld .tp{display:flex;align-items:flex-start}
.ld .dt{font-size:12px;color:#5f6672;font-weight:500}
.ld .pr{margin-left:auto;text-align:right;font:700 17px/1 Inter;letter-spacing:-.02em}
.ld .pr div{font:400 10.5px Inter;color:#8a909b;margin-top:3px}
.ld .rt{font:600 16px Inter;letter-spacing:-.015em;margin-top:6px}
.ld .cg{font-size:11.5px;color:#8a909b;margin-top:4px}
.ld .bd{display:inline-flex;margin-top:8px;height:22px;align-items:center;padding:0 9px;border-radius:999px;background:#0b0d12;color:#fff;font-size:11px;font-weight:600}
.ld.hot{background:#0b0d12;color:#fff}
.ld.hot .dt,.ld.hot .cg,.ld.hot .pr div{color:rgba(255,255,255,.55)}
.ld.hot .bd{background:#fff;color:#0b0d12}
.offers{left:36px;top:690px;width:700px;padding:22px 22px 16px;transform:rotate(-2deg);z-index:5}
.offers .hd{display:flex;align-items:center;gap:10px}
.offers .hd .t{font:600 20px Inter;letter-spacing:-.02em}
.offers .hd .m{font-size:13px;color:#8a909b;margin-top:4px}
.offers .hd .c{margin-left:auto;font-size:12.5px;font-weight:600;background:#f1f2f4;border-radius:999px;padding:5px 11px}
.of{display:grid;grid-template-columns:44px 1fr auto auto;align-items:center;gap:14px;padding:14px 4px;border-bottom:1px solid #f0f1f3}
.of:last-child{border:0}
.of .av{width:44px;height:44px;border-radius:50%;background:#eceef1;display:grid;place-items:center;font:600 14px Inter;color:#3c414b}
.of .n{font:600 15px Inter;letter-spacing:-.01em}
.of .n div{font:400 12.5px Inter;color:#8a909b;margin-top:3px}
.of .p{text-align:right;font:700 18px Inter;letter-spacing:-.02em}
.of .p div{font:400 11.5px Inter;color:#8a909b;margin-top:3px}
.of .b{height:36px;display:inline-flex;align-items:center;padding:0 16px;border-radius:10px;font-size:13px;font-weight:600;border:1px solid #e7e8ec}
.of .b.p{background:#0b0d12;color:#fff;border-color:#0b0d12}
.split{left:56px;top:1100px;width:540px;padding:20px;transform:rotate(-1.5deg);z-index:5}
.split .t{font:600 16px Inter;display:flex;align-items:center;gap:8px}
.split .t span{margin-left:auto;font:400 12.5px Inter;color:rgba(255,255,255,.5)}
.sp-r{display:flex;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.08);font-size:13.5px;color:rgba(255,255,255,.62)}
.sp-r b{margin-left:auto;color:#fff;font-weight:600;font-size:15px}
.sp-tot{display:flex;align-items:center;margin-top:12px;background:#fff;color:#0b0d12;border-radius:14px;padding:12px 14px;font-size:13px}
.sp-tot b{margin-left:auto;font:700 21px Inter;letter-spacing:-.02em}
.chosen{left:540px;top:1448px;width:430px;transform:rotate(2deg);z-index:6}
"""
ex_body = """
<div class="phone p5"><div class="scr">
  <div class="notch"></div><div class="sbar"><span>9:41</span><span class="r">●●● ▮</span></div>
  <div class="ph-h"><div><div class="t">Биржа</div><div class="s">Тент · 20 т · рядом с Алматы</div></div><span class="rb">{{i:sliders-horizontal:17}}</span></div>
  <div class="seg2"><span class="on">Лента</span><span>Мои отклики</span><span>Рейсы</span></div>
  <div class="ld hot"><div class="tp"><span class="dt">завтра, 09:00</span><div class="pr num">400 000 ₸<div>на руки</div></div></div><div class="rt">Алматы → Астана</div><div class="cg">Тент · 20 т · металлопрокат</div><span class="bd">Вас выбрали</span></div>
  <div class="ld"><div class="tp"><span class="dt">16.10, 08:00</span><div class="pr num">310 000 ₸<div>на руки</div></div></div><div class="rt">Алматы → Шымкент</div><div class="cg">Тент · 18 т · стройматериалы</div><span class="bd">Вы откликнулись</span></div>
  <div class="ld"><div class="tp"><span class="dt">17.10, 07:30</span><div class="pr num">265 000 ₸<div>на руки</div></div></div><div class="rt">Алматы → Тараз</div><div class="cg">Борт · 10 т · оборудование</div></div>
  <div class="nav"><span>{{i:truck:20}}</span><span class="on">{{i:package-open:20}}</span><span>{{i:wallet:20}}</span><span>{{i:user-round:20}}</span></div>
</div></div>
<div class="fl wcard offers">
  <div class="hd"><div><div class="t">Отклики на рейс ЗК-2614</div><div class="m">Алматы → Астана · завтра, 09:00 · тент 20 т</div></div><span class="c">3 отклика</span></div>
  <div class="of"><span class="av">ЕК</span><div class="n">Ерлан К.<div>Тент 20 т · 123 ABC 02 · через парк</div></div><div class="p num">508 438 ₸<div>с налогами и топливом</div></div><span class="b p">Выбрать</span></div>
  <div class="of"><span class="av">АС</span><div class="n">Айдос С.<div>Тент 20 т · 456 KZ 01 · ИП</div></div><div class="p num">525 000 ₸<div>с налогами и топливом</div></div><span class="b">Выбрать</span></div>
  <div class="of"><span class="av">РО</span><div class="n">Руслан О.<div>Реф 18 т · 012 BCD 04 · ИП</div></div><div class="p num">541 000 ₸<div>с налогами и топливом</div></div><span class="b">Выбрать</span></div>
</div>
<div class="fl glass split">
  <div class="t">{{i:calculator:17}} Из чего цена<span>рейс ЗК-2614</span></div>
  <div class="sp-r">Водителю на руки<b class="num">400 000 ₸</b></div>
  <div class="sp-r">Топливо по маршруту<b class="num">120 000 ₸</b></div>
  <div class="sp-r">Налоги и комиссии — считает система<b class="num">учтены</b></div>
  <div class="sp-tot">Цена для компании<b class="num">508 438 ₸</b></div>
</div>
<div class="fl wcard toast chosen"><span class="ico">{{i:check:19:2.2}}</span><div><div class="t">Рейс уже в заявках</div><div class="s">ЗК-2614 · водитель назначен</div></div><span class="tm">сейчас</span></div>
"""

page("05", "биржа", "(05 — Биржа грузов)", "Биржа грузов и водители",
     'Груз сам<br><span class="acc">находит машину</span>',
     'Опубликуйте рейс — водители откликаются из приложения со своей ценой. '
     '<strong>Водитель видит сумму на руки, вы — полную цену с налогами.</strong>',
     [("1", "тап", "отклик водителя<br>из приложения"), ("2", "цены", "на руки — водителю,<br>полная — вам"), ("3", "шага", "опубликовали,<br>выбрали, поехали")],
     ex_body, EX_CSS, "Биржа грузов", h1size=84)
