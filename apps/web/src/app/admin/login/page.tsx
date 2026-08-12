'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Form, Input } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { toast } from 'sonner';
import nova from '@/components/nova/nova.module.css';
import styles from './admin-login.module.css';

export default function AdminLoginPage() {
    const router = useRouter();
    const { login, user, logout } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [hydrated, setHydrated] = useState(false);

    // Дожидаемся гидратации хранилища Zustand из localStorage
    useEffect(() => {
        setHydrated(useAuthStore.persist.hasHydrated());
        const unsub = useAuthStore.persist.onFinishHydration(() => {
            setHydrated(true);
        });
        return () => unsub();
    }, []);

    // Редирект авторизованного администратора
    useEffect(() => {
        if (!hydrated) return;
        const currentUser = useAuthStore.getState().user;
        if (currentUser && currentUser.role === 'ADMIN') {
            router.replace('/admin');
        }
    }, [hydrated, router]);

    const onFinish = async (values: any) => {
        setLoading(true);
        try {
            await login(values.email, values.password, 'web-admin');

            // Права проверяет оболочка админки: она в любом случае смотрит
            // роль вошедшего и выкидывает не-администратора. Проверять их
            // здесь во второй раз — держать две копии одного правила.
            router.push('/admin');
            toast.success('С возвращением');
        } catch (error: any) {
            console.error(error);
            if (error.response?.status === 401) {
                toast.error('Неверный логин или пароль');
            } else {
                toast.error('Ошибка входа');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`lc-nova ${styles.screen}`}>
            <section className={`${nova.card} ${styles.card}`}>
                <div className={nova.cardBody}>
                    <div className={styles.head}>
                        <span className={styles.mark}><ShieldCheck size={20} /></span>
                        <h1 className={styles.title}>Панель платформы</h1>
                        <p className={styles.sub}>Вход только для сотрудников LogiCore</p>
                    </div>

                    <Form name="admin_login" onFinish={onFinish} layout="vertical" size="large">
                        <Form.Item
                            name="email"
                            rules={[
                                { required: true, message: 'Введите почту' },
                                { type: 'email', message: 'Похоже, в адресе опечатка' },
                            ]}
                        >
                            <Input prefix={<UserOutlined />} placeholder="Почта" />
                        </Form.Item>

                        <Form.Item
                            name="password"
                            rules={[{ required: true, message: 'Введите пароль' }]}
                        >
                            <Input.Password prefix={<LockOutlined />} placeholder="Пароль" />
                        </Form.Item>

                        <button
                            type="submit"
                            className={`${nova.action} ${nova.actionPrimary} ${styles.submit}`}
                            disabled={loading}
                        >
                            Войти
                        </button>
                    </Form>
                </div>
            </section>
        </div>
    );
}
