import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useAppTheme } from '@/hooks/useAppTheme';
import { Button, Empty } from '@/components/kit';

/**
 * Мой рейс.
 *
 * На бирже водитель откликается на заявку, а исполнителя выбирает
 * компания. Когда выберут — заявка станет его рейсом: маршрут с адресами,
 * шаги, документы и навигатор появятся здесь (следующий шаг биржи).
 */
export default function TripScreen() {
    const { colors } = useAppTheme();
    return (
        <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: 120, flexGrow: 1 }}>
            <Empty
                icon="navigate-outline"
                title="Сейчас рейса нет"
                text="Когда компания выберет вас исполнителем, здесь появится рейс: маршрут с адресами, шаги и документы."
                action={<Button title="К грузам" icon="cube-outline" onPress={() => router.push('/exchange/(tabs)/loads')} />}
            />
        </ScrollView>
    );
}
