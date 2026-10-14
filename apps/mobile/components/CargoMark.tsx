import { useEffect } from 'react';
import { Canvas, Circle, FillType, Group, Line, Path, Skia, vec } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { ACCENT, CARGO, INK, LOGO_BOX, LOGO_INNER, LOGO_OUTER, SPEED_LINE, cargoFrame, logoPlacement } from '@/lib/cargo-splash';

const OUTER = Skia.Path.MakeFromSVGString(LOGO_OUTER)!;
OUTER.setFillType(FillType.EvenOdd);
const INNER = Skia.Path.MakeFromSVGString(LOGO_INNER)!;

/** Где у груза правый край, в единицах знака: за ним тянутся полосы скорости. */
const BLOCK_RIGHT = 772 - LOGO_BOX.x;
const LINES = [{ dy: 12, dx: 0, len: 26 }, { dy: 24, dx: 8, len: 32 }, { dy: 36, dx: 16, len: 38 }];

/**
 * Знак LogiCore для заставки «Погрузка» (телефон): контур рисуется как кузов,
 * заливается, справа заезжает груз, загорается синяя точка. Рисует видеокарта
 * (Skia) — плавно и на слабых телефонах. В браузере-предпросмотре —
 * `CargoMark.web.tsx` (SVG) по тому же расписанию.
 */
export function CargoMark({ cx, cy, width, screenWidth, screenHeight }: {
    cx: number;
    cy: number;
    width: number;
    screenWidth: number;
    screenHeight: number;
}) {
    const p = logoPlacement(cx, cy, width);
    const u = width / 118; // полосы и точка — в пропорции к знаку
    const t = useSharedValue(0);
    useEffect(() => {
        t.value = withTiming(CARGO.total, { duration: CARGO.total, easing: Easing.linear });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const f = useDerivedValue(() => cargoFrame(t.value));
    const draw = useDerivedValue(() => f.value.draw);
    const fill = useDerivedValue(() => f.value.fill);
    const stroke = useDerivedValue(() => f.value.stroke);
    const blockOn = useDerivedValue(() => f.value.blockOn);
    const blockShift = useDerivedValue(() => [{ translateX: f.value.slide }]);
    const speed = useDerivedValue(() => f.value.speed);
    const dotR = useDerivedValue(() => 5 * u * f.value.dot);
    const lineX = (i: number, end: boolean) =>
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useDerivedValue(() => {
            const right = p.x + (BLOCK_RIGHT + f.value.slide) * p.s;
            const x = right + (8 + LINES[i].dx) * u;
            return vec(end ? x + LINES[i].len * u : x, cy + LINES[i].dy * u);
        });
    const ends = [0, 1, 2].map((i) => ({ a: lineX(i, false), b: lineX(i, true) }));

    return (
        <Canvas style={{ position: 'absolute', left: 0, top: 0, width: screenWidth, height: screenHeight }}>
            <Group transform={[{ translateX: p.x }, { translateY: p.y }, { scale: p.s }, { translateX: -LOGO_BOX.x }, { translateY: -LOGO_BOX.y }]}>
                <Path path={OUTER} color={INK} style="stroke" strokeWidth={14} strokeJoin="round" start={0} end={draw} opacity={stroke} />
                <Path path={OUTER} color={INK} opacity={fill} />
                <Group transform={blockShift} opacity={blockOn}>
                    <Path path={INNER} color={INK} />
                </Group>
            </Group>
            <Group opacity={speed}>
                {ends.map((e, i) => (
                    <Line key={i} p1={e.a} p2={e.b} color={SPEED_LINE} strokeWidth={3 * u} strokeCap="round" />
                ))}
            </Group>
            <Circle cx={cx + 0.49 * width} cy={cy - 0.347 * width} r={dotR} color={ACCENT} />
        </Canvas>
    );
}
