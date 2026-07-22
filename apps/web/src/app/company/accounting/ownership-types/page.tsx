'use client';

import DictionaryManager from '@/components/finance/DictionaryManager';

export default function OwnershipTypesPage() {
    return (
        <DictionaryManager
            kind="ownership-type"
            title="Формы собственности контрагентов"
            description="Организационно-правовые формы контрагентов: ТОО, ИП, АО и другие."
            namePlaceholder="Например: ТОО"
        />
    );
}
