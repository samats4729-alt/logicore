'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, DatePicker, Form, Input, InputNumber, Modal, Select, Spin } from 'antd';
import type { FormInstance } from 'antd';
import dayjs from 'dayjs';
import { AllocationSuggestionItem, suggestAllocation } from '@/lib/accounting-documents';

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
}: OrderFinanceModalsProps) {
    const [openInvoices, setOpenInvoices] = useState<AllocationSuggestionItem[]>([]);
    const [loadingInvoices, setLoadingInvoices] = useState(false);

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

    const allocatedTotal = Object.values(allocations).reduce((sum, value) => sum + (value || 0), 0);
    const rest = Math.round(((Number(amount) || 0) - allocatedTotal) * 100) / 100;

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

                {/* Разнесение по счетам: пока платёж не разнесён, видно
                    только что деньги пришли, но не какие счета закрыты. */}
                {loadingInvoices ? (
                    <div style={{ textAlign: 'center', padding: 12 }}><Spin size="small" /></div>
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
