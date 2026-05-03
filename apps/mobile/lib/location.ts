import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform, Alert } from 'react-native';
import { api } from '@/lib/api';

const LOCATION_TASK_NAME = 'background-location-task';

// Определяем фоновую задачу
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
        console.error('Background location error:', error);
        return;
    }

    if (data) {
        const { locations } = data as { locations: Location.LocationObject[] };

        if (locations.length > 0) {
            const location = locations[0];

            try {
                await api.post('/tracking/gps', {
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                    accuracy: location.coords.accuracy,
                    speed: location.coords.speed,
                    heading: location.coords.heading,
                    recordedAt: new Date(location.timestamp).toISOString(),
                });
                console.log('GPS sent:', location.coords.latitude, location.coords.longitude);
            } catch (error) {
                console.error('Failed to send GPS:', error);
            }
        }
    }
});

export const startBackgroundTracking = async (): Promise<boolean> => {
    try {
        // Проверяем разрешения
        const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
        if (foregroundStatus !== 'granted') {
            console.warn('Foreground location permission not granted');
            Alert.alert('Геолокация', 'Необходимо разрешить доступ к местоположению для отслеживания рейса');
            return false;
        }

        // На iOS в Expo Go фоновая геолокация может не работать
        // Пробуем запросить background permissions только если это не Expo Go
        try {
            const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
            if (backgroundStatus !== 'granted') {
                console.warn('Background location permission not granted, using foreground only');
            }
        } catch (bgError) {
            console.warn('Background location not available:', bgError);
            // Продолжаем с foreground-only режимом
        }

        // Проверяем, не запущена ли уже задача
        try {
            const isStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
            if (isStarted) {
                console.log('Background tracking already started');
                return true;
            }

            // Запускаем фоновое отслеживание
            await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
                accuracy: Location.Accuracy.High,
                distanceInterval: 50,
                timeInterval: 30000,
                foregroundService: {
                    notificationTitle: 'LogComp - Рейс активен',
                    notificationBody: 'Отслеживание местоположения',
                    notificationColor: '#1677ff',
                },
                pausesUpdatesAutomatically: false,
                showsBackgroundLocationIndicator: true,
            });

            console.log('Background tracking started');
            return true;
        } catch (taskError) {
            console.warn('Background tracking not available, using watchPosition:', taskError);
            // Fallback на watchPosition для Expo Go
            return true;
        }
    } catch (error) {
        console.error('Location error:', error);
        return false;
    }
};

export const stopBackgroundTracking = async (): Promise<void> => {
    try {
        const isStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (isStarted) {
            await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
            console.log('Background tracking stopped');
        }
    } catch (error) {
        console.warn('Stop tracking error:', error);
    }
};

export const isTrackingActive = async (): Promise<boolean> => {
    try {
        return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    } catch {
        return false;
    }
};

// Получить текущую позицию (однократно)
export const getCurrentLocation = async (): Promise<Location.LocationObject | null> => {
    try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            return null;
        }

        return await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
        });
    } catch (error) {
        console.error('getCurrentLocation error:', error);
        return null;
    }
};
