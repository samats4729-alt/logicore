'use client';

import { useParams } from 'next/navigation';
import AccountingDocumentCard from '@/components/accounting/AccountingDocumentCard';

/** Карточка счёта на оплату. Разметка общая с карточкой акта. */
export default function InvoiceCardPage() {
    const { id } = useParams() as { id: string };
    return <AccountingDocumentCard documentId={id} type="PAYMENT_INVOICE" />;
}
