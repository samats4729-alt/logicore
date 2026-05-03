import { useStore } from '@/store';
import { useColorScheme } from 'react-native';

export function useAppTheme() {
    const { mapTheme } = useStore();
    const systemColorScheme = useColorScheme();

    const isDark = (() => {
        if (mapTheme === 'dark') return true;
        if (mapTheme === 'light') return false;
        // Auto: check real time hours as per previous logic, or use system preference?
        // User requested "Default auto depends on time", so stick to time logic for consistency with map.
        const hour = new Date().getHours();
        return hour < 6 || hour >= 20;
    })();

    const colors = {
        background: isDark ? '#121212' : '#f5f5f5',
        card: isDark ? '#1e1e1e' : '#ffffff',
        text: isDark ? '#ffffff' : '#333333',
        textSecondary: isDark ? '#a0a0a0' : '#666666',
        border: isDark ? '#333333' : '#e8e8e8',
        primary: '#1677ff',
        tint: isDark ? '#ffffff' : '#000000',
        icon: isDark ? '#cccccc' : '#333333',
        danger: '#f5222d',
    };

    return { isDark, colors };
}
