'use client';

import { useCallback, useEffect, useState } from 'react';
import { Modal } from 'antd';
import { Download, FileQuestion, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import styles from './file-preview.module.css';

/**
 * Посмотреть документ, не скачивая его.
 *
 * До этого любую бумагу — накладную, счёт, договор — можно было только
 * скачать: браузер клал файл в загрузки, человек искал его там, открывал
 * сторонней программой и потом удалял. Чтобы просто убедиться, что скан
 * читаемый, приходилось делать пять действий вместо одного.
 *
 * Почему предпросмотр — на нашей стороне, а не ссылкой на сервер.
 * Сервер отдаёт файлы вложением и с запретом угадывать тип — это защита
 * от загруженного `.html`, который иначе исполнился бы на домене API
 * поверх куки сессии (см. `allowed-files.ts`). Снимать её нельзя. Поэтому
 * файл забирается обычным запросом с авторизацией, а показывается уже
 * здесь — из памяти браузера.
 *
 * И тут вторая половина той же защиты: тип для показа берётся **не из
 * файла**, а из нашего списка. Картинку показываем `<img>` — он скрипты
 * не исполняет; PDF отдаём встроенному просмотрщику в песочнице. Если
 * под видом PDF пришла страница, встроенный просмотрщик покажет
 * поломанный документ, а не выполнит её.
 */

/** Что браузер умеет показать сам и чему при этом можно верить. */
const КАРТИНКИ = ['image/jpeg', 'image/png', 'image/webp'];
const PDF = 'application/pdf';

/**
 * HEIC отдельно: формат с айфона, и показать его умеет только Safari.
 * Обещать предпросмотр и выдать пустой прямоугольник — хуже, чем честно
 * предложить скачать.
 */
const БЕЗ_ПРОСМОТРА = ['image/heic', 'image/heif'];

export type ВидФайла = 'pdf' | 'картинка' | 'нет';

export function видФайла(mimeType?: string | null, fileName?: string | null): ВидФайла {
    const тип = (mimeType || '').toLowerCase().split(';')[0].trim();
    if (тип === PDF) return 'pdf';
    if (КАРТИНКИ.includes(тип)) return 'картинка';
    if (БЕЗ_ПРОСМОТРА.includes(тип)) return 'нет';

    // Тип мог не сохраниться у старых файлов — тогда смотрим на расширение.
    // Оно тоже приходит от отправителя, но показываем мы всё равно только
    // тем способом, который для этого вида безопасен.
    const имя = (fileName || '').toLowerCase();
    if (имя.endsWith('.pdf')) return 'pdf';
    if (/\.(jpe?g|png|webp)$/.test(имя)) return 'картинка';
    return 'нет';
}

export interface FilePreviewProps {
    open: boolean;
    onClose: () => void;
    /** Заголовок окна — что за бумага. */
    title: string;
    /** Имя, под которым файл сохранится, если человек нажмёт «Скачать». */
    fileName: string;
    mimeType?: string | null;
    /** Забрать файл с сервера. Вызывается, только когда окно открыли. */
    load: () => Promise<Blob>;
}

export default function FilePreviewModal({
    open, onClose, title, fileName, mimeType, load,
}: FilePreviewProps) {
    const [url, setUrl] = useState<string | null>(null);
    const [blob, setBlob] = useState<Blob | null>(null);
    const [загрузка, setЗагрузка] = useState(false);
    const вид = видФайла(mimeType, fileName);

    useEffect(() => {
        if (!open) return;
        let живо = true;
        let текущий: string | null = null;

        setЗагрузка(true);
        load()
            .then((данные) => {
                if (!живо) return;
                setBlob(данные);
                // Тип назначаем свой, а не берём из ответа: показываем файл
                // только как то, чем мы его считаем.
                if (вид !== 'нет') {
                    текущий = URL.createObjectURL(
                        new Blob([данные], { type: вид === 'pdf' ? PDF : (mimeType || 'image/jpeg') }),
                    );
                    setUrl(текущий);
                }
            })
            .catch((e: any) => {
                if (живо) toast.error(e?.response?.data?.message || 'Не удалось открыть документ');
            })
            .finally(() => { if (живо) setЗагрузка(false); });

        return () => {
            живо = false;
            if (текущий) URL.revokeObjectURL(текущий);
            setUrl(null);
            setBlob(null);
        };
    }, [open, load, вид, mimeType]);

    const скачать = useCallback(() => {
        if (!blob) return;
        const ссылка = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = ссылка;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(ссылка);
    }, [blob, fileName]);

    return (
        <Modal
            open={open}
            onCancel={onClose}
            title={title}
            width="min(1100px, 94vw)"
            footer={null}
            destroyOnHidden
            centered
        >
            <div className={styles.wrap}>
                {загрузка && (
                    <div className={styles.state}>
                        <Loader2 size={20} className={styles.spin} />
                        <span>Открываем…</span>
                    </div>
                )}

                {!загрузка && вид === 'нет' && (
                    <div className={styles.state}>
                        <FileQuestion size={22} />
                        <span>Этот файл браузер показать не умеет — его можно скачать.</span>
                    </div>
                )}

                {!загрузка && url && вид === 'картинка' && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={fileName} className={styles.image} />
                )}

                {!загрузка && url && вид === 'pdf' && (
                    /* Без `sandbox`: встроенный просмотрщик PDF в него не
                       пускают вовсе — Chromium показывает «страница
                       заблокирована» вместо документа, проверено.
                       Защита здесь другая и не слабее: тип содержимого задаём
                       мы, `application/pdf`, и по ссылке `blob:` браузер тип не
                       угадывает. Подсунутая под видом накладной страница
                       попадёт в просмотрщик PDF и покажется как испорченный
                       документ, а не выполнится. */
                    <iframe src={url} title={fileName} className={styles.frame} />
                )}

                <div className={styles.foot}>
                    <span className={styles.name}>{fileName}</span>
                    <button type="button" className={styles.download} onClick={скачать} disabled={!blob}>
                        <Download size={14} /> Скачать
                    </button>
                </div>
            </div>
        </Modal>
    );
}
