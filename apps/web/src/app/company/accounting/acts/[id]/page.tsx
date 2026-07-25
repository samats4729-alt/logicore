'use client';

import { useParams } from 'next/navigation';
import AccountingDocumentCard from '@/components/accounting/AccountingDocumentCard';

/** Карточка акта выполненных работ. Разметка общая с карточкой счёта. */
export default function ServiceActCardPage() {
    const { id } = useParams() as { id: string };
    return <AccountingDocumentCard documentId={id} type="SERVICE_ACT" />;
}
