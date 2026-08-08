#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Собирает статичный прототип страницы «Финансы» в стиле shadcn nova."""
import os
import re
import base64

HERE = os.path.dirname(os.path.abspath(__file__))


def icon(name, cls="ic"):
    p = os.path.join(HERE, "icons", name + ".svg")
    with open(p, encoding="utf-8") as f:
        s = f.read()
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S).strip()
    s = s.replace('class="lucide lucide-%s"' % name, 'class="%s"' % cls)
    s = re.sub(r'\bwidth="24"', 'width="16"', s)
    s = re.sub(r'\bheight="24"', 'height="16"', s)
    s = re.sub(r'stroke-width="2"', 'stroke-width="1.75"', s)
    if 'class="' not in s.split(">")[0]:
        s = s.replace("<svg", '<svg class="%s"' % cls, 1)
    return re.sub(r"\s+", " ", s)


def font(fn):
    with open(os.path.join(HERE, fn), "rb") as f:
        return base64.b64encode(f.read()).decode()


def face(family, key):
    """@font-face для шрифта, скачанного в fonts.json (кириллица + латиница)."""
    import json
    fonts = json.load(open(os.path.join(HERE, "fonts.json"), encoding="utf-8"))
    out = []
    for sub, rng in (("cyrillic", CYR), ("latin", LAT)):
        out.append("@font-face{font-family:'%s';font-style:normal;"
                   "font-weight:100 900;font-display:block;"
                   "src:url(data:font/woff2;base64,%s) format('woff2');"
                   "unicode-range:%s;}" % (family, font(fonts[key][sub]), rng))
    return "".join(out)


CYR = "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116"
LAT = ("U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, "
       "U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, "
       "U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD")

GROUPS = [
    ("Документы", "receipt-text", [
        ("receipt-text", "Счета", "Покупателям и от поставщиков"),
        ("file-check-2", "Акты выполненных работ", "Журнал актов по заявкам"),
        ("file-pen", "Доверенности и договоры-заявки", "Печать документов по рейсам"),
        ("inbox", "Входящие документы", "Принять или отклонить", "3"),
    ]),
    ("Деньги", "wallet", [
        ("calendar-days", "Платёжный календарь", "Что и когда движется по деньгам"),
        ("clock", "Планируемые платежи", "Кто должен нам и кому должны мы"),
        ("arrow-down-left", "Поступление денежных средств", "Журнал приходов"),
        ("arrow-up-right", "Расход денежных средств", "Журнал расходов"),
        ("arrow-left-right", "Все операции", "Вся история денег в одном месте"),
        ("wallet", "Остатки по кассам", "Сколько денег на счетах и в кассах"),
        ("trending-up", "Движение денежных средств", "Куда пришли и ушли живые деньги"),
        ("chart-pie", "Расходы по статьям", "Структура затрат за период"),
        ("flag", "Ввод начальных остатков", "Стартовые суммы при запуске учёта"),
    ]),
    ("Задолженность", "scale", [
        ("scale", "Взаиморасчёты", "Кто кому должен, просрочка, сверка"),
        ("table-2", "Реестр заявок", "Доход, себестоимость, маржа, оплаты"),
    ]),
    ("Прибыль", "chart-column", [
        ("chart-column", "Отчёт по прибыли", "Доход − себестоимость − расходы"),
        ("truck", "Прибыль по перевозчику", "Заработок на каждом перевозчике"),
        ("list-checks", "Все отчёты", "Сводки, аналитика, экспорт"),
    ]),
    ("ТМЦ и склад", "boxes", [
        ("layers", "Ведомость по остаткам", "Что и сколько сейчас на складах"),
        ("package-plus", "Поступление товаров", "Приход ТМЦ от поставщика"),
        ("arrow-left-right", "Перемещение товаров", "Между складами"),
        ("package-minus", "Списание материалов", "Расход, износ, недостача"),
        ("boxes", "Номенклатура", "Справочник товаров и материалов"),
        ("warehouse", "Склады", "Места хранения ТМЦ"),
    ]),
    ("Зарплата и инструменты", "users", [
        ("users", "Зарплата", "Начисления и выплаты сотрудникам"),
        ("calculator", "Калькулятор", "Быстрый расчёт стоимости перевозки"),
    ]),
    ("Справочники", "settings-2", [
        ("tags", "Статьи доходов и расходов", "Для платежей и отчётов"),
        ("list-checks", "Наименование услуг", "Формулировки для счетов и актов"),
        ("clock", "Условия оплаты", "Предоплата, по факту, отсрочка"),
        ("credit-card", "Формы оплаты", "Безнал, наличные, карта"),
        ("building-2", "Формы собственности", "ТОО, ИП, АО"),
        ("landmark", "Банки", "Справочник банков и БИК"),
        ("coins", "Курсы валют", "Курсы Нацбанка РК по дням"),
        ("refresh-cw", "Переоценка валют", "Курсовая разница на конец месяца"),
        ("hash", "Нумерация счетов", "Префикс, следующий номер"),
        ("hash", "Нумерация заявок", "Формат номера как в 1С"),
        ("banknote", "Счета и кассы", "Ваши расчётные счета и кассы"),
    ]),
]

