import { ReactNode, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Image, Linking, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { checkPhoto } from '@/lib/photo-check';
import { PhotoProblem, PhotoVerdict, PROBLEM_TEXT } from '@/lib/photo-quality';
import { FONT, RADIUS } from '@/lib/theme';
import { Button } from '@/components/kit';

/** Форма рамки: лист А4 стоя или карточка удостоверения лёжа. */
export type CaptureFrame = 'sheet' | 'card';

export interface CapturedPhoto {
    uri: string;
    width: number;
    height: number;
    /** Оценка снимка; `null` — проверка не сработала, водитель смотрел сам. */
    verdict: PhotoVerdict | null;
    /** Что было не так, но водитель отправил «всё равно». Пусто — снимок годный. */
    sentDespite: PhotoProblem[];
}

const DEFAULT_HINT: Record<CaptureFrame, string> = {
    sheet: 'Положите лист на ровное место и поместите целиком в рамку',
    card: 'Удостоверение целиком в рамке, без бликов',
};

type Phase = 'camera' | 'checking' | 'review';

/**
 * Съёмка документа с проверкой качества (задача владельца №4, 09.10.2026).
 *
 * Камера с рамкой → снимок → телефон сам смотрит, годится ли он: темно,
 * блики, размыто, лист не целиком. Плохой — называем причину словами и
 * предлагаем переснять. Хороший — «Отправить».
 *
 * Проверка может ошибиться (лист на белом столе, необычный бланк), поэтому
 * у плохого снимка остаётся «Всё равно отправить»: водитель у склада не
 * должен застрять из-за ошибки оценки. Содержимое документа не читается и
 * с заявкой не сверяется — это решение владельца.
 */
export function DocumentCapture({ visible, title, hint, frame = 'sheet', source = 'camera', onClose, onDone }: {
    visible: boolean;
    title: string;
    hint?: string;
    frame?: CaptureFrame;
    /** «Из галереи» — сразу выбор готового фото, и он проходит ту же проверку. */
    source?: 'camera' | 'gallery';
    onClose: () => void;
    onDone: (photo: CapturedPhoto) => void;
}) {
    const insets = useSafeAreaInsets();
    const { width: W, height: H } = useWindowDimensions();
    const [permission, requestPermission] = useCameraPermissions();
    const camera = useRef<CameraView>(null);
    const [ready, setReady] = useState(false);
    const [torch, setTorch] = useState(false);
    const [phase, setPhase] = useState<Phase>('camera');
    const [shooting, setShooting] = useState(false);
    const [photo, setPhoto] = useState<{ uri: string; width: number; height: number } | null>(null);
    const [verdict, setVerdict] = useState<PhotoVerdict | null>(null);

    // Каждое открытие — с чистого листа: прошлый снимок не должен мелькнуть.
    useEffect(() => {
        if (!visible) return;
        setPhase('camera');
        setPhoto(null);
        setVerdict(null);
        setTorch(false);
        setReady(false);
        if (source === 'gallery') {
            // Не выбрал фото — закрываемся, а не оставляем пустую камеру.
            fromGallery().then((picked) => { if (!picked) onClose(); });
            return;
        }
        if (permission && !permission.granted && permission.canAskAgain) requestPermission();
    }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

    const check = async (shot: { uri: string; width: number; height: number }) => {
        setPhoto(shot);
        setPhase('checking');
        setVerdict(await checkPhoto(shot.uri, shot.width, shot.height));
        setPhase('review');
    };

    const shoot = async () => {
        if (!camera.current || shooting) return;
        setShooting(true);
        try {
            const shot = await camera.current.takePictureAsync({ quality: 0.8 });
            if (shot?.uri) await check({ uri: shot.uri, width: shot.width, height: shot.height });
        } finally {
            setShooting(false);
        }
    };

    /** Готовое фото из галереи — та же проверка, что у снимка с камеры. */
    const fromGallery = async (): Promise<boolean> => {
        const picked = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: ['images'] });
        const asset = picked.canceled ? null : picked.assets?.[0];
        if (!asset) return false;
        await check({ uri: asset.uri, width: asset.width, height: asset.height });
        return true;
    };

    const send = () => {
        if (!photo) return;
        onDone({ ...photo, verdict, sentDespite: verdict && !verdict.ok ? verdict.problems : [] });
    };

    // Рамка: лист А4 стоя (1 : 1,41) или удостоверение лёжа (1,59 : 1).
    const ratio = frame === 'sheet' ? 1.414 : 1 / 1.585;
    let fw = W * (frame === 'sheet' ? 0.8 : 0.88);
    let fh = fw * ratio;
    const maxH = H * 0.6;
    if (fh > maxH) { fh = maxH; fw = fh / ratio; }
    const fx = (W - fw) / 2;
    const fy = Math.max(insets.top + 96, (H - fh) / 2 - 40);

    const noAccess = permission && !permission.granted;
    // Из галереи камера не нужна вовсе — ни видоискатель, ни вопрос о доступе.
    const live = phase === 'camera' && source === 'camera';
    /** Переснять с камеры или выбрать другое фото из галереи. */
    const retake = () => (source === 'gallery' ? fromGallery() : setPhase('camera'));
    const retakeTitle = source === 'gallery' ? 'Выбрать другое' : 'Переснять';

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            <View style={styles.root}>
                {live && !noAccess && (
                    <>
                        <CameraView
                            ref={camera}
                            style={StyleSheet.absoluteFill}
                            facing="back"
                            enableTorch={torch}
                            autofocus="on"
                            onCameraReady={() => setReady(true)}
                        />
                        {/* Затемнение вокруг рамки — глаз сам ставит лист внутрь. */}
                        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                            <View style={[styles.dim, { top: 0, left: 0, right: 0, height: fy }]} />
                            <View style={[styles.dim, { top: fy + fh, left: 0, right: 0, bottom: 0 }]} />
                            <View style={[styles.dim, { top: fy, left: 0, width: fx, height: fh }]} />
                            <View style={[styles.dim, { top: fy, left: fx + fw, right: 0, height: fh }]} />
                            <Corners x={fx} y={fy} w={fw} h={fh} />
                        </View>
                        <Text style={[styles.cameraHint, { top: fy - 56 }]}>{hint || DEFAULT_HINT[frame]}</Text>
                    </>
                )}

                {live && noAccess && (
                    <View style={styles.center}>
                        <Ionicons name="camera-outline" size={40} color="#fff" />
                        <Text style={styles.noAccessTitle}>Нет доступа к камере</Text>
                        <Text style={styles.noAccessText}>
                            Разрешите камеру для приложения в настройках телефона или выберите готовое фото из галереи.
                        </Text>
                        <View style={{ gap: 10, alignSelf: 'stretch', marginTop: 18 }}>
                            {permission?.canAskAgain
                                ? <Button title="Разрешить камеру" onPress={requestPermission} />
                                : <Button title="Открыть настройки" onPress={() => Linking.openSettings()} />}
                            <Button title="Выбрать из галереи" variant="secondary" onPress={fromGallery} />
                        </View>
                    </View>
                )}

                {phase !== 'camera' && photo && (
                    <Image source={{ uri: photo.uri }} style={[StyleSheet.absoluteFill, { bottom: 200 }]} resizeMode="contain" />
                )}

                {/* Шапка: закрыть и что снимаем */}
                <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
                    <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Закрыть" style={styles.roundButton}>
                        <Ionicons name="close" size={24} color="#fff" />
                    </Pressable>
                    <Text style={styles.title} numberOfLines={1}>{title}</Text>
                    <View style={{ width: 44 }} />
                </View>

                {live && !noAccess && (
                    <View style={[styles.bottom, { paddingBottom: insets.bottom + 18 }]}>
                        <Pressable onPress={fromGallery} hitSlop={8} accessibilityRole="button" accessibilityLabel="Выбрать из галереи" style={styles.roundButton}>
                            <Ionicons name="images-outline" size={24} color="#fff" />
                        </Pressable>
                        <Pressable
                            onPress={shoot}
                            disabled={!ready || shooting}
                            accessibilityRole="button"
                            accessibilityLabel="Сфотографировать"
                            style={[styles.shutter, (!ready || shooting) && { opacity: 0.5 }]}
                        >
                            {shooting ? <ActivityIndicator color="#0b0d12" /> : <View style={styles.shutterInner} />}
                        </Pressable>
                        <Pressable
                            onPress={() => setTorch((t) => !t)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={torch ? 'Выключить фонарик' : 'Включить фонарик'}
                            style={[styles.roundButton, torch && { backgroundColor: '#fff' }]}
                        >
                            <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={22} color={torch ? '#0b0d12' : '#fff'} />
                        </Pressable>
                    </View>
                )}

                {phase === 'checking' && (
                    <Panel bottom={insets.bottom}>
                        <Checking />
                    </Panel>
                )}

                {phase === 'review' && (
                    <Panel bottom={insets.bottom}>
                        <Verdict verdict={verdict} />
                        {verdict && !verdict.ok ? (
                            <>
                                <Button title={retakeTitle} icon={source === 'gallery' ? 'images-outline' : 'camera-outline'} onPress={retake} />
                                <Pressable onPress={send} hitSlop={8} accessibilityRole="button" style={styles.anyway}>
                                    <Text style={styles.anywayText}>Всё равно отправить</Text>
                                </Pressable>
                            </>
                        ) : (
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                <Button title={retakeTitle} variant="secondary" onPress={retake} style={{ flex: 1 }} />
                                <Button title="Отправить" icon="arrow-up" onPress={send} style={{ flex: 2 }} />
                            </View>
                        )}
                    </Panel>
                )}
            </View>
        </Modal>
    );
}

