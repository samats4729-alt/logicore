'use client';

import DictionaryManager from '@/components/finance/DictionaryManager';

export default function PaymentFormsPage() {
    return (
        <DictionaryManager
            kind="payment-form"
            title="Формы оплаты"
            description="Формы оплаты для заявок на перевозку: безналичный расчёт, наличные, банковская карта."
            namePlaceholder="Например: Безналичный расчёт"
        />
    );
}