MONTHS = ["авг 2025", "сен 2025", "окт 2025", "ноя 2025", "дек 2025", "янв 2026",
          "фев 2026", "мар 2026", "апр 2026", "май 2026", "июн 2026", "июл 2026"]

# Показатели за 12 месяцев, тысячи ₸ (последняя точка = цифра в плитке).
SERIES = {
    "Выручка": [980, 1120, 1050, 1340, 1290, 1480, 1610, 1520, 1700, 1660, 1810, 1730],
    "Маржа": [210, 180, -90, 240, 160, 320, 280, -150, 90, -320, -480, -620],
    "Баланс": [1450, 1520, 1610, 1580, 1720, 1890, 2040, 1980, 2150, 2080, 2260, 2220],
    "Дебиторка": [760, 840, 910, 1020, 980, 1120, 1080, 1210, 1160, 1290, 1250, 1320],
    "Кредиторка": [620, 700, 760, 830, 880, 940, 1010, 980, 1060, 1090, 1120, 1135],
    "Рейсы с долгом": [2, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6, 5],
}

# label, value, sub, tone, chip, вид графика
KPI = [
    ("Выручка", "1 730 000 ₸", "за период", "", "", "line"),
    ("Маржа", "−620 000 ₸", "убыток за период", "neg", "−35,84%", "zero"),
    ("Баланс", "2 220 000 ₸", "касса и счета", "", "", "line"),
    ("Дебиторка", "1 320 000 ₸", "ждём от заказчиков", "", "", "line"),
    ("Кредиторка", "1 135 000 ₸", "должны перевозчикам", "", "", "line"),
    ("Рейсы с долгом", "5", "заявок не оплачено", "warn", "долг", "cols"),
]

SPARK_W, SPARK_H = 176, 34


NBSP = "\u00a0"


def _money(v, count=False):
    if count:
        return "%d заявок" % v
    s = "{:,}".format(abs(v) * 1000).replace(",", NBSP)
    return ("−" if v < 0 else "") + s + NBSP + "₸"


def _compact(v):
    """Короткая запись: 713 млн ₸ / 198,9 млн ₸ / 2,55 млрд ₸ / 25,5 млрд ₸.

    Знаков после запятой ровно столько, сколько несёт смысл: у трёхзначных
    величин дробная часть — шум, у однозначных без неё теряется точность.
    """
    a = abs(v)
    if a >= 1000000:
        n, unit = a / 1000000.0, "млрд"
        fmt = "%.2f" if n < 10 else "%.1f"
    else:
        n, unit = a / 1000.0, "млн"
        fmt = "%.1f" if n < 100 else "%.0f"
    txt = (fmt % n).replace(".", ",")
    return ("−" if v < 0 else "") + txt + NBSP + unit + NBSP + "₸"


# Проверка вёрстки на больших суммах: LC_SCALE=big / huge / mega / ultra.
SCALE = os.environ.get("LC_SCALE", "")
MULT = {"big": 115, "huge": 1150, "mega": 11500, "ultra": 115000}
if SCALE in MULT:
    SERIES = {k: [v * (9 if k == "Рейсы с долгом" else MULT[SCALE]) for v in vals]
              for k, vals in SERIES.items()}

