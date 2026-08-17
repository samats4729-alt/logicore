'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import dayjs from 'dayjs';
import {
    AllocationSuggestionItem,
    OpenOrderForPayment,
    fetchOpenOrdersForPayment,
    suggestAllocation,
} from '@/lib/accounting-documents';
import Loader from '@/components/ui/Loader';

const { TextArea } = Input;

const money = (value: number) =>
    `${(value ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₸`;

interface Option { value: string; label: string }
interface FinanceAccount { id: string; name: string; kind: 'CASH' | 'BANK' }
interface FinanceCategory { id: string; name: string; direction: string; isActive: boolean }
interface PartnerOption { id: string; name: string }

interface OrderFinanceModalsProps {
    /** Поступление по заявке */
    incomeModalOpen: boolean;
    setIncomeModalOpen: (open: boolean) => void;
    incomeForm: FormInstance;
    incomeLoading: boolean;
    incomeCategories: Option[];
    handleAddIncome: (values: any) => void;

    /** Расход по заявке */
    expenseModalOpen: boolean;
    setExpenseModalOpen: (open: boolean) => void;
    expenseForm: FormInstance;
    expenseLoading: boolean;
    expenseCategories: Option[];
    handleAddExpense: (values: any) => void;

    /** Платёж: приход или расход денег с контрагентом */
    paymentModalOpen: boolean;
    setPaymentModalOpen: (open: boolean) => void;
    paymentForm: FormInstance;
    paymentLoading: boolean;
    editingPayment: any;
    handleSavePayment: (values: any) => void;
    accounts: FinanceAccount[];
    categories: FinanceCategory[];
    partners: PartnerOption[];

    /**
     * Разнесение платежа по счетам контрагента. Суммы редактируются здесь,
     * а применяются после сохранения платежа — до этого у платежа нет id.
     */
    allocations: Record<string, number>;
    setAllocations: (allocations: Record<string, number>) => void;

    /**
     * Разнесение платежа по заявкам: заказчик платит одним переводом за
     * два десятка рейсов. Уходит вместе с платежом, а не после него.
     */
    orderShares: Record<string, number>;
    setOrderShares: (shares: Record<string, number>) => void;
}

/**
 * Денежные окна карточки заявки: поступление, расход и платёж.
 *
 * Вынесены из карточки — она разрослась до двух с половиной тысяч строк, и
 * искать в ней форму платежа было тяжело. Логика не менялась: формы,
 * обработчики и состояние остались в карточке и приходят пропсами.
 */
