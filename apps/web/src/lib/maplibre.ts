import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * Карты платформы: MapLibre GL + бесплатные векторные тайлы OpenFreeMap
 * (без ключей и лимитов). Стиль liberty показывает номера домов на
 * ближних зумах. 2ГИС остаётся только для подсказок адресов (через
 * серверный прокси /geo с кэшем).
 */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export default maplibregl;
