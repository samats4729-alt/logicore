import { useWindowDimensions } from 'react-native';
import { Canvas, Fill, Shader, Skia, useClock } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { IRIDESCENCE_SKSL, IRIDESCENCE_SPEED, iridescenceUniforms } from '@/lib/iridescence';

const effect = Skia.RuntimeEffect.Make(IRIDESCENCE_SKSL);

/**
 * Живой переливающийся фон заставки. Узор считает видеокарта телефона —
 * тот же приём, что в заставке CashCraft (по мотивам reactbits.dev
 * «Iridescence»), перекрашенный в цвета LogiCore. В браузере-предпросмотре —
 * своя версия на WebGL (`Iridescence.web.tsx`).
 */
export function Iridescence() {
    const clock = useClock();
    // Живые размеры: узор не растягивается после поворота или раскрытия складного телефона.
    const { width, height } = useWindowDimensions();
    const uniforms = useDerivedValue(
        () => iridescenceUniforms(width, height, (clock.value / 1000) * IRIDESCENCE_SPEED),
        [clock, width, height],
    );
    if (!effect) return null;
    return (
        <Canvas style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <Fill>
                <Shader source={effect} uniforms={uniforms} />
            </Fill>
        </Canvas>
    );
}
