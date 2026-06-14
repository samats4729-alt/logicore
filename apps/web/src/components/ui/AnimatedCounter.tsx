'use client';

import { useEffect, useRef, useState } from 'react';

interface AnimatedCounterProps {
    value: number;
    suffix?: string;
    prefix?: string;
    duration?: number;
}

export default function AnimatedCounter({
    value,
    suffix = '',
    prefix = '',
    duration = 1800
}: AnimatedCounterProps) {
    const [displayValue, setDisplayValue] = useState(0);
    const elementRef = useRef<HTMLSpanElement>(null);
    const startedRef = useRef(false);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry.isIntersecting && !startedRef.current) {
                    startedRef.current = true;
                    observer.disconnect();

                    let startTime: number | null = null;

                    const animate = (timestamp: number) => {
                        if (!startTime) startTime = timestamp;
                        const elapsed = timestamp - startTime;
                        const progress = Math.min(elapsed / duration, 1);

                        // easeOutCubic: 1 - pow(1 - progress, 3)
                        const easeProgress = 1 - Math.pow(1 - progress, 3);
                        const currentValue = Math.floor(easeProgress * value);

                        setDisplayValue(currentValue);

                        if (progress < 1) {
                            requestAnimationFrame(animate);
                        } else {
                            setDisplayValue(value);
                        }
                    };

                    requestAnimationFrame(animate);
                }
            },
            { threshold: 0.4 }
        );

        const currentElement = elementRef.current;
        if (currentElement) {
            observer.observe(currentElement);
        }

        return () => {
            observer.disconnect();
        };
    }, [value, duration]);

    return (
        <span ref={elementRef}>
            {prefix}
            {displayValue.toLocaleString('ru-RU')}
            {suffix}
        </span>
    );
}
