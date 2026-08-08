#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Страница-образец «Заявки компании» — журнал рейсов.

Оформление берётся из ../_kit/build.py: цвета, шрифты, шапка, тикер и
карточки описаны там один раз на все страницы.
"""
import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.join(HERE, os.pardir, "_kit", "build.py")

# Дизайн-язык (цвета, шрифты, шапка, тикер, карточки) описан один раз в _kit —
# страницы берут его оттуда, поэтому не могут разъехаться между собой.
os.environ.setdefault("LC_OUT", os.path.join(HERE, os.pardir, "finance-hub"))
spec = importlib.util.spec_from_file_location("ref", KIT)
ref = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ref)

icon, NBSP = ref.icon, ref.NBSP   # icon() читает _kit/icons

# Подписи и цвета статусов — как в приложении (lib/vocabulary + StatusPill).
STATUS = {
    "PENDING": ("Ожидает", "#fff4e5", "#b45309"),
    "ASSIGNED": ("Назначен", "#e8f0fe", "#1d4ed8"),
    "EN_ROUTE_PICKUP": ("Едет на погрузку", "#e6f6fb", "#0e7490"),
    "LOADING": ("Погрузка", "#f3e8ff", "#7e22ce"),
    "IN_TRANSIT": ("В пути", "#e0f2fe", "#0369a1"),
    "AT_DELIVERY": ("На выгрузке", "#ecfccb", "#3f6212"),
    "COMPLETED": ("Завершён", "#e7f8ef", "#15803d"),
    "PROBLEM": ("Проблема", "#fee2e2", "#dc2626"),
}
# Значок статуса: цветной он один, подпись остаётся обычным текстом.
STATUS_ICON = {
    "PENDING": "clock",
    "ASSIGNED": "circle-dot",
    "EN_ROUTE_PICKUP": "route",
    "LOADING": "package-plus",
    "IN_TRANSIT": "truck",
    "AT_DELIVERY": "package-open",
    "COMPLETED": "circle-check",
    "PROBLEM": "circle-alert",
}

# Знак внутри залитого кружка — белый, поэтому линии простые и толстые.
STATUS_GLYPH = {
    "PENDING": "clock",
    "ASSIGNED": "user-round",
    "EN_ROUTE_PICKUP": "arrow-right",
    "LOADING": "arrow-down",
    "IN_TRANSIT": "truck",
    "AT_DELIVERY": "arrow-up",
    "COMPLETED": "check",
    "PROBLEM": None,          # восклицательный знак рисуем сами
}
EXCLAIM = ('<svg class="st3-glyph" viewBox="0 0 24 24" fill="none" '
           'stroke="currentColor" stroke-width="3.2" stroke-linecap="round">'
           '<path d="M12 6.5v7"/><path d="M12 18h.01"/></svg>')

# Доля пути, пройденная к моменту статуса — как STATUS_PROGRESS в приложении.
PROGRESS = {"PENDING": 0, "ASSIGNED": 5, "EN_ROUTE_PICKUP": 15, "LOADING": 25,
            "IN_TRANSIT": 60, "AT_DELIVERY": 85, "COMPLETED": 100, "PROBLEM": 45}

# status, №, создан, погрузка, откуда, куда, заказчик, долг заказчика,
# перевозчик, долг перед перевозчиком, водитель, номер машины, менеджер,
# ставка заказчика, ставка перевозчика, счёт
ORDERS = [
    ("IN_TRANSIT", "000000042", "04.08", "05.08", "Алматы", "Астана",
     "ТОО «КазТрансЛогистик»", False, "ИП Сериков А.", True,
     "Сериков А.", "123 ABC 02", "Ахметова Д.", 620000, 470000, "АВ-00010042"),
    ("PROBLEM", "000000041", "04.08", "05.08", "Шымкент", "Караганда",
     "ТОО «Магнум Дистрибуция»", True, "ТОО «Алтын Жол»", True,
     "Жумабаев Д.", "456 KZ 01", "Ахметова Д.", 540000, 430000, None),
    ("AT_DELIVERY", "000000040", "03.08", "04.08", "Астана", "Костанай",
     "АО «КазМунайСервис»", False, "ТОО «Барыс Транс»", False,
     "Ким В.", "777 AA 02", "Нурланов Б.", 380000, 290000, "АВ-00010040"),
    ("ASSIGNED", "000000039", "03.08", "06.08", "Актобе", "Атырау",
     "ТОО «Каспий Нефть Сервис»", False, "ИП Оспанов Р.", False,
     "Оспанов Р.", "012 BCD 04", "Нурланов Б.", 450000, 350000, None),
    ("PENDING", "000000038", "02.08", "07.08", "Павлодар", "Алматы",
     "ТОО «Астана Строй Групп»", False, "—", False,
     None, None, "Ахметова Д.", 510000, None, None),
    ("LOADING", "000000037", "02.08", "02.08", "Тараз", "Шымкент",
     "ИП Досжанов", False, "ТОО «Алтын Жол»", False,
     "Абилов С.", "345 XYZ 08", "Сапаров Е.", 210000, 160000, "АВ-00010037"),
    ("EN_ROUTE_PICKUP", "000000036", "01.08", "02.08", "Караганда", "Астана",
     "ТОО «КазТрансЛогистик»", False, "ИП Сериков А.", True,
     "Сериков А.", "123 ABC 02", "Сапаров Е.", 180000, 130000, None),
    ("COMPLETED", "000000035", "29.07", "30.07", "Алматы", "Усть-Каменогорск",
     "ТОО «Магнум Дистрибуция»", True, "ТОО «Барыс Транс»", False,
     "Ким В.", "777 AA 02", "Ахметова Д.", 740000, 560000, "АВ-00010035"),
    ("COMPLETED", "000000034", "28.07", "29.07", "Атырау", "Актобе",
     "АО «КазМунайСервис»", False, "ИП Оспанов Р.", False,
     "Оспанов Р.", "012 BCD 04", "Нурланов Б.", 420000, 320000, "АВ-00010034"),
    ("COMPLETED", "000000033", "27.07", "28.07", "Астана", "Алматы",
     "ТОО «Каспий Нефть Сервис»", False, "ТОО «Алтын Жол»", False,
     "Жумабаев Д.", "456 KZ 01", "Сапаров Е.", 650000, 500000, "АВ-00010033"),
]

FILTERS_ON = [("Статус", "В пути"), ("Заказчик", "КазТрансЛогистик"),
              ("Откуда", "Алматы")]


def money(v):
    if v is None:
        return None
    return "{:,}".format(v).replace(",", NBSP)


def initials(name):
    parts = name.replace(".", "").split()
    return (parts[0][0] + (parts[1][0] if len(parts) > 1 else "")).upper()


def slug(code):
    return "s-" + code.lower().replace("_", "-")


def _lighten(hex_color, lightness=0.68):
    """Тот же оттенок, но светлее — для тёмной темы."""
    import colorsys
    r, g, b = (int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5))
    h, l, sat = colorsys.rgb_to_hls(r, g, b)
    r, g, b = colorsys.hls_to_rgb(h, lightness, min(1.0, sat * 0.9))
    return "#%02x%02x%02x" % (round(r * 255), round(g * 255), round(b * 255))


def _rgba(hex_color, a):
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    return "rgba(%d,%d,%d,%s)" % (r, g, b, a)


def status_css():
    """Плашка и полоса прогресса каждого статуса — в двух темах."""
    out = []
    for code, (label, bg, fg) in STATUS.items():
        d = _lighten(fg)
        out.append(".%s{color:%s}" % (slug(code), fg))
        out.append(".bar .%s{background:%s}" % (slug(code), fg))
        out.append("html[data-theme='dark'] .%s{color:%s}" % (slug(code), d))
        out.append("html[data-theme='dark'] .bar .%s{background:%s}" % (slug(code), d))
    return "".join(out)


# BADGE=pill — пилюля с залитым кружком и белым знаком внутри (по умолчанию),
# dot — только цветной значок без пилюли, outline — значок в рамке.
BADGE = os.environ.get("LC_BADGE", "pill")


def pill(code):
    label = STATUS[code][0]
    if BADGE == "pill":
        g = STATUS_GLYPH[code]
        glyph = icon(g, "st3-glyph") if g else EXCLAIM
        return ('<span class="st3 %s"><span class="st3-dot">%s</span>'
                '<span class="st3-l">%s</span></span>' % (slug(code), glyph, label))
    return ('<span class="st2 %s %s">%s<span class="st2-l">%s</span></span>'
            % (slug(code), BADGE, icon(STATUS_ICON[code], "st2-ic"), label))


COLS = os.environ.get("LC_COLS", "all")   # all — как в приложении, slim — сжатый


def build_rows_all():
    """Тот же набор и порядок столбцов, что в приложении: 13 штук."""
    out = []
    for (code, num, created, pickup, frm, to, cust, cust_debt, carr, carr_debt,
         drv, plate, mgr, price, cost, invoice) in ORDERS:
        invoice_cell = ('<span class="inv">№%s%s</span>' % (NBSP, invoice)
                        if invoice else '<span class="inv-no">не выставлен</span>')
        out.append(
            '<tr%s>'
            '<td>%s</td>'
            '<td><span class="num tnum">%s</span></td>'
            '<td><span class="dim tnum">%s</span></td>'
            '<td><span class="tnum">%s</span></td>'
            '<td><span class="cell%s">%s</span></td>'
            '<td><span class="cell%s">%s</span></td>'
            '<td>%s</td>'
            '<td><span class="tnum plate">%s</span></td>'
            '<td><span class="route">%s<span class="arr">→</span>%s</span>'
            '<span class="bar"><i class="%s" style="width:%d%%"></i></span></td>'
            '<td><span class="mgr">%s</span></td>'
            '<td class="r"><span class="in tnum">%s</span></td>'
            '<td class="r"><span class="out2 tnum">%s</span></td>'
            '<td>%s</td>'
            '<td class="r">%s</td>'
            "</tr>"
            % (' class="problem"' if code == "PROBLEM" else "",
               pill(code), num, created, pickup,
               " debt" if cust_debt else "", cust,
               " debt" if carr_debt else "", carr,
               ('<span class="who"><span class="ava-sm">%s</span>'
                '<span class="who-l">%s</span></span>' % (initials(drv), drv))
               if drv else '<span class="dash">—</span>',
               plate or "—",
               frm, to, slug(code), PROGRESS[code],
               mgr,
               money(price) or "—",
               money(cost) or "—",
               invoice_cell, icon("chevron-right"))
        )
    return "\n".join(out)


def build_rows():
    out = []
    for (code, num, created, pickup, frm, to, cust, cust_debt, carr, carr_debt,
         drv, plate, mgr, price, cost, invoice) in ORDERS:
        margin = (price - cost) if (price and cost) else None
        driver_cell = (
            '<span class="who"><span class="ava-sm">%s</span>'
            '<span class="who-txt"><span class="who-l">%s</span>'
            '<span class="who-d tnum">%s</span></span></span>'
            % (initials(drv), drv, plate)) if drv else '<span class="dash">—</span>'
        invoice_cell = ('<span class="inv">№%s%s</span>' % (NBSP, invoice)
                        if invoice else '<span class="inv-no">не выставлен</span>')
        out.append(
            '<tr%s>'
            '<td>%s</td>'
            '<td><span class="num tnum">%s</span>'
            '<span class="sub tnum">создан %s</span></td>'
            '<td><span class="tnum">%s</span></td>'
            '<td><span class="route">%s<span class="arr">→</span>%s</span>'
            '<span class="bar"><i class="%s" style="width:%d%%"></i></span></td>'
            '<td><span class="side%s">%s</span>'
            '<span class="side-2%s">%s</span></td>'
            '<td>%s</td>'
            '<td><span class="mgr">%s</span></td>'
            '<td class="r"><span class="in tnum">%s</span>'
            '<span class="out tnum">%s</span>'
            '<span class="marg tnum">%s</span></td>'
            '<td>%s</td>'
            '<td class="r">%s</td>'
            "</tr>"
            % (' class="problem"' if code == "PROBLEM" else "",
               pill(code), num, created, pickup,
               frm, to, slug(code), PROGRESS[code],
               " debt" if cust_debt else "", cust,
               " debt" if carr_debt else "", carr,
               driver_cell, mgr,
               money(price) or "—",
               ("−" + money(cost)) if cost else "—",
               ("маржа " + money(margin)) if margin else "",
               invoice_cell, icon("chevron-right"))
        )
    return "\n".join(out)


FEATURED = dict(
    num="000000042", status="IN_TRANSIT",
    cargo="Металлопрокат · 18 500 кг · Тент",
    km=1213, left_km=480, eta="07.08 к 14:00",
    price=620000, cost=470000, invoice="АВ-00010042",
    customer="ТОО «КазТрансЛогистик»", carrier="ИП Сериков А.",
    manager="Ахметова Д.", carrier_debt=True,
    driver="Сериков Айдос", plate="123 ABC 02", phone="+7 701 234 56 78",
    points=[
        ("done", "Алматы", "ул. Рыскулова, 12 · склад №3", "05.08 09:40", "Погружено"),
        ("active", "В пути", "осталось ≈ 480 км", "сейчас", "Прогресс 60%"),
        ("", "Астана", "пр. Кабанбай батыра, 1", "07.08 к 14:00", "План прибытия"),
    ],
)


def route_map():
    """Схема маршрута: точки погрузки и выгрузки, машина на трассе.

    В приложении здесь живая карта MapLibre; в макете — та же композиция
    маркеров, чтобы было видно место и вид, а не пустой прямоугольник.
    """
    return """