export default function OrderFinanceModals({
    incomeModalOpen, setIncomeModalOpen, incomeForm, incomeLoading, incomeCategories, handleAddIncome,
    expenseModalOpen, setExpenseModalOpen, expenseForm, expenseLoading, expenseCategories, handleAddExpense,
    paymentModalOpen, setPaymentModalOpen, paymentForm, paymentLoading, editingPayment, handleSavePayment,
    accounts, categories, partners, allocations, setAllocations,
    orderShares, setOrderShares,
}: OrderFinanceModalsProps) {
    const [openInvoices, setOpenInvoices] = useState<AllocationSuggestionItem[]>([]);
    const [loadingInvoices, setLoadingInvoices] = useState(false);
    const [openOrders, setOpenOrders] = useState<OpenOrderForPayment[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);

    // Следим за суммой, направлением и контрагентом: от них зависит, какие
    // счета можно закрыть и сколько на них ляжет.
    const amount = Form.useWatch('amount', paymentForm);
    const direction = Form.useWatch('direction', paymentForm);
    const counterpartyId = Form.useWatch('counterpartyId', paymentForm);

    const loadSuggestion = useCallback(async () => {
        if (!paymentModalOpen || !counterpartyId || !amount || Number(amount) <= 0) {
            setOpenInvoices([]);
            return;
        }
        try {
            setLoadingInvoices(true);
            const result = await suggestAllocation({
                counterpartyId,
                direction: direction === 'OUT' ? 'OUT' : 'IN',
                amount: Number(amount).toFixed(2),
            });
            setOpenInvoices(result.documents);
            // Предложение подставляем как есть; бухгалтер поправит суммы.
            const proposed: Record<string, number> = {};
            for (const item of result.documents) {
                if (item.suggestedAmount > 0) proposed[item.documentId] = item.suggestedAmount;
            }
            setAllocations(proposed);
        } catch {
            setOpenInvoices([]);
        } finally {
            setLoadingInvoices(false);
        }
    }, [paymentModalOpen, counterpartyId, amount, direction, setAllocations]);

    useEffect(() => { loadSuggestion(); }, [loadSuggestion]);

    /**
     * Что за контрагентом числится по заявкам.
     *
     * Список не зависит от суммы: сумма как раз и складывается из
     * отмеченных заявок, а не наоборот. Раньше бухгалтер вбивала её руками
     * и по платежу нельзя было понять, какие рейсы закрыты.
     */
    const loadOpenOrders = useCallback(async () => {
        if (!paymentModalOpen || !counterpartyId) {
            setOpenOrders([]);
            return;
        }
        try {
            setLoadingOrders(true);
            setOpenOrders(await fetchOpenOrdersForPayment({
                counterpartyId,
                direction: direction === 'OUT' ? 'OUT' : 'IN',
            }));
        } catch {
            setOpenOrders([]);
        } finally {
            setLoadingOrders(false);
        }
    }, [paymentModalOpen, counterpartyId, direction]);

    useEffect(() => { loadOpenOrders(); }, [loadOpenOrders]);

    // Окно закрыли — отметки не должны всплыть в следующем платеже.
    useEffect(() => {
        if (!paymentModalOpen) setOrderShares({});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paymentModalOpen]);

    const allocatedTotal = Object.values(allocations).reduce((sum, value) => sum + (value || 0), 0);
    const rest = Math.round(((Number(amount) || 0) - allocatedTotal) * 100) / 100;

    const sharesTotal = Math.round(
        Object.values(orderShares).reduce((sum, value) => sum + (value || 0), 0) * 100,
    ) / 100;
    const pickedOrders = Object.keys(orderShares).filter((id) => (orderShares[id] || 0) > 0);

    /**
     * Отметить или снять заявку.
     *
     * Сумма платежа пересчитывается сразу: бухгалтер отмечает рейсы, за
     * которые пришли деньги, а не считает их в уме и печатает итог.
     */
    const toggleOrder = (order: OpenOrderForPayment, checked: boolean) => {
        const next = { ...orderShares };
        if (checked) next[order.orderId] = order.balance;
        else delete next[order.orderId];
        setOrderShares(next);

        const total = Math.round(
            Object.values(next).reduce((sum, value) => sum + (value || 0), 0) * 100,
        ) / 100;
        paymentForm.setFieldsValue({ amount: total > 0 ? total : undefined });
    };

    const setOrderAmount = (orderId: string, value: number) => {
        const next = { ...orderShares, [orderId]: value };
        setOrderShares(next);
        const total = Math.round(
            Object.values(next).reduce((sum, item) => sum + (item || 0), 0) * 100,
        ) / 100;
        paymentForm.setFieldsValue({ amount: total > 0 ? total : undefined });
    };

    return (
        <>
        <Modal title="Добавить поступление" open={incomeModalOpen} onCancel={() => setIncomeModalOpen(false)} onOk={() => incomeForm.submit()} okText="Добавить" cancelText="Отмена" confirmLoading={incomeLoading}>
            <Form form={incomeForm} layout="vertical" onFinish={handleAddIncome}>
                <Form.Item name="date" label="Дата" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" /></Form.Item>
                <Form.Item name="category" label="Категория" rules={[{ required: true }]}><Select options={incomeCategories} /></Form.Item>
                <Form.Item name="description" label="Описание" rules={[{ required: true }]}><Input placeholder="Описание" /></Form.Item>
                <Form.Item name="amount" label="Сумма ₸" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item>
                <Form.Item name="note" label="Примечание"><TextArea rows={2} /></Form.Item>
            </Form>
        </Modal>

        {/* =================== EXPENSE MODAL =================== */}
        <Modal title="Добавить расход" open={expenseModalOpen} onCancel={() => setExpenseModalOpen(false)} onOk={() => expenseForm.submit()} okText="Добавить" cancelText="Отмена" confirmLoading={expenseLoading}>
            <Form form={expenseForm} layout="vertical" onFinish={handleAddExpense}>
                <Form.Item name="date" label="Дата" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" /></Form.Item>
                <Form.Item name="category" label="Категория" rules={[{ required: true }]}><Select options={expenseCategories} /></Form.Item>
                <Form.Item name="description" label="Описание" rules={[{ required: true }]}><Input placeholder="Описание" /></Form.Item>
                <Form.Item name="amount" label="Сумма ₸" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item>
                <Form.Item name="note" label="Примечание"><TextArea rows={2} /></Form.Item>
            </Form>
        </Modal>

        {/* =================== UNIFIED PAYMENT MODAL =================== */}
        <Modal
            title={editingPayment ? "Редактировать платёж" : "Зарегистрировать платёж"}
            open={paymentModalOpen}
            onCancel={() => setPaymentModalOpen(false)}
            onOk={() => paymentForm.submit()}
            okText={editingPayment ? "Сохранить" : "Добавить"}
            cancelText="Отмена"
            confirmLoading={paymentLoading}
            destroyOnClose
        >
            <Form form={paymentForm} layout="vertical" onFinish={handleSavePayment}>
                <Form.Item name="direction" label="Направление платежа" rules={[{ required: true }]}>
                    <Select disabled={!!editingPayment}>
                        <Select.Option value="IN">Поступление (IN)</Select.Option>
                        <Select.Option value="OUT">Расход (OUT)</Select.Option>
                    </Select>
                </Form.Item>

                <Form.Item name="amount" label="Сумма (₸)" rules={[{ required: true, message: 'Укажите сумму' }]}>
                    <InputNumber min={0.01} style={{ width: '100%' }} placeholder="0" />
                </Form.Item>

                <Form.Item name="date" label="Дата платежа" rules={[{ required: true }]}>
                    <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                </Form.Item>

                <Form.Item name="method" label="Способ оплаты" rules={[{ required: true }]}>
                    <Select>
                        <Select.Option value="BANK">Безналичный (Банк)</Select.Option>
                        <Select.Option value="CASH">Наличные</Select.Option>
                        <Select.Option value="CARD">Карта</Select.Option>
                        <Select.Option value="OTHER">Другой способ</Select.Option>
                    </Select>
                </Form.Item>

                <Form.Item name="accountId" label="Счёт / Касса">
                    <Select placeholder="По умолчанию" allowClear>
                        {accounts.map(acc => (
                            <Select.Option key={acc.id} value={acc.id}>
                                {acc.name} ({acc.kind === 'CASH' ? 'Касса' : 'Банк'})
                            </Select.Option>
                        ))}
                    </Select>
                </Form.Item>

                <Form.Item noStyle dependencies={['direction']}>
                    {({ getFieldValue }) => {
                        const dir = getFieldValue('direction') || 'IN';
                        const filteredCats = categories.filter(c => c.direction === dir && c.isActive);
                        return (
                            <Form.Item name="categoryId" label="Статья расходов/доходов">
                                <Select placeholder="По умолчанию" allowClear>
                                    {filteredCats.map(cat => (
                                        <Select.Option key={cat.id} value={cat.id}>
                                            {cat.name}
                                        </Select.Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        );
                    }}
                </Form.Item>

                <Form.Item name="counterpartyId" label="Контрагент">
                    <Select placeholder="Выберите контрагента" allowClear>
                        {partners.map(p => (
                            <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
                        ))}
                    </Select>
                </Form.Item>

                <Form.Item name="note" label="Примечание">
                    <TextArea rows={2} placeholder="Примечание или детали платежа" />
                </Form.Item>

                {/* Подбор по заявкам.
                    Заказчик присылает один перевод за два десятка рейсов.
                    Раньше бухгалтер вбивала сумму руками, а какие именно
                    заявки закрыты — не было видно ни в платеже, ни потом. */}
                {loadingOrders ? (
                    <div style={{ textAlign: 'center', padding: 12 }}><Loader size="small" /></div>
                ) : openOrders.length > 0 && (
                    <div style={{ marginTop: 4, marginBottom: 16 }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between',
                            alignItems: 'baseline', gap: 8, marginBottom: 6,
                        }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>Подобрать по заявкам</div>
                            {pickedOrders.length > 0 && (
                                <div style={{ fontSize: 12, color: 'var(--lc-text-sec)' }}>
                                    отмечено {pickedOrders.length} · {money(sharesTotal)}
                                </div>
                            )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--lc-text-ter)', marginBottom: 8 }}>
                            Отметьте рейсы, за которые пришли деньги, — сумма платежа сложится сама.
                            Долг по каждому можно поправить.
                        </div>
                        <div style={{
                            maxHeight: 260, overflowY: 'auto', border: '1px solid var(--lc-border)',
                            borderRadius: 10, padding: 8,
                        }}>
                            {openOrders.map((order) => {
                                const checked = (orderShares[order.orderId] || 0) > 0;
                                return (
                                    <label
                                        key={order.orderId}
                                        style={{
                                            display: 'flex', gap: 10, alignItems: 'center',
                                            padding: '6px 4px', cursor: 'pointer',
                                            borderBottom: '1px solid var(--lc-border-soft, transparent)',
                                        }}
                                    >
                                        <Checkbox
                                            checked={checked}
                                            onChange={(e) => toggleOrder(order, e.target.checked)}
                                        />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 12, fontWeight: 600 }}>
                                                {order.orderNumber}
                                                {order.route && (
                                                    <span style={{ fontWeight: 400, color: 'var(--lc-text-sec)' }}>
                                                        {' · '}{order.route}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--lc-text-ter)' }}>
                                                {dayjs(order.date).format('DD.MM.YYYY')}
                                                {' · долг '}{money(order.balance)}
                                                {order.paid > 0 && ` · оплачено ${money(order.paid)}`}
                                                {order.dueDate && ` · до ${dayjs(order.dueDate).format('DD.MM.YYYY')}`}
                                            </div>
                                        </div>
                                        {checked && (
                                            <InputNumber
                                                size="small"
                                                min={0}
                                                max={order.balance}
                                                style={{ width: 120 }}
                                                value={orderShares[order.orderId]}
                                                onClick={(e) => e.preventDefault()}
                                                onChange={(value) => setOrderAmount(order.orderId, Number(value) || 0)}
                                            />
                                        )}
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Разнесение по счетам: пока платёж не разнесён, видно
                    только что деньги пришли, но не какие счета закрыты. */}
                {loadingInvoices ? (
                    <div style={{ textAlign: 'center', padding: 12 }}><Loader size="small" /></div>
                ) : openInvoices.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                            Разнести по счетам
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--lc-text-ter)', marginBottom: 8 }}>
                            Предложено по сроку оплаты — сначала самые ранние. Суммы можно поправить.
                        </div>
                        {openInvoices.map((invoice) => (
                            <div
                                key={invoice.documentId}
                                style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 500 }}>{invoice.number}</div>
                                    <div style={{ fontSize: 11, color: 'var(--lc-text-ter)' }}>
                                        остаток {money(invoice.balanceDue)}
                                        {invoice.dueDate && ` · до ${dayjs(invoice.dueDate).format('DD.MM.YYYY')}`}
                                    </div>
                                    {/* За какие рейсы этот счёт: по одному
                                        номеру документа понять это нельзя. */}
                                    {(invoice.orderNumbers ?? []).length > 0 && (
                                        <div style={{ fontSize: 11, color: 'var(--lc-text-sec)' }}>
                                            заявки: {(invoice.orderNumbers ?? []).slice(0, 6).join(', ')}
                                            {(invoice.orderNumbers ?? []).length > 6
                                                && ` и ещё ${(invoice.orderNumbers ?? []).length - 6}`}
                                        </div>
                                    )}
                                </div>
                                <InputNumber
                                    size="small"
                                    min={0}
                                    max={invoice.balanceDue}
                                    style={{ width: 130 }}
                                    value={allocations[invoice.documentId] ?? 0}
                                    onChange={(value) => setAllocations({
                                        ...allocations,
                                        [invoice.documentId]: Number(value) || 0,
                                    })}
                                />
                            </div>
                        ))}
                        {rest !== 0 && (
                            <Alert
                                type={rest < 0 ? 'error' : 'info'}
                                showIcon
                                style={{ marginTop: 8 }}
                                message={rest < 0
                                    ? `Разнесено больше платежа на ${money(-rest)}`
                                    : `Не разнесено: ${money(rest)} — останется авансом`}
                            />
                        )}
                    </div>
                )}
            </Form>
        </Modal>
        </>
    );
}
