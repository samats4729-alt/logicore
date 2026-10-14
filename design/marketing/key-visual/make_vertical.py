#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Из горизонтального kv.tpl.html делает вертикальный чёрно-белый kv-vertical.tpl.html (9:16)."""
import os, re
HERE = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(HERE, "kv.tpl.html"), encoding="utf-8").read()

R = [
    # фон и свечения — нейтральные, без синего
    ("rgba(22,119,255,.20), transparent 62%", "rgba(255,255,255,.07), transparent 62%"),
    ("rgba(22,119,255,.10), transparent 60%", "rgba(255,255,255,.04), transparent 60%"),
    (".brand span{color:#3b8bff}", ".brand span{color:rgba(255,255,255,.42)}"),
    ("linear-gradient(92deg,#fff 0%,#9cc3ff 55%,#3b8bff 100%)", "linear-gradient(180deg,#fff 0%,#c9cbd0 55%,#7d828c 100%)"),
    ("box-shadow:0 10px 40px rgba(59,139,255,.35)", "box-shadow:0 10px 40px rgba(255,255,255,.16)"),
    ("0 30px 80px rgba(22,119,255,.18)", "0 30px 80px rgba(255,255,255,.05)"),
    # график: выделенная неделя — чёрная, маржа — серая
    (".bw.hl .a{background:linear-gradient(#3b8bff,#1677ff)}", ".bw.hl .a{background:#0b0d12;box-shadow:0 0 0 3px rgba(11,13,18,.08)}"),
    (".bw.hl .b{background:#bcd6ff}", ".bw.hl .b{background:#9aa0aa}"),
    ('class="sq" style="background:#1677ff"', 'class="sq" style="background:#0b0d12"'),
    ('class="sq" style="background:#bcd6ff"', 'class="sq" style="background:#9aa0aa"'),
    (".prog i{display:block;height:100%;background:#1677ff", ".prog i{display:block;height:100%;background:#0b0d12"),
    ('<i style="background:#1677ff"></i>', '<i style="background:#0b0d12"></i>'),
    # карточка рейса на карте
    ("background:rgba(59,139,255,.16);color:#8fbcff", "background:rgba(255,255,255,.12);color:#fff"),
    ("background:#3b8bff;box-shadow:0 0 0 4px rgba(59,139,255,.25)", "background:#fff;box-shadow:0 0 0 4px rgba(255,255,255,.18)"),
    ('<stop offset="0" stop-color="#3b8bff"/><stop offset="1" stop-color="#9cc3ff"/>', '<stop offset="0" stop-color="#8d929b"/><stop offset="1" stop-color="#ffffff"/>'),
    ('<stop offset="0" stop-color="#3b8bff" stop-opacity=".55"/><stop offset="1" stop-color="#3b8bff" stop-opacity="0"/>',
     '<stop offset="0" stop-color="#ffffff" stop-opacity=".45"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>'),
    ('<circle cx="384" cy="28" r="9" fill="none" stroke="#ef4444" stroke-opacity=".4" stroke-width="5"/>',
     '<circle cx="384" cy="28" r="9" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="5"/>'),
    ('<circle cx="384" cy="28" r="5" fill="#ef4444"/>', '<circle cx="384" cy="28" r="5" fill="#0b0d12" stroke="#fff" stroke-width="2.5"/>'),
    # деньги: линия графика чёрная
    ('stop-color="#1677ff" stop-opacity=".22"', 'stop-color="#0b0d12" stop-opacity=".12"'),
    ('stop-color="#1677ff" stop-opacity="0"', 'stop-color="#0b0d12" stop-opacity="0"'),
    ('stroke="#1677ff" stroke-width="2.2" stroke-linejoin', 'stroke="#0b0d12" stroke-width="2.2" stroke-linejoin'),
    ('stroke="#1677ff" stroke-width="2.2"/>', 'stroke="#0b0d12" stroke-width="2.2"/>'),
    # фоновая линия маршрута
    ('stop-color="#3b8bff" stop-opacity="0"/><stop offset=".5" stop-color="#3b8bff" stop-opacity=".55"/><stop offset="1" stop-color="#9cc3ff" stop-opacity="0"',
     'stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"'),
    ('<radialGradient id="city"><stop offset="0" stop-color="#9cc3ff"/><stop offset="1" stop-color="#3b8bff" stop-opacity="0"/></radialGradient>', ''),
    # помощник
    (".ai .q .ic{color:#8fbcff}", ".ai .q .ic{color:#fff}"),
    # размер холста
    ("html,body{width:1920px;height:1080px;", "html,body{width:1080px;height:1920px;"),
    (".scene{position:relative;width:1920px;height:1080px;", ".scene{position:relative;width:1080px;height:1920px;"),
    ('<svg class="net" viewBox="0 0 1920 1080" width="1920" height="1080">', '<svg class="net" viewBox="0 0 1080 1920" width="1080" height="1920">'),
    ('M-40 1010 C 380 900, 520 1040, 900 880 S 1500 420, 1960 300', 'M-40 1780 C 260 1700, 380 1820, 620 1660 S 900 1220, 1120 1120'),
    # текст
    ('<div class="eyebrow"><b>2026</b>Платформа для экспедиторов и перевозчиков</div>',
     '<div class="eyebrow"><b>2026</b>Для экспедиторов, грузовладельцев и перевозчиков</div>'),
    ('<h1>Вся логистика<br><span class="acc">в одном окне</span></h1>',
     '<h1>Логистика<br><span class="acc">без хаоса</span></h1>'),
]
for a, b in R:
    assert a in s, "не найдено: " + a[:70]
    s = s.replace(a, b)