<svg class="fmap-svg" viewBox="0 0 620 210" preserveAspectRatio="xMidYMid slice">
  <g class="fmap-grid">
    <path d="M-20 60 C120 30 260 92 400 66 S560 26 640 44"/>
    <path d="M-20 150 C140 128 240 178 420 150 S580 118 640 132"/>
    <path d="M90 -10 C120 60 96 140 130 220"/>
    <path d="M330 -10 C356 70 330 150 366 220"/>
    <path d="M520 -10 C544 60 520 140 552 220"/>
  </g>
  <path class="fmap-route" d="M70 156 C190 132 300 96 420 78 S520 62 556 56"/>
  <circle class="fmap-pt fmap-from" cx="70" cy="156" r="6"/>
  <circle class="fmap-pt fmap-to" cx="556" cy="56" r="6"/>
  <g transform="translate(372,86)">
    <circle class="fmap-truck-bg" r="16"/>
    <g transform="translate(-8,-8)">%s</g>
  </g>
</svg>""" % icon("truck", "fmap-truck")


def build_featured():
    f = FEATURED
    tl = "".join(
        '<div class="fstep %s"><i></i>'
        '<div class="fstep-b"><b>%s</b><span class="fstep-a">%s</span></div>'
        '<div class="fstep-t"><b class="tnum">%s</b><span>%s</span></div></div>'
        % (cls, city, addr, when, note) for cls, city, addr, when, note in f["points"])

    margin = f["price"] - f["cost"]
    facts = [
        ("Заказчик", f["customer"], ""),
        ("Ставка заказчика", money(f["price"]) + NBSP + "₸", "tnum"),
        ("Перевозчик", f["carrier"], "debt" if f["carrier_debt"] else ""),
        ("Ставка перевозчика", "−" + money(f["cost"]) + NBSP + "₸", "tnum out"),
        ("Маржа", money(margin) + NBSP + "₸", "tnum pos"),
        ("Счёт", "№" + NBSP + f["invoice"], "acc"),
    ]
    ff = "".join('<div><span>%s</span><b class="%s">%s</b></div>' % (k, cls, v)
                 for k, v, cls in facts)

    return """
  <section class="card featured">
    <div class="f-top">
      <div class="f-id">
        <span class="f-num tnum">%s</span>%s
        <span class="f-cargo">%s</span>
      </div>
      <div class="f-acts">
        <button class="btn sm">%s<span>Позвонить</span></button>
        <button class="btn sm">%s<span>WhatsApp</span></button>
        <button class="btn sm">%s<span>На карте</span></button>
        <button class="btn sm primary">Открыть заявку %s</button>
        <button class="btn sm iconly" aria-label="Свернуть карточку">%s</button>
      </div>
    </div>

    <div class="f-mid">
      <div class="f-route">
        <div class="f-timeline">%s</div>
        <div class="f-bar"><i class="%s" style="width:%d%%"></i></div>
        <div class="f-barsub"><span>Пройдено %d%% пути</span>
          <span class="tnum">прибытие %s</span></div>
      </div>
      <div class="f-mapwrap">
        <div class="fmap">%s
          <span class="fmap-km tnum">≈ %s км</span>
          <div class="fmap-driver">
            <span class="ava-md">%s</span>
            <span class="f-dr-txt"><b>%s</b>
              <span class="tnum">%s · %s</span></span>
          </div>
        </div>
      </div>
    </div>

    <div class="f-foot">%s</div>
  </section>
