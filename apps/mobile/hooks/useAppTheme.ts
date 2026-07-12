import { useStore } from '@/store';
import { lightColors, darkColors } from '@/lib/theme';

export function useAppTheme() {
    const { mapTheme } = useStore();

    const isDark = (() => {
        if (mapTheme === 'dark') return true;
        if (mapTheme === 'light') return false;
        // Авто: тёмная тема ночью (как у карты)
        const hour = new Date().getHours();
        return hour < 6 || hour >= 20;
    })();

    const colors = isDark ? darkColors : lightColors;

    return { isDark, colors };
}
