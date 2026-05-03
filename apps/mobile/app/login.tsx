import { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useStore } from '@/store';

export default function LoginScreen() {
    const [step, setStep] = useState<'phone' | 'code'>('phone');
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);

    const { requestSmsCode, verifySmsCode } = useStore();

    const handleRequestCode = async () => {
        if (!phone || phone.length < 10) {
            Alert.alert('Ошибка', 'Введите корректный номер телефона');
            return;
        }

        setLoading(true);
        try {
            await requestSmsCode(phone);
            setStep('code');
            Alert.alert('Код отправлен', `SMS с кодом отправлен на ${phone}`);
        } catch (error: any) {
            Alert.alert('Ошибка', error.response?.data?.message || 'Не удалось отправить код');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyCode = async () => {
        if (!code || code.length < 4) {
            Alert.alert('Ошибка', 'Введите код из SMS');
            return;
        }

        setLoading(true);
        try {
            await verifySmsCode(phone, code);
            router.replace('/(tabs)');
        } catch (error: any) {
            Alert.alert('Ошибка', error.response?.data?.message || 'Неверный код');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={styles.content}>
                <Text style={styles.logo}>🚛</Text>
                <Text style={styles.title}>LogComp</Text>
                <Text style={styles.subtitle}>Приложение водителя</Text>

                {step === 'phone' ? (
                    <>
                        <Text style={styles.label}>Номер телефона</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="+7 (___) ___-__-__"
                            keyboardType="phone-pad"
                            value={phone}
                            onChangeText={setPhone}
                            autoFocus
                        />
                        <TouchableOpacity
                            style={[styles.button, loading && styles.buttonDisabled]}
                            onPress={handleRequestCode}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.buttonText}>Получить код</Text>
                            )}
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        <Text style={styles.label}>Код из SMS</Text>
                        <Text style={styles.phoneHint}>Отправлен на {phone}</Text>
                        <TextInput
                            style={[styles.input, styles.codeInput]}
                            placeholder="0000"
                            keyboardType="number-pad"
                            maxLength={4}
                            value={code}
                            onChangeText={setCode}
                            autoFocus
                        />
                        <TouchableOpacity
                            style={[styles.button, loading && styles.buttonDisabled]}
                            onPress={handleVerifyCode}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.buttonText}>Войти</Text>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.linkButton}
                            onPress={() => setStep('phone')}
                        >
                            <Text style={styles.linkText}>Изменить номер</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>
        </KeyboardAvoidingView>
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
    label: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        alignSelf: 'flex-start',
        marginBottom: 8,
        width: '100%',
    },
    phoneHint: {
        fontSize: 14,
        color: '#666',
        marginBottom: 16,
    },
    input: {
        width: '100%',
        height: 56,
        backgroundColor: '#fff',
        borderRadius: 12,
        paddingHorizontal: 16,
        fontSize: 18,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        marginBottom: 16,
    },
    codeInput: {
        textAlign: 'center',
        fontSize: 32,
        letterSpacing: 16,
    },
    button: {
        width: '100%',
        height: 56,
        backgroundColor: '#1677ff',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    linkButton: {
        marginTop: 16,
        padding: 8,
    },
    linkText: {
        color: '#1677ff',
        fontSize: 16,
    },
});