# Сотни миллионов пишем полностью, с миллиарда — сокращаем. Решение одно на всю
# строку по самой большой сумме: иначе рядом встанут «980 500 000 ₸» и
# «1,20 млрд ₸», и плитки станет невозможно сравнивать взглядом.
COMPACT = max(abs(SERIES[lab][-1]) for lab, _, _, _, _, kind in KPI
              if kind != "cols") >= 1000000

KPI = [(lab,
        str(SERIES[lab][-1]) if kind == "cols"
        else (_compact(SERIES[lab][-1]) if COMPACT else _money(SERIES[lab][-1])),
        sub, tone, chip, kind)
       for lab, val, sub, tone, chip, kind in KPI]


def _hits(vals, label, count=False):
    """Прозрачные области наведения: подпись месяца и значение по каждой точке."""
    step = SPARK_W / len(vals)
    out = []
    for i, v in enumerate(vals):
        out.append(
            '<rect class="hit" x="%.2f" y="0" width="%.2f" height="%d">'
            "<title>%s — %s</title></rect>"
            % (i * step, step, SPARK_H, MONTHS[i], _money(v, count))
        )
    return "".join(out)


def spark_line(vals, label):
    """Тренд за 12 месяцев: линия 2px, заливка-вуаль, точка на последнем месяце."""
    lo, hi = min(vals), max(vals)
    rng = (hi - lo) or 1
    pad = 5
    def x(i):
        return 5 + i * (SPARK_W - 10) / (len(vals) - 1)
    def y(v):
        return SPARK_H - pad - (v - lo) / rng * (SPARK_H - pad * 2)
    pts = " ".join("%.2f,%.2f" % (x(i), y(v)) for i, v in enumerate(vals))
    area = ("M%.2f,%.2f L" % (x(0), SPARK_H) + pts.replace(" ", " L") +
            " L%.2f,%.2f Z" % (x(len(vals) - 1), SPARK_H))
    return (
        '<svg class="spark" viewBox="0 0 %d %d" preserveAspectRatio="none" '
        'role="img" aria-label="%s за 12 месяцев">'
        '<path class="s-area" d="%s"/>'
        '<polyline class="s-line" points="%s"/>'
        '<circle class="s-dot" cx="%.2f" cy="%.2f" r="4"/>'
        "%s</svg>"
        % (SPARK_W, SPARK_H, label, area, pts,
           x(len(vals) - 1), y(vals[-1]), _hits(vals, label))
    )


def spark_cols(vals, label, zero=False, count=False):
    """Столбики: с нулевой линией для знаковых величин, иначе от низа."""
    gap = 2.0
    bw = (SPARK_W - gap * (len(vals) - 1)) / len(vals)
    hi = max(vals + ([0] if zero else []))
    lo = min(vals + ([0] if zero else [0]))
    rng = (hi - lo) or 1
    top, bot = 3.0, SPARK_H - 3.0
    def y(v):
        return bot - (v - lo) / rng * (bot - top)
    base = y(0) if zero else bot
    r = 2.0
    bars = []
    for i, v in enumerate(vals):
        bx = i * (bw + gap)
        yv = y(v)
        last = " s-last" if i == len(vals) - 1 else ""
        neg = " s-neg" if zero and v < 0 else ""
        if v >= 0:
            h = max(base - yv, 1.5)
            rr = min(r, bw / 3, h)
            d = ("M%.2f,%.2f v%.2f a%.2f,%.2f 0 0 1 %.2f,%.2f h%.2f "
                 "a%.2f,%.2f 0 0 1 %.2f,%.2f v%.2f Z"
                 % (bx, base, -(h - rr), rr, rr, rr, -rr, bw - 2 * rr,
                    rr, rr, rr, rr, h - rr))
        else:
            h = max(yv - base, 1.5)
            rr = min(r, bw / 3, h)
            d = ("M%.2f,%.2f v%.2f a%.2f,%.2f 0 0 0 %.2f,%.2f h%.2f "
                 "a%.2f,%.2f 0 0 0 %.2f,%.2f v%.2f Z"
                 % (bx, base, h - rr, rr, rr, rr, rr, bw - 2 * rr,
                    rr, rr, rr, -rr, -(h - rr)))
        bars.append('<path class="s-bar%s%s" d="%s"/>' % (last, neg, d))
    zline = ('<line class="s-zero" x1="0" y1="%.2f" x2="%d" y2="%.2f"/>'
             % (base, SPARK_W, base)) if zero else ""
    return (
        '<svg class="spark" viewBox="0 0 %d %d" preserveAspectRatio="none" '
        'role="img" aria-label="%s за 12 месяцев">%s%s%s</svg>'
        % (SPARK_W, SPARK_H, label, zline, "".join(bars),
           _hits(vals, label, count))
    )

