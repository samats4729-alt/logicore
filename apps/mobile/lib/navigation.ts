import { Linking, Platform, Alert } from 'react-native';

/**
 * Открыть адрес в 2GIS навигаторе
 * @param latitude - Широта
 * @param longitude - Долгота
 * @param address - Адрес для отображения
 */
export const openIn2GIS = async (
    latitude: number,
    longitude: number,
    address?: string
): Promise<void> => {
    // URL схемы для 2GIS
    // Документация: https://api.2gis.ru/doc/2gis/mobiles/
    const scheme2gis = `dgis://2gis.ru/routeSearch/rsType/car/to/${longitude},${latitude}`;
    const web2gis = `https://2gis.kz/geo/${longitude},${latitude}`;

    try {
        // Пробуем открыть в 2GIS приложении
        const canOpen = await Linking.canOpenURL(scheme2gis);

        if (canOpen) {
            await Linking.openURL(scheme2gis);
        } else {
            // Если 2GIS не установлен, предлагаем варианты
            Alert.alert(
                'Навигация',
                '2GIS не найден. Выберите способ навигации:',
                [
                    {
                        text: '2GIS (Веб)',
                        onPress: () => Linking.openURL(web2gis),
                    },
                    {
                        text: 'Google Maps',
                        onPress: () => openInGoogleMaps(latitude, longitude),
                    },
                    {
                        text: 'Яндекс Навигатор',
                        onPress: () => openInYandexNavi(latitude, longitude),
                    },
                    {
                        text: 'Отмена',
                        style: 'cancel',
                    },
                ]
            );
        }
    } catch (error) {
        console.error('Navigation error:', error);
        // Fallback на веб-версию
        await Linking.openURL(web2gis);
    }
};

/**
 * Открыть в Google Maps
 */
export const openInGoogleMaps = async (
    latitude: number,
    longitude: number
): Promise<void> => {
    const url = Platform.select({
        ios: `comgooglemaps://?daddr=${latitude},${longitude}&directionsmode=driving`,
        android: `google.navigation:q=${latitude},${longitude}&mode=d`,
    });

    const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;

    try {
        if (url) {
            const canOpen = await Linking.canOpenURL(url);
            if (canOpen) {
                await Linking.openURL(url);
                return;
            }
        }
        await Linking.openURL(webUrl);
    } catch {
        await Linking.openURL(webUrl);
    }
};

/**
 * Открыть в Яндекс Навигаторе
 */
export const openInYandexNavi = async (
    latitude: number,
    longitude: number
): Promise<void> => {
    const url = `yandexnavi://build_route_on_map?lat_to=${latitude}&lon_to=${longitude}`;
    const webUrl = `https://yandex.kz/maps/?rtext=~${latitude},${longitude}&rtt=auto`;

    try {
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
            await Linking.openURL(url);
            return;
        }
        await Linking.openURL(webUrl);
    } catch {
        await Linking.openURL(webUrl);
    }
};

/**
 * Показать диалог выбора навигатора
 */
export const showNavigationOptions = (
    latitude: number,
    longitude: number,
    address?: string
): void => {
    Alert.alert(
        'Открыть в навигаторе',
        address || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        [
            {
                text: '2GIS',
                onPress: () => openIn2GIS(latitude, longitude, address),
            },
            {
                text: 'Google Maps',
                onPress: () => openInGoogleMaps(latitude, longitude),
            },
            {
                text: 'Яндекс Нави',
                onPress: () => openInYandexNavi(latitude, longitude),
            },
            {
                text: 'Отмена',
                style: 'cancel',
            },
        ]
    );
};
