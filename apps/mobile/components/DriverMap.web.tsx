import { Text, View } from 'react-native';

/** Предпросмотр в браузере: карта Mapbox работает только в приложении на телефоне. */
export default function DriverMap() {
    return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ fontSize: 15, color: '#5f6672', textAlign: 'center' }}>Карта открывается в приложении на телефоне.</Text>
        </View>
    );
}
