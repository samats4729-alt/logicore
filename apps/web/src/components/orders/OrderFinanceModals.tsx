'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Button as AntButton, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import dayjs from 'dayjs';
import {
    AllocationSuggestionItem,
    OpenOrderForPayment,
    fetchOpenOrdersForPayment,
    suggestAllocation,
} from '@/lib/accounting-documents';
import Loader from '@/components/ui/Loader';
import { OrderPaymentRegister } from './OrderPaymentRegister';
import styles from './order-finance-modals.module.css';

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
    const [ordersError, setOrdersError] = useState<string | null>(null);

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
            setOrdersError(null);
            setOpenOrders(await fetchOpenOrdersForPayment({
                counterpartyId,
                direction: direction === 'OUT' ? 'OUT' : 'IN',
            }));
        } catch {
            setOpenOrders([]);
            setOrdersError('Не удалось получить список неоплаченных рейсов');
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
     * Показывать ли реестр подбора.
     *
     * Без контрагента и без долгов подбирать нечего, и окно остаётся
     * узкой формой, как было: широкий пустой документ ради одной строки —
     * та же несерьёзность, только наоборот.
     */
    const hasRegister = loadingOrders || openOrders.length > 0 || pickedOrders.length > 0;

    /**
     * Принять выбор из окна подбора.
     *
     * Сумма платежа складывается из отмеченных рейсов: бухгалтер отмечает
     * то, за что пришли деньги, а не считает итог в уме и печатает его.
     */
    const applyPickedOrders = (picked: Record<string, number>) => {
        const cleaned: Record<string, number> = {};
        for (const [orderId, value] of Object.entries(picked)) {
            if ((value || 0) > 0) cleaned[orderId] = value;
        }
        setOrderShares(cleaned);

        const total = Math.round(
            Object.values(cleaned).reduce((sum, value) => sum + (value || 0), 0) * 100,
        ) / 100;
        if (total > 0) paymentForm.setFieldsValue({ amount: total });
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
        {/*
            Один документ, а не два окна друг на друге.

            Подбор заявок сначала жил в отдельном окне поверх этого: половина
            формы платежа торчала из-под него, и связь между ними читалась
            плохо. В бухгалтерской программе, от которой приходят люди, это
            один документ — реквизиты сверху, строки подбора в теле, итог
            внизу. Здесь так же.
        */}
        <Modal
            title={editingPayment ? 'Редактировать платёж' : 'Регистрация платежа'}
            open={paymentModalOpen}
            onCancel={() => setPaymentModalOpen(false)}
            onOk={() => paymentForm.submit()}
            okText={editingPayment ? 'Сохранить' : 'Провести платёж'}
            cancelText="Отмена"
            confirmLoading={paymentLoading}
            width={hasRegister ? 1080 : 520}
            destroyOnClose
        >
            <Form form={paymentForm} layout="vertical" onFinish={handleSavePayment}>
                <div className={hasRegister ? styles.grid : undefined}>
                    <Form.Item name="direction" label="Направление платежа" rules={[{ required: true }]}>
                        <Select disabled={!!editingPayment}>
                            <Select.Option value="IN">Поступление</Select.Option>
                            <Select.Option value="OUT">Расход</Select.Option>
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
                        <Select placeholder="Выберите контрагента" allowClear showSearch optionFilterProp="children">
                            {partners.map(p => (
                                <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item name="note" label="Примечание" className={hasRegister ? styles.wide : undefined}>
                        <TextArea rows={hasRegister ? 1 : 2} placeholder="Номер платёжного поручения, назначение платежа" />
                    </Form.Item>
                </div>

                {/* Реестр подбора: заказчик присылает один перевод за два
                    десятка рейсов, и отмечать их надо помногу. */}
                {hasRegister && (
                    <OrderPaymentRegister
                        orders={openOrders}
                        loading={loadingOrders}
                        error={ordersError}
                        value={orderShares}
                        onChange={applyPickedOrders}
                        direction={direction === 'OUT' ? 'OUT' : 'IN'}
                    />
                )}

                {/* Итог отмеченного стоит строкой в самой таблице, поэтому
                    здесь — только расхождение с суммой платежа: заметить его
                    надо до нажатия «Провести», а не после. */}
                {hasRegister && pickedOrders.length > 0
                    && Math.abs((Number(amount) || 0) - sharesTotal) > 0.009 && (
                    <div className={styles.summary}>
                        <span className={styles.summaryWarn}>
                            Отмечено на {money(sharesTotal)}, а сумма платежа — {money(Number(amount) || 0)}.
                            {(Number(amount) || 0) > sharesTotal
                                ? ' Разница останется авансом.'
                                : ' Разнесено больше платежа — платёж не пройдёт.'}
                        </span>
                    </div>
                )}
            </Form>
        </Modal>
        </>
    );
}
