'use client';

import DictionaryManager from '@/components/finance/DictionaryManager';

export default function PaymentConditionsPage() {
    return (
        <DictionaryManager
            kind="payment-condition"
            title="Условия оплаты"
            description="Условия оплаты для заявок на перевозку: предоплата, по факту, отсрочка. Используются при оформлении заявки."
            namePlaceholder="Например: Отсрочка 5 банковских дней"
        />
    );
}
