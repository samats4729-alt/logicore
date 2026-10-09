import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as jpeg from 'jpeg-js';
import { base64ToBytes } from './base64';
import { assessPhoto, PhotoVerdict } from './photo-quality';

/**
 * Проверка снимка на телефоне: уменьшить, разобрать по точкам, оценить.
 *
 * Снимок уменьшается до 960 точек по длинной стороне — на этом размере
 * подобраны пороги в `photo-quality.ts`, и разбор укладывается в секунду-две
 * даже на недорогом телефоне. Сам файл для отправки не трогаем: на сервер
 * уходит снимок в полном размере.
 *
 * Проверка — подсказка, а не замок: если она сама сломалась (редкий формат,
 * нехватка памяти), отвечаем `null`, и водитель решает сам.
 */
export const CHECK_SIZE = 960;

export async function checkPhoto(uri: string, width?: number, height?: number): Promise<PhotoVerdict | null> {
    try {
        const context = ImageManipulator.manipulate(uri);
        // Маленький снимок (из галереи, уже ужатый) не растягиваем: растяжка
        // размывает, и чёткое фото сошло бы за смазанное.
        const longSide = Math.max(width ?? 0, height ?? 0);
        if (!longSide || longSide > CHECK_SIZE) {
            if ((width ?? 1) >= (height ?? 0)) context.resize({ width: CHECK_SIZE });
            else context.resize({ height: CHECK_SIZE });
        }
        const image = await context.renderAsync();
        const saved = await image.saveAsync({ base64: true, format: SaveFormat.JPEG, compress: 0.9 });
        if (!saved.base64) return null;
        const decoded = jpeg.decode(base64ToBytes(saved.base64), { useTArray: true, formatAsRGBA: true });
        return assessPhoto(decoded.data, decoded.width, decoded.height);
    } catch {
        return null;
    }
}