s = re.sub(r'<p class="lead">.*?</p>',
           '<p class="lead">От заявки до подписанного акта — в&nbsp;одной системе. '
           '<strong>Рейс на карте, деньги по каждой перевозке, документы сами.</strong></p>', s, flags=re.S)
s = s.replace('<div class="idx">(01 — Платформа)</div>', '<div class="idx">(01 — Платформа)</div>')

# вертикальная раскладка — перекрываем позиции в конце стилей
V = """
/* ───────── вертикаль 9:16 ───────── */
.scene{background:
    radial-gradient(760px 620px at 70% 52%, rgba(255,255,255,.075), transparent 64%),
    radial-gradient(900px 500px at 20% 0%, rgba(255,255,255,.05), transparent 60%),
    radial-gradient(1000px 700px at 50% 112%, rgba(255,255,255,.06), transparent 60%),
    #070708}
.grid{-webkit-mask-image:radial-gradient(900px 1000px at 55% 58%, #000 25%, transparent 75%)}
.brand{left:72px;top:80px;font-size:30px}
.idx{right:72px;top:90px}
.copy{left:72px;right:72px;width:auto;top:180px;bottom:auto;display:block}
h1{margin-top:34px;font-size:104px;line-height:1.0;letter-spacing:-.04em}
.lead{margin-top:30px;max-width:860px;font-size:25px;line-height:1.45}
.lead strong{display:block;margin-top:6px}
.cta{margin-top:38px}
.btn{height:60px;font-size:18px;padding:0 28px}
.stats{position:absolute;left:72px;right:72px;bottom:118px;margin:0;z-index:6;display:grid;grid-template-columns:repeat(3,1fr);
  border-top:1px solid rgba(255,255,255,.14);padding-top:30px}
.stat{padding-right:24px;margin-right:24px}
.stat .v{font-size:46px}
.stat .l{font-size:15px}
.feat{left:72px;right:72px;bottom:58px;justify-content:space-between;font-size:13.5px}

.stage{perspective:2200px;perspective-origin:60% 55%}
.win{left:150px;top:870px;width:1180px;height:760px;transform:rotateY(-12deg) rotateX(6deg) rotateZ(-2deg);transform-origin:100% 50%}
.toast{left:40px;top:830px;width:410px;transform:rotate(-2deg)}
.fin{left:700px;top:800px;width:310px;transform:rotate(3deg)}
.phone{left:584px;top:1000px;transform:rotate(5deg) scale(1.02)}
.mon{left:36px;top:1250px;width:480px;transform:rotate(-2deg)}
.net{display:none}
.ai{left:40px;top:1106px;width:300px;transform:rotate(-3deg);z-index:5}
"""
s = s.replace("</style>", V + "</style>", 1)
# цифры уходят из колонки текста вниз — переносим блок
m = re.search(r'\s*<div class="stats">.*?</div>\s*</div>\s*</div>', s, flags=re.S)
stats = m.group(0).strip()  # ровно блок .stats: подпись, плитка, сам блок
s = s.replace(m.group(0), "")
s = s.replace('<div class="feat">', stats + '\n<div class="feat">', 1)

left = re.findall(r"1677ff|3b8bff|9cc3ff|bcd6ff|8fbcff|59,139,255|22,119,255", s)
assert not left, left
open(os.path.join(HERE, "kv-vertical.tpl.html"), "w", encoding="utf-8").write(s)
print("ok")
