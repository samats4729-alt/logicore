'use client';

import DictionaryManager from '@/components/finance/DictionaryManager';

export default function BanksPage() {
    return (
        <DictionaryManager
            kind="bank"
            title="Банки"
            description="Справочник банков для реквизитов контрагентов и счетов. Код — БИК банка."
            hasCode
            codeLabel="БИК"
            namePlaceholder="Например: Народный банк Казахстана (Halyk Bank)"
        />
    );
}
