# Ключевой визуал LogiCore (презентационная картинка)

`LogiCore_key_visual_4K.png` — 3840×2160, для презентаций, соцсетей, сайта.
`LogiCore_key_visual_9x16.png` — 2160×3840, вертикальная (сторис, Reels), чёрно-белая, без синего.

Картинка собрана вёрсткой, а не нейросетью: экраны повторяют настоящий
кабинет после редизайна (меню слева, чёрно-белая гамма, плашки статусов) и
приложение водителя (чёрная карточка рейса, серые блоки, меню-капсула).
Цифры и названия (ТОО «Евразия Карго», ЗК-26xx, суммы) — выдуманные, для
примера.

Поменять текст или цифры: правка в `kv.tpl.html`, затем из этой папки

    python3 build.py                       # kv.tpl.html → kv.html (шрифты и иконки внутри)
    node shot.mjs "$PWD/kv.html" "$PWD/LogiCore_key_visual_4K.png" 1920 1080 2

Шрифты и иконки берутся из `design/_kit/`. `kv.html` — промежуточный файл,
в репозиторий не кладётся.

Вертикальная собирается из горизонтальной: `make_vertical.py` перекрашивает
её в чёрно-белую (проверяет, что синего не осталось), меняет текст и
раскладку и пишет `kv-vertical.tpl.html`. Дальше так же:

    python3 make_vertical.py
    python3 build.py kv-vertical.tpl.html kv-vertical.html
    node shot.mjs "$PWD/kv-vertical.html" "$PWD/LogiCore_key_visual_9x16.png" 1080 1920 2


## Серия 9:16 (02–05)

Продолжение вертикальной (она — 01): `LogiCore_9x16_02_monitoring.png`,
`_03_finance.png`, `_04_documents.png`, `_05_exchange.png`. Тот же
чёрно-белый стиль, синего нет (скрипт проверяет). Всё собирает
`series.py` — общее оформление, карта Казахстана точками и четыре
страницы; дальше так же:

    python3 series.py
    python3 build.py series-02.tpl.html series-02.html
    node shot.mjs "$PWD/series-02.html" "$PWD/LogiCore_9x16_02_monitoring.png" 1080 1920 2