""" % (f["num"], pill(f["status"]), f["cargo"],
       icon("phone"), icon("message-circle"), icon("map-pinned"),
       icon("chevron-right"), icon("chevron-up"),
       tl, slug(f["status"]), PROGRESS[f["status"]], PROGRESS[f["status"]],
       f["eta"],
       route_map(), money(f["km"]), initials(f["driver"]), f["driver"],
       f["plate"], f["phone"], ff)


CSS = """
/* ── панель списка ─────────────────────────────────── */
/* Заголовок и кнопка на одной линии, страница начинается выше: над поиском
   стояло полтора пустых сантиметра. */
.page{padding-top:16px}
.hero{align-items:center;margin-bottom:12px}
h1{margin-top:4px}
.listbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  padding:11px 12px;border-bottom:1px solid var(--border-2)}
/* Что именно отобрано — словами справа, вместо ряда плашек-фильтров. */
.fnote{font-size:11.5px;color:var(--fg-3)}
.fnote b{color:var(--fg-2);font-weight:600;font-variant-numeric:tabular-nums}
.fclear{font-size:11.5px;color:var(--neg);text-decoration:underline;
  text-decoration-color:color-mix(in srgb,var(--neg) 35%,transparent);
  text-underline-offset:2px}
.btn.iconly{padding:0;width:34px;justify-content:center}
.btn.sm.iconly{width:30px}
.tabs{display:flex;border:1px solid var(--border);border-radius:999px;padding:3px;
  background:var(--surface);box-shadow:var(--shadow)}
