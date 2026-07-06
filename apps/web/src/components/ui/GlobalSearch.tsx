'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import StatusPill from '@/components/ui/StatusPill';

interface OrderResult {
    id: string;
    orderNumber: string;
    status: string;
    customerName: string | null;
}

interface PartnerResult {
    id: string;
    name: string;
    isCustomer: boolean;
    isCarrier: boolean;
}

interface SearchResults {
    orders: OrderResult[];
    partners: PartnerResult[];
}

export default function GlobalSearch() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [results, setResults] = useState<SearchResults>({ orders: [], partners: [] });
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<any>(null);
    const requestSeq = useRef(0);

    // Клик вне панели — закрыть
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
                setQ('');
                setResults({ orders: [], partners: [] });
                setHasSearched(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // Поиск с дебаунсом
    const doSearch = useCallback(async (query: string) => {
        if (query.trim().length < 2) {
            setResults({ orders: [], partners: [] });
            setHasSearched(false);
            return;
        }
        const seq = ++requestSeq.current;
        setLoading(true);
        setHasSearched(true);
        try {
            const res = await api.get('/company/search', { params: { q: query.trim() } });
            if (seq === requestSeq.current) {
                setResults(res.data);
            }
        } catch {
            if (seq === requestSeq.current) {
                setResults({ orders: [], partners: [] });
            }
        } finally {
            if (seq === requestSeq.current) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => doSearch(q), 300);
        return () => clearTimeout(timer);
    }, [q, doSearch]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            setOpen(false);
            setQ('');
            setResults({ orders: [], partners: [] });
            setHasSearched(false);
        }
        if (e.key === 'Enter' && q.trim().length >= 2) {
            const first = (results.orders[0] ?? results.partners[0]) as OrderResult | PartnerResult | undefined;
            if (first) {
                if ('orderNumber' in first) {
                    router.push(`/company/orders/${first.id}`);
                } else {
                    router.push(`/company/partners/${first.id}`);
                }
                setOpen(false);
                setQ('');
                setResults({ orders: [], partners: [] });
                setHasSearched(false);
            }
        }
    };

    const handleItemClick = (item: OrderResult | PartnerResult) => {
        if ('orderNumber' in item) {
            router.push(`/company/orders/${item.id}`);
        } else {
            router.push(`/company/partners/${item.id}`);
        }
        setOpen(false);
        setQ('');
        setResults({ orders: [], partners: [] });
        setHasSearched(false);
    };

    const isEmpty = hasSearched && !loading && results.orders.length === 0 && results.partners.length === 0;

    return (
        <div ref={containerRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
                type="button"
                className="lc2-iconbtn"
                aria-label="Поиск"
                title="Глобальный поиск"
                data-guide="global-search"
                onClick={() => setOpen(!open)}
            >
                <SearchOutlined />
            </button>

            {open && (
                <div style={{
                    position: 'absolute', right: 0, top: 44, width: 'min(440px, 90vw)',
                    zIndex: 200, background: '#fff', borderRadius: 14,
                    border: '1px solid rgba(0,0,0,0.06)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                    padding: 12,
                }}>
                    <Input
                        ref={inputRef}
                        autoFocus
                        placeholder="Номер заявки или контрагент..."
                        allowClear
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={handleKeyDown}
                        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                        style={{ border: 'none', boxShadow: 'none' }}
                    />

                    {q.trim().length < 2 && (
                        <div style={{ padding: '24px 12px', textAlign: 'center', color: '#8a91a0', fontSize: 13 }}>
                            Введите номер заявки или название контрагента
                        </div>
                    )}

                    {q.trim().length >= 2 && loading && (
                        <div style={{ padding: '24px 12px', textAlign: 'center', color: '#8a91a0', fontSize: 13 }}>
                            Поиск...
                        </div>
                    )}

                    {isEmpty && (
                        <div style={{ padding: '24px 12px', textAlign: 'center', color: '#8a91a0', fontSize: 13 }}>
                            Ничего не найдено
                        </div>
                    )}

                    {results.orders.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#8a91a0', textTransform: 'uppercase', padding: '6px 8px 4px' }}>
                                Заявки
                            </div>
                            {results.orders.map((o) => (
                                <div
                                    key={o.id}
                                    onClick={() => handleItemClick(o)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                                        cursor: 'pointer', borderRadius: 8, transition: 'background 0.12s',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f4f5f7')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <span style={{ fontWeight: 600, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                                        {o.orderNumber}
                                    </span>
                                    <StatusPill status={o.status} />
                                    {o.customerName && (
                                        <span style={{ color: '#8a91a0', fontSize: 12, marginLeft: 'auto' }}>
                                            {o.customerName}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {results.partners.length > 0 && (
                        <div style={{ marginTop: results.orders.length > 0 ? 4 : 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#8a91a0', textTransform: 'uppercase', padding: '6px 8px 4px' }}>
                                Контрагенты
                            </div>
                            {results.partners.map((p) => (
                                <div
                                    key={p.id}
                                    onClick={() => handleItemClick(p)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                                        cursor: 'pointer', borderRadius: 8, transition: 'background 0.12s',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f4f5f7')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <span className="lc2-avatar lc2-avatar-sm" style={{
                                        background: p.isCarrier ? '#e6ffed' : '#e0f2fe',
                                        color: p.isCarrier ? '#28a745' : '#0369a1', flexShrink: 0,
                                    }}>
                                        {p.name.slice(0, 2).toUpperCase()}
                                    </span>
                                    <span style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
