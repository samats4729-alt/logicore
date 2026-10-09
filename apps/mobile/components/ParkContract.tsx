import { Text } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { DriverProfile, вКавычках } from '@/lib/exchange';
import { Card } from '@/components/kit';

/**
 * Суть договора водителя с парком — одним текстом для анкеты (где его
 * подписывают) и для «Моих документов» (где его потом перечитывают).
 * Две копии текста однажды разошлись бы, и водитель прочёл бы в профиле
 * не то, что подписал.
 */
export function ParkContractSummary({ driver }: { driver: Pick<DriverProfile, 'park' | 'lastName' | 'firstName' | 'middleName' | 'vehiclePlate'> }) {
    const { colors } = useAppTheme();
    return (
        <Card>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 8 }}>
                Договор аренды транспортного средства с экипажем
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21 }}>
                Стороны: парк {вКавычках(driver.park?.name)} и {[driver.lastName, driver.firstName, driver.middleName].filter(Boolean).join(' ') || 'вы'}.{'\n\n'}
                Парк берёт в аренду вашу машину {driver.vehiclePlate ? `(${driver.vehiclePlate}) ` : ''}вместе с вами за рулём на время рейсов,
                которые вы берёте на бирже. За каждый рейс парк платит вам сумму груза за вычетом комиссии парка и налогов,
                которые парк удерживает и платит за вас по закону.{'\n\n'}
                Полный текст договора передаст парк. Нажимая «Подписываю», вы соглашаетесь с ним; система запомнит время и телефон подписи.
            </Text>
        </Card>
    );
}
