'use client';

import { DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';

const { TextArea } = Input;

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
    accounts, categories, partners,
}: OrderFinanceModalsProps) {
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
            title={editingPayment ? "Редактировать платеж" : "Зарегистрировать платеж"}
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

                <Form.Item name="accountId" label="Счет / Касса">
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
            </Form>
        </Modal>
        </>
    );
}
