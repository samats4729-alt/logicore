import { v4 as uuidv4 } from 'uuid';

/**
 * Номер этого браузера. Сервер держит одну живую сессию на человека и по этому
 * номеру отличает устройства (см. Single Session Policy в сервисе входа).
 */
export function getDeviceId(): string {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
        deviceId = uuidv4();
        localStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
}