QUICK = [
    ("plus", "Выставить счёт", "primary"),
    ("arrow-down-left", "Приход денег", ""),
    ("arrow-up-right", "Расход денег", ""),
    ("file-check-2", "Акт выполненных работ", ""),
    ("calendar-days", "Платёжный календарь", ""),
]


def build_kpi():
    out = []
    for label, value, sub, tone, chip, kind in KPI:
        chip_html = ('<span class="chip %s">%s</span>' % (tone, chip)) if chip else ""
        vals = SERIES[label]
        if kind == "line":
            spark = spark_line(vals, label)
        elif kind == "zero":
            spark = spark_cols(vals, label, zero=True)
        else:
            spark = spark_cols(vals, label, count=True)
        out.append(
            '<div class="kpi %s">'
            '<div class="kpi-top"><span class="kpi-label">%s</span>%s</div>'
            '<div class="kpi-value %s">%s</div>'
            '<div class="kpi-sub">%s</div>'
            '<div class="kpi-spark">%s</div>'
            "</div>" % (tone, label, chip_html, tone, value, sub, spark)
        )
    return "\n".join(out)


def build_groups():
    cards = []
    for title, gicon, links in GROUPS:
        rows = []
        for l in links:
            ic, label, desc = l[0], l[1], l[2]
            badge = ('<span class="row-badge">%s</span>' % l[3]) if len(l) > 3 else ""
            rows.append(
                '<a class="row" href="#">'
                '<span class="row-ic">%s</span>'
                '<span class="row-txt"><span class="row-l">%s</span>'
                '<span class="row-d">%s</span></span>%s'
                '<span class="row-arrow">%s</span>'
                "</a>" % (icon(ic), label, desc, badge, icon("chevron-right"))
            )
        cards.append(
            '<section class="card group">'
            '<header class="group-head">'
            '<span class="group-ic">%s</span>'
            '<h2>%s</h2><span class="group-count">%d</span>'
            "</header>"
            '<div class="group-body">%s</div>'
            "</section>" % (icon(gicon), title, len(links), "".join(rows))
        )
    return "\n".join(cards)


def build_quick():
    out = []
    for ic, label, variant in QUICK:
        out.append('<button class="btn %s">%s<span>%s</span></button>'
                   % (variant, icon(ic), label))
    return "\n".join(out)