/** Нижняя карточка с итогом проверки и кнопками. */
function Panel({ children, bottom }: { children: ReactNode; bottom: number }) {
    const { colors } = useAppTheme();
    return (
        <View style={[styles.panel, { backgroundColor: colors.card, paddingBottom: bottom + 16 }]}>{children}</View>
    );
}

/** Пока телефон разбирает снимок — секунда-две. */
function Checking() {
    const { colors } = useAppTheme();
    return (
        <View style={styles.checking}>
            <ActivityIndicator color={colors.text} />
            <Text style={[styles.panelText, { color: colors.text }]}>Проверяем снимок…</Text>
        </View>
    );
}

/** Итог проверки словами: годится, что не так и что сделать, или «посмотрите сами». */
function Verdict({ verdict }: { verdict: PhotoVerdict | null }) {
    const { colors } = useAppTheme();
    if (!verdict) {
        return (
            <View style={styles.verdict}>
                <Ionicons name="eye-outline" size={22} color={colors.textSecondary} />
                <View style={{ flex: 1 }}>
                    <Text style={[styles.verdictTitle, { color: colors.text }]}>Не удалось проверить снимок</Text>
                    <Text style={[styles.verdictText, { color: colors.textSecondary }]}>Посмотрите сами: всё ли читается.</Text>
                </View>
            </View>
        );
    }
    if (verdict.ok) {
        return (
            <View style={styles.verdict}>
                <Ionicons name="checkmark-circle" size={22} color={colors.pos} />
                <View style={{ flex: 1 }}>
                    <Text style={[styles.verdictTitle, { color: colors.text }]}>Снимок годится</Text>
                    <Text style={[styles.verdictText, { color: colors.textSecondary }]}>Чётко, светло, документ целиком.</Text>
                </View>
            </View>
        );
    }
    const [main, ...rest] = verdict.problems;
    return (
        <View style={[styles.verdict, { backgroundColor: colors.warnSoft, borderRadius: RADIUS.card, padding: 12 }]}>
            <Ionicons name="alert-circle" size={22} color={colors.warn} />
            <View style={{ flex: 1 }}>
                <Text style={[styles.verdictTitle, { color: colors.text }]}>{PROBLEM_TEXT[main].title}</Text>
                <Text style={[styles.verdictText, { color: colors.textSecondary }]}>{PROBLEM_TEXT[main].hint}</Text>
                {rest.length > 0 && (
                    <Text style={[styles.verdictText, { color: colors.textSecondary, marginTop: 4 }]}>
                        Ещё: {rest.map((p) => PROBLEM_TEXT[p].title.toLowerCase()).join(', ')}.
                    </Text>
                )}
            </View>
        </View>
    );
}

