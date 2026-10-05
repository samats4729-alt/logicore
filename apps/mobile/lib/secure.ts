/**
 * Хранилище пропуска и настроек. В телефоне — защищённое хранилище
 * системы; в браузере (предпросмотр разработчика) — lib/secure.web.ts.
 */
export { getItemAsync, setItemAsync, deleteItemAsync } from 'expo-secure-store';
