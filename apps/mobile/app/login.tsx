import {
    View,
    Text,
    StyleSheet,
} from 'react-native';

export default function LoginScreen() {
    return (
        <View style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.logo}>🚛</Text>
                <Text style={styles.title}>LogiCore</Text>
                <Text style={styles.subtitle}>Приложение водителя</Text>
                <View style={styles.maintenanceCard}>
                    <Text style={styles.maintenanceText}>
                        Авторизация в мобильном приложении временно отключена.
                    </Text>
                    <Text style={styles.maintenanceSubtext}>
                        Пожалуйста, используйте веб-версию платформы.
                    </Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    logo: {
        fontSize: 72,
        marginBottom: 8,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#1677ff',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 16,
        color: '#666',
        marginBottom: 48,
    },
    maintenanceCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        width: '100%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    maintenanceText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        textAlign: 'center',
        marginBottom: 8,
        lineHeight: 22,
    },
    maintenanceSubtext: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
    },
});
