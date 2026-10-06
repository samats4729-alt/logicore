'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import PublicHeader from '@/components/public/PublicHeader';
import styles from '@/components/public/public.module.css';

/** Приложение водителя в Google Play. */
const PLAY_URL = 'https://play.google.com/store/apps/details?id=kz.logcomp.driver';

/**
 * Приглашение парка — страница, которую водитель открывает по ссылке из
 * WhatsApp, ещё без приложения.
 *
 * Три шага крупно: поставить приложение, войти через Google, в анкете
 * выбрать «через парк» и ввести код. Если приложение уже стоит — кнопка
 * «Открыть в приложении» сразу подставит код.
 */
export default function ParkInvitePage() {
    const { code } = useParams<{ code: string }>();
    const [parkName, setParkName] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        api.get(`/exchange/park-invite/${encodeURIComponent(code)}`)
            .then((r) => setParkName(r.data.parkName))
            .catch(() => setFailed(true));
    }, [code]);

    const upper = String(code || '').toUpperCase();

    return (
        <div className={`lc-nova ${styles.root}`}>
            <PublicHeader action={{ label: 'На главную', href: '/' }} />
            <div className={styles.legalBody}>
                <div className={styles.eyebrow}>(Приглашение)</div>
                <h1 className={styles.legalTitle}>
                    {failed ? 'Приглашение не найдено' : parkName ? `Вас приглашает парк ${/[«"]/.test(parkName) ? parkName : `«${parkName}»`}` : 'Загрузка…'}
                </h1>
                <div className={styles.doc}>
                    {failed ? (
                        <p>Ссылка устарела или в ней ошибка. Попросите у парка новую ссылку или код.</p>
                    ) : (
                        <>
                            <p>
                                Через парк можно брать грузы на бирже LogiCore без своего ИП: парк оформит договор аренды вашей
                                машины с вами за рулём, и перевозка будет законной.
                            </p>
                            <h2>Как начать</h2>
                            <ol>
                                <li>
                                    Установите приложение «LogiCore Водитель» из{' '}
                                    <a href={PLAY_URL} target="_blank" rel="noopener noreferrer">Google Play</a>.
                                </li>
                                <li>Откройте приложение и войдите через Google.</li>
                                <li>
                                    В анкете выберите «Без ИП — через парк» и введите код парка:{' '}
                                    <strong style={{ letterSpacing: '0.15em' }}>{upper}</strong>
                                </li>
                                <li>Сфотографируйте документы и подпишите договор — парк проверит анкету и допустит вас к грузам.</li>
                            </ol>
                            <p>
                                Приложение уже установлено?{' '}
                                <a href={`logcomp://park-invite/${upper}`}>Открыть в приложении</a> — код подставится сам.
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
