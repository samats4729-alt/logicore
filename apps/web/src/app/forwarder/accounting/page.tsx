'use client';

import { useRouter } from 'next/navigation';
import { Typography } from 'antd';
import {
    DollarOutlined,
    WalletOutlined,
    RightOutlined,
    BookOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

interface MenuItem {
    key: string;
    label: string;
    icon: React.ReactNode;
    color: string;
    href: string;
}

interface MenuSection {
    title: string;
    items: MenuItem[];
}

const sections: MenuSection[] = [
    {
        title: 'Деньги',
        items: [
            {
                key: 'incomes',
                label: 'Поступление денежных средств',
                icon: <WalletOutlined />,
                color: '#389e0d',
                href: '/forwarder/accounting/incomes',
            },
            {
                key: 'expenses',
                label: 'Расход денежных средств',
                icon: <DollarOutlined />,
                color: '#cf1322',
                href: '/forwarder/accounting/expenses',
            },
        ],
    },
    {
        title: 'Аналитика',
        items: [
            {
                key: 'registry',
                label: 'Реестр заявок — Дебиторка / Кредиторка / Маржа',
                icon: <BookOutlined />,
                color: '#1677ff',
                href: '/forwarder/accounting/registry',
            },
        ],
    },
];

export default function ForwarderAccountingPage() {
    const router = useRouter();

    return (
        <div>
            <Title level={3} style={{ marginBottom: 28, fontWeight: 600 }}>Бухгалтерия</Title>

            <div style={{ maxWidth: 520 }}>
                {sections.map((section) => (
                    <div key={section.title} style={{ marginBottom: 28 }}>
                        <Text
                            style={{
                                fontSize: 13,
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                color: '#8c8c8c',
                                display: 'block',
                                marginBottom: 8,
                                paddingLeft: 4,
                            }}
                        >
                            {section.title}
                        </Text>
                        <div style={{
                            background: '#fafafa',
                            borderRadius: 10,
                            border: '1px solid #f0f0f0',
                            overflow: 'hidden',
                        }}>
                            {section.items.map((item, idx) => (
                                <div
                                    key={item.key}
                                    onClick={() => router.push(item.href)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        padding: '11px 14px',
                                        cursor: 'pointer',
                                        transition: 'background 0.15s',
                                        borderBottom: idx < section.items.length - 1 ? '1px solid #f0f0f0' : 'none',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f5f5')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <span style={{ color: item.color, fontSize: 15, lineHeight: 1, width: 18, textAlign: 'center' }}>
                                        {item.icon}
                                    </span>
                                    <Text style={{ fontSize: 14, flex: 1 }}>{item.label}</Text>
                                    <RightOutlined style={{ color: '#d9d9d9', fontSize: 11 }} />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