.tabs button{display:inline-flex;align-items:center;gap:7px;padding:5px 13px;
  border-radius:999px;font-size:12.5px;font-weight:500;color:var(--fg-2)}
.tabs button.on{background:var(--primary);color:var(--primary-fg);font-weight:600}
.tabs em{font-style:normal;font-size:11px;font-weight:600;opacity:.55;
  font-variant-numeric:tabular-nums}

/* ── таблица ───────────────────────────────────────── */
.tablecard{overflow:hidden}
table{width:100%;border-collapse:collapse}
thead th{text-align:left;font-size:10.5px;font-weight:600;letter-spacing:.06em;
  text-transform:uppercase;color:var(--fg-3);padding:9px 10px;
  background:var(--surface-2);border-bottom:1px solid var(--border-2);white-space:nowrap}
thead th.r{text-align:right}
tbody td{padding:8px 10px;border-bottom:1px solid var(--border-2);vertical-align:middle;
  font-size:12.5px}
tbody tr:last-child td{border-bottom:0}
tbody tr:hover{background:var(--hover)}
tbody tr.problem td:first-child{box-shadow:inset 2px 0 0 var(--neg)}
td.r{text-align:right}
.dash{color:var(--fg-3)}
.st2{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;
  font-size:12px;font-weight:550}
