#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Презентационная картинка LogiCore: собирает kv.html со встроенными шрифтами и иконками."""
import base64, os, re, sys

KIT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "_kit")
HERE = os.path.dirname(os.path.abspath(__file__))
CYR = "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116"
LAT = ("U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, "
       "U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+20B8, U+FEFF, U+FFFD")


def b64(fn):
    return base64.b64encode(open(os.path.join(KIT, fn), "rb").read()).decode()


def face(fam, cyr, lat):
    return "".join(
        "@font-face{font-family:'%s';font-weight:100 900;font-display:block;"
        "src:url(data:font/woff2;base64,%s) format('woff2');unicode-range:%s;}" % (fam, b64(f), r)
        for f, r in ((cyr, CYR), (lat, LAT)))


def icon(name, size=16, sw=1.75):
    s = open(os.path.join(KIT, "icons", name + ".svg"), encoding="utf-8").read()
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S).strip()
    s = re.sub(r'class="[^"]*"', 'class="ic"', s)
    s = re.sub(r'\bwidth="24"', 'width="%s"' % size, s)
    s = re.sub(r'\bheight="24"', 'height="%s"' % size, s)
    s = s.replace('stroke-width="2"', 'stroke-width="%s"' % sw)
    return re.sub(r"\s+", " ", s)


def render(tpl):
    def sub(m):
        parts = m.group(1).split(":")
        name = parts[0]
        size = int(parts[1]) if len(parts) > 1 else 16
        sw = float(parts[2]) if len(parts) > 2 else 1.75
        return icon(name, size, sw)
    return re.sub(r"\{\{i:([^}]+)\}\}", sub, tpl)


fonts = face("Inter", "inter-cyr.woff2", "inter-lat.woff2") + \
    face("Unbounded", "f-unbounded-cyrillic.woff2", "f-unbounded-latin.woff2")

src = sys.argv[1] if len(sys.argv) > 1 else "kv.tpl.html"
out = sys.argv[2] if len(sys.argv) > 2 else "kv.html"
tpl = open(os.path.join(HERE, src), encoding="utf-8").read()
html = render(tpl).replace("/*FONTS*/", fonts)
open(os.path.join(HERE, out), "w", encoding="utf-8").write(html)
print("ok", out, len(html))
