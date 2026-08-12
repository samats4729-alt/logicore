'use client';

import { useState } from 'react';
import { Form, Input } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { KeyRound, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import nova from '@/components/nova/nova.module.css';

/**
 * Свои данные владельца платформы: имя и пароль.
 *
 * Экран был витриной. В поля подставлялись выдуманные «Admin», «System» и
 * «admin@logicore.kz» — не те, под кем вошли. Сохранение ничего не
 * отправляло: полсекунды ожидания и «Профиль сохранён», хотя ничего не
 * менялось. То же с паролем: «Пароль изменён» — и старый продолжал работать.
 * Такое хуже неработающей кнопки: человек уверен, что дело сделано.
 *
 * Теперь оба действия идут в те же ручки, которыми пользуется кабинет
 * (`PUT /users/profile` и `PUT /users/password`).
 *
 * Вкладка «Уведомления» убрана целиком: три переключателя — почта, push, SMS
 * — не были подключены никуда и возвращались в исходное состояние при
 * следующем открытии страницы.
 */
export default function SettingsPage() {
    const { user, checkAuth } = useAuthStore();
    const [savingProfile, setSavingProfile] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);
    const [passwordForm] = Form.useForm();

    const handleSaveProfile = async (values: any) => {
        setSavingProfile(true);
        try {
            await api.put('/users/profile', {
                firstName: values.firstName,
                lastName: values.lastName,
            });
            await checkAuth();
            toast.success('Профиль сохранён');
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось сохранить профиль');
        } finally {
            setSavingProfile(false);
        }
    };

    const handleChangePassword = async (values: any) => {
        if (values.newPassword !== values.confirmPassword) {
            toast.error('Новый пароль и подтверждение не совпадают');
            return;
        }
        setSavingPassword(true);
        try {
            await api.put('/users/password', {
                currentPassword: values.currentPassword,
                newPassword: values.newPassword,
            });
            passwordForm.resetFields();
            toast.success('Пароль изменён');
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось изменить пароль');
        } finally {
            setSavingPassword(false);
        }
    };

    return (
        <div>
            <div className={nova.hero}>
                <div>
                    <div className={nova.eyebrow}>Платформа</div>
                    <h1 className={nova.title}>Настройки</h1>
                    <p className={nova.subtitle}>
                        Ваши данные и пароль от учётной записи владельца платформы.
                    </p>
                </div>
            </div>

            <div className={nova.duo}>
                <section className={nova.card}>
                    <div className={nova.cardHead}>
                        <UserRound size={14} />
                        <h2 className={nova.cardTitle}>Профиль</h2>
                    </div>
                    <div className={nova.cardBody}>
                        <Form
                            layout="vertical"
                            onFinish={handleSaveProfile}
                            initialValues={{
                                firstName: user?.firstName || '',
                                lastName: user?.lastName || '',
                                email: user?.email || '',
                            }}
                        >
                            <Form.Item label="Имя" name="firstName" rules={[{ required: true }]}>
                                <Input />
                            </Form.Item>
                            <Form.Item label="Фамилия" name="lastName" rules={[{ required: true }]}>
                                <Input />
                            </Form.Item>
                            {/* Адрес входа меняется не отсюда: по нему заведена
                                учётная запись, и смена — отдельная история с
                                подтверждением. Поле показано, чтобы было видно,
                                под кем вошли. */}
                            <Form.Item label="Адрес входа" name="email">
                                <Input disabled />
                            </Form.Item>
                            <button
                                type="submit"
                                className={`${nova.action} ${nova.actionPrimary}`}
                                disabled={savingProfile}
                            >
                                <SaveOutlined /> Сохранить
                            </button>
                        </Form>
                    </div>
                </section>

                <section className={nova.card}>
                    <div className={nova.cardHead}>
                        <KeyRound size={14} />
                        <h2 className={nova.cardTitle}>Пароль</h2>
                    </div>
                    <div className={nova.cardBody}>
                        <Form form={passwordForm} layout="vertical" onFinish={handleChangePassword}>
                            <Form.Item
                                label="Текущий пароль"
                                name="currentPassword"
                                rules={[{ required: true, message: 'Введите текущий пароль' }]}
                            >
                                <Input.Password />
                            </Form.Item>
                            <Form.Item
                                label="Новый пароль"
                                name="newPassword"
                                rules={[{ required: true, min: 8, message: 'Не короче 8 символов' }]}
                            >
                                <Input.Password />
                            </Form.Item>
                            <Form.Item
                                label="Подтверждение"
                                name="confirmPassword"
                                rules={[{ required: true, message: 'Повторите новый пароль' }]}
                            >
                                <Input.Password />
                            </Form.Item>
                            <button
                                type="submit"
                                className={`${nova.action} ${nova.actionPrimary}`}
                                disabled={savingPassword}
                            >
                                <SaveOutlined /> Изменить пароль
                            </button>
                        </Form>
                    </div>
                </section>
            </div>
        </div>
    );
}