.st2-ic{width:14px;height:14px;flex:none}
.st2-l{color:var(--fg)}
.st2.outline{padding:2px 9px 2px 7px;border:1px solid var(--border);border-radius:999px;
  font-size:11.5px}

/* Пилюля статуса: цвет несёт залитый кружок, знак внутри белый, подпись —
   обычным текстом. Так статус читается и по форме знака, а не только по цвету. */
.st3{display:inline-flex;align-items:center;gap:7px;padding:2px 10px 2px 3px;
  border:1px solid var(--border);border-radius:999px;background:var(--surface);
  font-size:11.5px;font-weight:550;white-space:nowrap}
.st3-dot{width:17px;height:17px;border-radius:50%;background:currentColor;flex:none;
  display:grid;place-items:center;
  /* Блик: светлее сверху, мягкая тень снизу — кружок читается как капля
     стекла. Это единственное «украшение» в таблице, поэтому оно тихое. */
  background-image:linear-gradient(180deg,rgba(255,255,255,.38),rgba(255,255,255,0) 62%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 0 -1px 0 rgba(0,0,0,.12),
    0 1px 2px rgba(16,24,40,.22)}
html[data-theme='dark'] .st3-dot{
  background-image:linear-gradient(180deg,rgba(255,255,255,.3),rgba(255,255,255,0) 62%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 1px 2px rgba(0,0,0,.4)}
.st3-glyph{width:11px;height:11px;color:#fff;stroke-width:3}
html[data-theme='dark'] .st3-glyph{color:var(--bg)}
.st3-l{color:var(--fg)}
.num{display:block;font-size:12.5px;font-weight:600;letter-spacing:-.01em;
  font-variant-numeric:tabular-nums}
.sub{display:block;font-size:10.5px;color:var(--fg-3);margin-top:1px}
.route{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:550;
  white-space:nowrap}
.route .arr{color:var(--fg-3);font-weight:400}
.bar{display:block;height:3px;border-radius:2px;background:var(--border-2);margin-top:6px;
  overflow:hidden}
.bar i{display:block;height:100%;border-radius:2px}
.side{display:block;font-size:12.5px;font-weight:550;line-height:1.3;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px}
.side-2{display:block;font-size:11px;color:var(--fg-3);line-height:1.35;margin-top:1px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px}
.side.debt,.side-2.debt{color:var(--neg);font-weight:600}
.who{display:inline-flex;align-items:center;gap:8px;min-width:0}
.ava-sm{width:26px;height:26px;border-radius:50%;flex:none;display:grid;place-items:center;
  background:var(--surface-2);border:1px solid var(--border);font-size:10px;font-weight:600;
  color:var(--fg-2)}
.who-txt{min-width:0}
.who-l{display:block;font-size:12.5px;font-weight:550;line-height:1.3}
.who-d{display:block;font-size:10.5px;color:var(--fg-3);line-height:1.35}
.mgr{font-size:12px;color:var(--fg-2)}
.in{display:block;font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums}
.out{display:block;font-size:11.5px;color:var(--fg-3);font-variant-numeric:tabular-nums;
  margin-top:1px}
.marg{display:block;font-size:10.5px;color:var(--pos);font-variant-numeric:tabular-nums;
  margin-top:2px}
.inv{font-size:11.5px;font-weight:600;color:var(--accent);white-space:nowrap}
.inv-no{font-size:11px;color:var(--fg-3)}
tbody td .ic{color:var(--fg-3);opacity:.5}

/* ── режим «как в приложении»: 13 столбцов, прокрутка вбок ─── */
.tscroll{overflow-x:auto}
.tscroll table{min-width:1400px}
/* Статус и кнопка перехода прибиты к краям, как fixed:'left'/'right' в
   приложении: иначе при прокрутке вбок теряется и то, и другое. */
.tscroll th:first-child,.tscroll td:first-child{position:sticky;left:0;z-index:2;
  background:var(--surface);box-shadow:1px 0 0 var(--border-2)}
.tscroll th:last-child,.tscroll td:last-child{position:sticky;right:0;z-index:2;
  background:var(--surface);box-shadow:-1px 0 0 var(--border-2)}
.tscroll thead th:first-child,.tscroll thead th:last-child{background:var(--surface-2)}
.tscroll tbody tr:hover td:first-child,.tscroll tbody tr:hover td:last-child{
  background:var(--hover)}
.tscroll tbody tr.problem td:first-child{box-shadow:inset 2px 0 0 var(--neg),
  1px 0 0 var(--border-2)}
.cell{display:block;font-size:12px;line-height:1.3;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;max-width:130px}
.cell.debt{color:var(--neg);font-weight:600}
.dim{font-size:11px;color:var(--fg-3)}
.plate{font-size:12px}
.out2{font-size:12.5px;font-weight:600;color:var(--neg);font-variant-numeric:tabular-nums}
.tscroll .who{gap:7px}
.tscroll .who-l{font-size:12px;white-space:nowrap}
.tscroll td{white-space:nowrap}

/* ── подвал таблицы ────────────────────────────────── */
.tfoot{display:flex;align-items:center;gap:10px;padding:10px 14px;
  border-top:1px solid var(--border-2);background:var(--surface-2)}
.tfoot .cnt{font-size:11.5px;color:var(--fg-3);font-variant-numeric:tabular-nums}
.pager{margin-left:auto;display:flex;align-items:center;gap:4px}
.pager button{min-width:26px;height:26px;padding:0 7px;border-radius:8px;font-size:12px;
  font-weight:550;color:var(--fg-2);border:1px solid transparent;
  font-variant-numeric:tabular-nums}
.pager button.on{background:var(--primary);color:var(--primary-fg);font-weight:600}
.pager button.nav{color:var(--fg-3)}
.perpage{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 9px;
  border:1px solid var(--border);border-radius:8px;font-size:11.5px;color:var(--fg-2)}

/* ── карточка рейса ────────────────────────────────── */
.featured{margin-bottom:14px;overflow:hidden}
.f-top{display:flex;align-items:center;gap:14px;padding:12px 16px;
  background:var(--surface-2);border-bottom:1px solid var(--border-2);flex-wrap:wrap}
.f-id{display:flex;align-items:center;gap:11px;min-width:0;flex-wrap:wrap}
.f-num{font-size:17px;font-weight:650;letter-spacing:-.02em}
.f-cargo{font-size:12px;color:var(--fg-3);padding-left:11px;
  border-left:1px solid var(--border)}
.f-acts{margin-left:auto;display:flex;align-items:center;gap:7px}
.btn.sm{height:30px;padding:0 11px;font-size:12px;border-radius:9px}
.btn.sm svg{width:14px;height:14px}

.f-mid{display:grid;grid-template-columns:1.15fr 1fr;gap:0}
.f-route{padding:14px 16px 15px;border-right:1px solid var(--border-2)}
.f-timeline{display:flex;flex-direction:column}
.fstep{display:flex;align-items:flex-start;gap:11px;padding:0 0 12px;position:relative}
.fstep:last-child{padding-bottom:0}
.fstep i{width:10px;height:10px;border-radius:50%;flex:none;margin-top:3px;
  border:2px solid var(--border);background:var(--surface);z-index:1}
.fstep:not(:last-child)::before{content:'';position:absolute;left:4px;top:13px;bottom:0;
  width:2px;background:var(--border-2)}
.fstep.done i{background:var(--fg-3);border-color:var(--fg-3)}
.fstep.active i{background:var(--accent);border-color:var(--accent);
  box-shadow:0 0 0 3px var(--accent-soft)}
.fstep-b{min-width:0;flex:1}
.fstep-b b{display:block;font-size:13px;font-weight:600;line-height:1.25}
.fstep-a{display:block;font-size:11px;color:var(--fg-3);margin-top:1px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fstep-t{text-align:right;flex:none}
.fstep-t b{display:block;font-size:12px;font-weight:600;line-height:1.25}
.fstep-t span{display:block;font-size:10.5px;color:var(--fg-3);margin-top:1px}
.f-bar{height:5px;border-radius:3px;background:var(--border-2);margin:13px 0 0;
  overflow:hidden}
.f-bar i{display:block;height:100%;border-radius:3px;background:currentColor}
.f-barsub{display:flex;justify-content:space-between;gap:10px;margin-top:6px;
  font-size:11px;color:var(--fg-3)}

.f-mapwrap{padding:14px 16px 15px}
.fmap{position:relative;height:100%;min-height:168px;border-radius:12px;
  overflow:hidden;background:var(--surface-2);border:1px solid var(--border-2)}
.fmap-svg{width:100%;height:100%;display:block}
.fmap-grid path{fill:none;stroke:var(--border);stroke-width:1.5}
.fmap-route{fill:none;stroke:var(--accent);stroke-width:2.5;stroke-linecap:round}
.fmap-pt{stroke:var(--surface);stroke-width:2.5}
.fmap-from{fill:var(--accent)}
.fmap-to{fill:var(--neg)}
.fmap-truck-bg{fill:var(--fg);stroke:var(--surface);stroke-width:2.5}
.fmap-truck{width:16px;height:16px;color:var(--surface)}
.fmap-km{position:absolute;top:8px;left:8px;padding:2px 7px;border-radius:7px;
  font-size:10.5px;font-weight:600;color:var(--fg-2);
  background:color-mix(in srgb,var(--surface) 78%,transparent);
  backdrop-filter:blur(3px)}
/* Водитель лежит на карте: он относится к машине, которая там же и едет. */
.fmap-driver{position:absolute;left:8px;right:8px;bottom:8px;display:flex;
  align-items:center;gap:9px;padding:7px 9px;border-radius:10px;
  background:color-mix(in srgb,var(--surface) 88%,transparent);
  border:1px solid var(--border);backdrop-filter:blur(6px)}
.ava-md{width:30px;height:30px;border-radius:50%;flex:none;display:grid;
  place-items:center;background:var(--accent);color:#fff;font-size:11.5px;
  font-weight:600}
.f-dr-txt{min-width:0;flex:1}
.f-dr-txt b{display:block;font-size:12.5px;font-weight:600;line-height:1.25;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.f-dr-txt>span{display:block;font-size:11px;color:var(--fg-3);line-height:1.3;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.f-foot{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;padding:11px 16px 12px;
  border-top:1px solid var(--border-2);background:var(--surface-2)}
.f-foot span{display:block;font-size:10px;font-weight:600;letter-spacing:.06em;
  text-transform:uppercase;color:var(--fg-3)}
.f-foot b{display:block;font-size:12.5px;font-weight:600;margin-top:3px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.f-foot b.debt{color:var(--neg)}
.f-foot b.out{color:var(--fg-2)}
.f-foot b.pos{color:var(--pos)}
.f-foot b.acc{color:var(--accent)}

/* ── свёрнутая карточка рейса ──────────────────────── */
.fold{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 12px;
  border:1px solid var(--border);border-radius:999px;background:var(--surface);
  font-size:11.5px;font-weight:550;color:var(--fg-2);box-shadow:var(--shadow);
  margin-bottom:14px}
.fold svg{width:14px;height:14px;color:var(--fg-3)}
"""


def html(theme):
    base = ref.html(theme)
    if COLS == "all":
        head_cells = [
            ("Статус", ""), ("№", ""), ("Дата", ""), ("Дата погр.", ""),
            ("Заказчик", ""), ("Перевозчик", ""), ("Водитель", ""),
            ("Транспорт", ""), ("Маршрут", ""), ("Менеджер", ""),
            ("Ставка зак.", "r"), ("Ставка перев.", "r"), ("Счёт", ""), ("", "r"),
        ]
        body = build_rows_all()
    else:
        head_cells = [
            ("Статус", ""), ("Номер", ""), ("Погрузка", ""), ("Маршрут", ""),
            ("Заказчик и перевозчик", ""), ("Водитель и машина", ""),
            ("Менеджер", ""), ("Ставки", "r"), ("Счёт", ""), ("", "r"),
        ]
        body = build_rows()
    thead = "".join('<th class="%s">%s</th>' % (cls, t) for t, cls in head_cells)

    page = """
  <div class="hero">
    <div>
      <div class="eyebrow">Заявки · журнал</div>
      <h1>Заявки компании</h1>
    </div>
    <button class="btn primary">%s<span>Создать заявку</span></button>
  </div>

  %s

  <section class="card tablecard">
    <div class="listbar">
      <div class="tabs">
        <button class="on">Все заявки <em>37</em></button>
        <button>Архив <em>12</em></button>
      </div>
      <div class="searchbox">%s<span>Номер, город, заказчик…</span>
        <span class="kbd">⌘K</span></div>
      <button class="btn">%s<span>Фильтры</span><em class="fcount">3</em></button>
      <button class="btn iconly" aria-label="Сортировка">%s</button>
      <span class="fnote">Отобрано <b>10</b> из 37 ·
        <button class="fclear">сбросить</button></span>
    </div>
    <div class="%s"><table><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>
    <div class="tfoot">
      <span class="cnt">Показаны 1–10 из 37</span>
      <div class="pager">
        <button class="nav">%s</button>
        <button class="on">1</button><button>2</button><button>3</button><button>4</button>
        <button class="nav">%s</button>
      </div>
      <span class="perpage">10 на странице %s</span>
    </div>
  </section>
""" % (icon("plus"),
       build_featured(),
       icon("search"), icon("sliders-horizontal"), icon("arrow-up-down"),
       "tscroll" if COLS == "all" else "",
       thead, body,
       icon("chevron-left"), icon("chevron-right"), icon("chevron-down"))

    # подменяем содержимое страницы и активный пункт навигации, оформление общее
    start = base.index('<main class="page">') + len('<main class="page">')
    end = base.index("</main>")
    out = base[:start] + page + base[end:]
    out = out.replace('<a href="#" class="on">Финансы</a>', '<a href="#">Финансы</a>')
    out = out.replace('<a href="#">Заявки</a>', '<a href="#" class="on">Заявки</a>')
    out = out.replace("<title>Финансы — LogiCore</title>",
                      "<title>Заявки — LogiCore</title>")
    extra = (CSS + status_css() + ".listbar .searchbox{width:300px}"
             ".fcount{font-style:normal;font-size:10.5px;font-weight:700;"
             "color:var(--primary-fg);background:var(--primary);border-radius:999px;"
             "padding:1px 6px}")
    return out.replace("</style>", extra + "</style>")


SUF = ("" if COLS == "all" else "-slim") + ("" if BADGE == "pill" else "-" + BADGE)

for th in ("light", "dark"):
    name = "reference%s-%s.html" % (SUF, th)
    with open(os.path.join(HERE, name), "w", encoding="utf-8") as f:
        f.write(html(th))
    print("собрано:", name)