CSS = """
@font-face{font-family:Inter;font-style:normal;font-weight:100 900;font-display:block;
 src:url(data:font/woff2;base64,__CYR__) format('woff2');unicode-range:__CYRR__;}
@font-face{font-family:Inter;font-style:normal;font-weight:100 900;font-display:block;
 src:url(data:font/woff2;base64,__LAT__) format('woff2');unicode-range:__LATR__;}
__UNBOUNDED__

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root{
  --bg:#ffffff;
  --surface:#ffffff;
  --surface-2:#f6f7f8;
  --fg:#0b0d12;
  --fg-2:#4c5460;
  --fg-3:#868e9c;
  --border:#e6e8ec;
  --border-2:#eff0f3;
  --hover:#f5f6f8;
  --primary:#0b0d12;
  --primary-fg:#ffffff;
  --accent:#1677ff;
  --accent-soft:#eef4ff;
  --pos:#12855b;
  --neg:#d92d20;
  --warn:#b25e09;
  --warn-soft:#fff5e8;
  --neg-soft:#fef2f1;
  --ring:rgba(11,13,18,.06);
  --shadow:0 1px 2px rgba(16,24,40,.05),0 8px 20px -12px rgba(16,24,40,.16);
  --radius:14px;
}
html[data-theme='dark']{
  --bg:#20201f;
  --surface:#20201f;
  --surface-2:#1a1a19;
  --fg:#f1f0ec;
  --fg-2:#b2b1aa;
  --fg-3:#8b8a83;
  --border:#343430;
  --border-2:#2c2c29;
  --hover:#292927;
  --primary:#f1f0ec;
  --primary-fg:#20201f;
  --accent:#5aa2ff;
  --accent-soft:#25313f;
  --pos:#5bcf95;
  --neg:#ff8478;
  --neg-soft:#3a2723;
  --warn:#e8ac66;
  --warn-soft:#3a2e1e;
  --ring:rgba(255,255,255,.05);
  --shadow:0 1px 2px rgba(0,0,0,.3);
}

body{
  font-family:Inter,system-ui,sans-serif;
  background:var(--bg);color:var(--fg);
  -webkit-font-smoothing:antialiased;
  font-feature-settings:'cv05' 1,'ss03' 1;
  letter-spacing:-0.011em;
}
svg{display:block;flex:none}
a{text-decoration:none;color:inherit}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}
.tnum{font-variant-numeric:tabular-nums}

/* ── верхняя навигация ─────────────────────────────── */
.topbar{
  position:sticky;top:0;z-index:20;
  background:color-mix(in srgb,var(--surface) 82%,transparent);
  backdrop-filter:saturate(180%) blur(14px);
  border-bottom:1px solid var(--border);
}
.topbar-in{
  max-width:1360px;margin:0 auto;padding:0 28px;height:58px;
  display:flex;align-items:center;gap:22px;
}
.brand{font-family:'Unbounded',Inter,sans-serif;font-size:14.5px;font-weight:700;
  letter-spacing:-.05em}
.brand span{color:var(--accent)}
.nav{display:flex;align-items:center;gap:2px;
  border:1px solid var(--border);border-radius:999px;padding:3px;}
.nav a{
  display:flex;align-items:center;gap:6px;
  padding:6px 14px;border-radius:999px;
  font-size:13px;font-weight:500;color:var(--fg-2);
}
.nav a.on{background:var(--primary);color:var(--primary-fg);font-weight:600}
.top-right{margin-left:auto;display:flex;align-items:center;gap:8px}
.iconbtn{width:34px;height:34px;border-radius:999px;display:grid;place-items:center;
  color:var(--fg-2);border:1px solid transparent}
.iconbtn:hover{background:var(--hover)}
.iconbtn.dot{position:relative}
.iconbtn.dot::after{content:'';position:absolute;top:7px;right:8px;width:6px;height:6px;
  border-radius:50%;background:var(--neg);border:2px solid var(--surface)}
.ai{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;
  background:linear-gradient(135deg,#1677ff,#8b5cf6);color:#fff}
.themetog{display:flex;border-radius:999px;padding:2px;border:1px solid var(--border)}
.themetog span{width:28px;height:26px;border-radius:999px;display:grid;place-items:center;
  color:var(--fg-3)}
.themetog span.on{background:var(--primary);color:var(--primary-fg)}
.user{display:flex;align-items:center;gap:9px;padding-left:10px;margin-left:2px;
  border-left:1px solid var(--border)}
.ava{width:34px;height:34px;border-radius:50%;background:var(--accent);color:#fff;
  display:grid;place-items:center;font-size:12.5px;font-weight:600;
  box-shadow:0 0 0 1px var(--border)}
.user b{display:block;font-size:12.5px;font-weight:600;line-height:1.25}
.user i{display:block;font-size:11px;font-style:normal;color:var(--fg-3);line-height:1.25}

/* ── тикер ─────────────────────────────────────────── */
.ticker{border-bottom:1px solid var(--border)}
.ticker-in{max-width:1360px;margin:0 auto;padding:7px 28px;display:flex;gap:26px;
  font-size:11.5px;color:var(--fg-3)}
.ticker-in b{color:var(--fg-2);font-weight:600}
.dotmark{width:6px;height:6px;border-radius:50%;background:var(--warn);display:inline-block;
  margin-right:7px;vertical-align:1px}

/* ── страница ──────────────────────────────────────── */
.page{max-width:1360px;margin:0 auto;padding:26px 28px 44px}
.eyebrow{font-family:'Unbounded',Inter,sans-serif;font-size:9.5px;font-weight:500;
  letter-spacing:.06em;text-transform:uppercase;color:var(--fg-3)}
h1{font-family:'Unbounded',Inter,sans-serif;font-size:23px;font-weight:600;
  letter-spacing:-.045em;line-height:1.2;margin-top:7px}
.hero{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:18px}
.hero p{font-size:13px;color:var(--fg-2);margin-top:5px}
.periods{display:flex;align-items:center;gap:8px}
.seg{display:flex;background:var(--surface);border:1px solid var(--border);border-radius:11px;
  padding:3px;box-shadow:var(--shadow)}
.seg button{padding:5px 12px;border-radius:8px;font-size:12.5px;font-weight:500;color:var(--fg-2)}
.seg button.on{background:var(--primary);color:var(--primary-fg);font-weight:600}
.daterange{display:flex;align-items:center;gap:8px;height:34px;padding:0 12px;
  background:var(--surface);border:1px solid var(--border);border-radius:11px;
  font-size:12.5px;color:var(--fg-2);box-shadow:var(--shadow)}
.daterange svg{color:var(--fg-3)}

/* ── показатели ────────────────────────────────────── */
.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:14px}
.kpi{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  padding:13px 14px 12px;box-shadow:var(--shadow);position:relative;overflow:hidden}
.kpi-top{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:16px}
.kpi-label{font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
  color:var(--fg-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi-value{font-size:21px;font-weight:650;letter-spacing:-.03em;margin-top:9px;
  font-variant-numeric:tabular-nums}
.kpi-value.neg{color:var(--neg)}
.kpi-sub{font-size:11.5px;color:var(--fg-3);margin-top:3px}
.kpi-spark{margin-top:9px;height:34px}
.spark{width:100%;height:34px;display:block}
.s-line{fill:none;stroke:var(--fg-3);stroke-width:2;stroke-linejoin:round;
  stroke-linecap:round;vector-effect:non-scaling-stroke}
.s-area{fill:var(--fg-3);opacity:.1;stroke:none}
.s-dot{fill:var(--accent);stroke:var(--surface);stroke-width:2;
  vector-effect:non-scaling-stroke}
.s-bar{fill:var(--fg-3);opacity:.5}
.s-bar.s-last{fill:var(--accent);opacity:1}
.s-bar.s-neg{fill:var(--neg);opacity:.5}
.s-bar.s-neg.s-last{fill:var(--neg);opacity:1}
.s-zero{stroke:var(--border);stroke-width:1;vector-effect:non-scaling-stroke}
.hit{fill:transparent}
.hit:hover{fill:var(--fg);opacity:.05}
.chip{font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:999px;
  border:1px solid var(--border);color:var(--fg-2);white-space:nowrap}
.chip.neg{background:var(--neg-soft);border-color:transparent;color:var(--neg)}
.chip.warn{background:var(--warn-soft);border-color:transparent;color:var(--warn)}

/* ── быстрые действия + поиск ──────────────────────── */
.toolbar{display:flex;align-items:center;gap:8px;margin:18px 0 16px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 13px;
  border-radius:10px;border:1px solid var(--border);background:var(--surface);
  font-size:12.5px;font-weight:550;color:var(--fg);box-shadow:var(--shadow)}
.btn svg{color:var(--fg-3);width:15px;height:15px}
.btn:hover{background:var(--hover)}
.btn.primary{background:var(--primary);color:var(--primary-fg);border-color:var(--primary)}
.btn.primary svg{color:var(--primary-fg);opacity:.85}
.spacer{flex:1}
.searchbox{display:flex;align-items:center;gap:9px;height:34px;width:290px;padding:0 12px;
  background:var(--surface);border:1px solid var(--border);border-radius:10px;
  box-shadow:var(--shadow);color:var(--fg-3);font-size:12.5px}
.kbd{margin-left:auto;font-size:10.5px;font-weight:600;color:var(--fg-3);
  border:1px solid var(--border);border-radius:5px;padding:1px 5px}

/* ── разделы ───────────────────────────────────────── */
.grid{column-count:3;column-gap:14px}
.group{break-inside:avoid;display:inline-block;width:100%;margin-bottom:14px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  box-shadow:var(--shadow);overflow:hidden}
.group-head{display:flex;align-items:center;gap:9px;padding:12px 14px 10px;
  background:var(--surface-2);border-bottom:1px solid var(--border-2)}
.group-ic{display:grid;place-items:center;color:var(--fg-2)}
.group-ic svg{width:15px;height:15px}
.group-head h2{font-family:'Unbounded',Inter,sans-serif;font-size:11.5px;
  font-weight:500;letter-spacing:-.03em}
.group-count{margin-left:auto;font-size:11px;font-weight:600;color:var(--fg-3);
  font-variant-numeric:tabular-nums}
.group-body{padding:6px}
.row{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:9px}
.row:hover{background:var(--hover)}
.row-ic{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;
  color:var(--fg-3);flex:none}
.row-txt{min-width:0;display:block}
.row-l{display:block;font-size:12.8px;font-weight:550;line-height:1.3;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row-d{display:block;font-size:11px;color:var(--fg-3);line-height:1.35;margin-top:1px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row-arrow{margin-left:auto;color:var(--fg-3);opacity:.45}
.row-arrow svg{width:14px;height:14px}
.row-badge{margin-left:auto;font-size:10.5px;font-weight:600;color:var(--accent);
  background:var(--accent-soft);border-radius:6px;padding:1px 7px}
.row-badge+.row-arrow{margin-left:8px}
.row.on{background:var(--accent-soft)}
.row.on .row-l{color:var(--accent)}
"""


