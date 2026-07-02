'use client';

export const STATUS_LABELS: Record<string, string> = {
    DRAFT: 'Черновик',
    PENDING: 'Ожидает',
    ASSIGNED: 'Назначен',
    EN_ROUTE_PICKUP: 'Едет на погр.',
    AT_PICKUP: 'На погрузке',
    LOADING: 'Загрузка',
    IN_TRANSIT: 'В пути',
    AT_DELIVERY: 'На выгрузке',
    UNLOADING: 'Разгрузка',
    COMPLETED: 'Завершён',
    PROBLEM: 'Проблема',
    CANCELLED: 'Отменён',
};

export const STATUS_PILL: Record<string, { bg: string; fg: string }> = {
    DRAFT: { bg: '#f1f2f4', fg: '#5f6672' },
    PENDING: { bg: '#fff4e5', fg: '#b45309' },
    ASSIGNED: { bg: '#e8f0fe', fg: '#1d4ed8' },
    EN_ROUTE_PICKUP: { bg: '#e6f6fb', fg: '#0e7490' },
    AT_PICKUP: { bg: '#eefbe7', fg: '#4d7c0f' },
    LOADING: { bg: '#f3e8ff', fg: '#7e22ce' },
    IN_TRANSIT: { bg: '#e0f2fe', fg: '#0369a1' },
    AT_DELIVERY: { bg: '#ecfccb', fg: '#3f6212' },
    UNLOADING: { bg: '#fae8ff', fg: '#a21caf' },
    COMPLETED: { bg: '#e7f8ef', fg: '#15803d' },
    PROBLEM: { bg: '#fee2e2', fg: '#dc2626' },
    CANCELLED: { bg: '#fdeaea', fg: '#b91c1c' },
};

export default function StatusPill({ status }: { status: string }) {
    const meta = STATUS_PILL[status] || STATUS_PILL.DRAFT;
    return (
        <span className="lc-status" style={{ background: meta.bg, color: meta.fg }}>
            <i />
            {STATUS_LABELS[status] || status}
        </span>
    );
}
