'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark';

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
    theme: 'light',
    setTheme: () => {},
});

export function useTheme() {
    return useContext(ThemeContext);
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<Theme>('light');

    useEffect(() => {
        try {
            const stored = localStorage.getItem('lc_theme') as Theme | null;
            if (stored === 'dark') {
                setTheme('dark');
                document.documentElement.setAttribute('data-theme', 'dark');
            }
        } catch {}
    }, []);

    const handleSetTheme = (t: Theme) => {
        setTheme(t);
        document.documentElement.setAttribute('data-theme', t);
        try { localStorage.setItem('lc_theme', t); } catch {}
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme: handleSetTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}