def html(theme):
    css = (CSS.replace("__CYR__", font("inter-cyr.woff2"))
              .replace("__LAT__", font("inter-lat.woff2"))
              .replace("__CYRR__", CYR).replace("__LATR__", LAT)
              .replace("__UNBOUNDED__", face("Unbounded", "Unbounded")))
    return """<!doctype html>
<html lang="ru" data-theme="%s"><head><meta charset="utf-8">
<title>Финансы — LogiCore</title><style>%s</style></head><body>

<header class="topbar"><div class="topbar-in">
  <div class="brand">Logi<span>Core</span></div>
  <nav class="nav">
    <a href="#">Дашборд</a><a href="#">Заявки</a><a href="#">Мониторинг</a>
    <a href="#" class="on">Финансы</a><a href="#">Кабинет</a>
  </nav>
  <div class="top-right">
    <div class="ai">%s</div>
    <button class="iconbtn">%s</button>
    <button class="iconbtn dot">%s</button>
    <div class="themetog"><span class="%s">%s</span><span class="%s">%s</span></div>
    <div class="user"><div class="ava">ЕА</div>
      <div><b>Евгений Админ</b><i>Администратор · ТОО «ЛогиКор…»</i></div></div>
  </div>
</div></header>

<div class="ticker"><div class="ticker-in">
  <span><span class="dotmark"></span><b>000000001</b> · Ожидает</span>
  <span>Алматы → Астана · <b>Fura 20т</b></span>
  <span>Оплата до <b>12.08</b></span>
</div></div>

<main class="page">
  <div class="hero">
    <div>
      <div class="eyebrow">Финансы · Обзор</div>
      <h1>Учёт и финансы компании</h1>
      <p>Показатели за июль 2026, графики — за 12 месяцев</p>
    </div>
    <div class="periods">
      <div class="seg">
        <button>Сегодня</button><button class="on">Месяц</button>
        <button>Квартал</button><button>Год</button>
      </div>
      <div class="daterange">%s<span class="tnum">01.07.2026 — 31.07.2026</span></div>
    </div>
  </div>

  <div class="kpis">%s</div>

  <div class="toolbar">
    %s
    <div class="spacer"></div>
    <div class="searchbox">%s<span>Поиск по разделу…</span><span class="kbd">⌘K</span></div>
  </div>

  <div class="grid">%s</div>
</main>
</body></html>""" % (
        theme, css,
        icon("sparkles"), icon("search"), icon("bell"),
        "" if theme == "dark" else "on", icon("sun"),
        "on" if theme == "dark" else "", icon("moon"),
        icon("calendar-days"), build_kpi(), build_quick(), icon("search"),
        build_groups(),
    )


SUFFIX = ("-" + SCALE) if SCALE else ""
OUT = os.path.dirname(HERE)          # design/finance-hub

for th in ("light", "dark"):
    name = "reference%s-%s.html" % (SUFFIX, th)
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(html(th))
    print("собрано:", name)