/** Уголки рамки — как в сканерах документов. */
function Corners({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
    const L = 28;
    const T = 3;
    const c = '#fff';
    return (
        <>
            <View style={{ position: 'absolute', left: x, top: y, width: L, height: T, backgroundColor: c }} />
            <View style={{ position: 'absolute', left: x, top: y, width: T, height: L, backgroundColor: c }} />
            <View style={{ position: 'absolute', left: x + w - L, top: y, width: L, height: T, backgroundColor: c }} />
            <View style={{ position: 'absolute', left: x + w - T, top: y, width: T, height: L, backgroundColor: c }} />
            <View style={{ position: 'absolute', left: x, top: y + h - T, width: L, height: T, backgroundColor: c }} />
            <View style={{ position: 'absolute', left: x, top: y + h - L, width: T, height: L, backgroundColor: c }} />
            <View style={{ position: 'absolute', left: x + w - L, top: y + h - T, width: L, height: T, backgroundColor: c }} />
            <View style={{ position: 'absolute', left: x + w - T, top: y + h - L, width: T, height: L, backgroundColor: c }} />
        </>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },
    dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.5)' },
    cameraHint: {
        position: 'absolute', left: 24, right: 24, textAlign: 'center',
        color: '#fff', fontFamily: FONT.semibold, fontSize: 15, lineHeight: 20,
    },
    top: {
        position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    title: { flex: 1, textAlign: 'center', color: '#fff', fontFamily: FONT.semibold, fontSize: 15 },
    roundButton: {
        width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.16)',
    },
    bottom: {
        position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 36,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    shutter: {
        width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#fff',
        alignItems: 'center', justifyContent: 'center',
    },
    shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
    noAccessTitle: { color: '#fff', fontFamily: FONT.semibold, fontSize: 18, marginTop: 12 },
    noAccessText: { color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6 },
    panel: {
        position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 16,
        borderTopLeftRadius: 22, borderTopRightRadius: 22, gap: 12, minHeight: 200,
    },
    checking: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 18, justifyContent: 'center' },
    panelText: { fontSize: 15, fontFamily: FONT.medium },
    verdict: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    verdictTitle: { fontFamily: FONT.semibold, fontSize: 16 },
    verdictText: { fontSize: 14, lineHeight: 19, marginTop: 2 },
    anyway: { alignSelf: 'center', paddingVertical: 6 },
    anywayText: { color: '#868e9c', fontFamily: FONT.medium, fontSize: 14, textDecorationLine: 'underline' },
});
