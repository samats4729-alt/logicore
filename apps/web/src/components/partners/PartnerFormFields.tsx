'use client';

import { Checkbox, Col, Form, Input, Row, Select, Space } from 'antd';
import { companyFieldsFromLookup, lookupCompanyByBin } from '@/lib/company-lookup';

/**
 * Поля карточки контрагента — одни и те же везде, где её правят.
 *
 * Окон правки было два, и они отличались: из списка давали роль, номер
 * перевозки заказчика и ответственного менеджера, из карточки — только
 * шесть полей. Один и тот же контрагент выглядел по-разному в зависимости
 * от того, откуда в него зашли, и часть полей нельзя было заполнить вовсе,
 * если открыл не с той стороны.
 *
 * Банковских реквизитов не было ни в одном. При этом договор печатает блок
 * реквизитов обеих сторон — «р/счёт», «Банк», «БИК/SWIFT», «КБЕ», — и они
 * уходили пустыми. Подтянуться сами они не могут: по БИН из госреестра
 * приходят название, адрес, директор и контакты, банковских счетов там нет
 * и быть не может. Значит, ввести их должен человек, и место для этого
 * обязано быть.
 */

/** Что показывать: у окна из карточки нет смысла в выборе ролей. */
export interface PartnerFormFieldsProps {
    /** Офисные сотрудники — для выбора ответственного. */
    officeUsers?: { id: string; firstName: string; lastName: string }[];
    /** Ответственного назначает только администратор компании. */
    canAssignManager?: boolean;
}

/** Карточка из справочника → значения формы. */
export function partnerToFormValues(company: Record<string, any>) {
    const roles: string[] = [];
    if (company.isCustomer) roles.push('customer');
    if (company.isCarrier) roles.push('carrier');
    return { ...company, roles };
}

/**
 * Значения формы → тело запроса.
 *
 * Роли в форме — галочки, на сервере — два признака. Ответственный
 * отправляется явным `null`, когда его сняли: `undefined` до сервера не
 * доедет, и снять ответственного было бы нельзя.
 */
export function partnerFormToBody(
    values: Record<string, any>,
    options: { withManager?: boolean } = {},
) {
    const { roles = [], responsibleManagerId, ...rest } = values;
    const isCustomer = roles.includes('customer');
    const isCarrier = roles.includes('carrier');

    const body: Record<string, any> = {
        ...rest,
        isCustomer,
        isCarrier,
        type: isCustomer ? 'CUSTOMER' : 'FORWARDER',
    };
    if (options.withManager) body.responsibleManagerId = responsibleManagerId ?? null;
    return body;
}

/**
 * Подставить реквизиты по БИН.
 *
 * Вешается на `onValuesChange` формы: двенадцать цифр — повод сходить в
 * реестр, всё остальное — нет.
 */
export async function подставитьПоБин(
    changedValues: Record<string, any>,
    form: { setFieldsValue: (v: Record<string, any>) => void },
) {
    if (!changedValues.bin || !/^\d{12}$/.test(changedValues.bin)) return;
    const found = await lookupCompanyByBin(changedValues.bin);
    if (found) {
        form.setFieldsValue(companyFieldsFromLookup(found, {
            withAddress: true, withDirector: true,
        }));
    }
}

/** Подпись раздела внутри окна. */
function Раздел({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            fontSize: 13, fontWeight: 600, color: 'var(--nova-fg)',
            marginTop: 18, marginBottom: 10,
            paddingTop: 14, borderTop: '1px solid var(--nova-border)',
        }}>
            {children}
        </div>
    );
}

export default function PartnerFormFields({
    officeUsers = [],
    canAssignManager = false,
}: PartnerFormFieldsProps) {
    return (
        <>
            <Form.Item name="name" label="Название компании" rules={[{ required: true, message: 'Введите название' }]}>
                <Input placeholder="ТОО Пример" />
            </Form.Item>

            <Form.Item
                name="roles"
                label="Роль контрагента"
                rules={[{ required: true, message: 'Выберите хотя бы одну роль' }]}
            >
                <Checkbox.Group style={{ width: '100%' }}>
                    <Space direction="horizontal" size="large">
                        <Checkbox value="customer">Заказчик</Checkbox>
                        <Checkbox value="carrier">Перевозчик</Checkbox>
                    </Space>
                </Checkbox.Group>
            </Form.Item>

            <Row gutter={12}>
                <Col span={12}>
                    <Form.Item
                        name="bin"
                        label="БИН/ИИН"
                        rules={[
                            { required: true, message: 'Введите БИН/ИИН' },
                            { pattern: /^\d{12}$/, message: 'БИН/ИИН должен состоять ровно из 12 цифр' },
                        ]}
                    >
                        <Input placeholder="123456789012" maxLength={12} />
                    </Form.Item>
                </Col>
                <Col span={12}>
                    <Form.Item name="kbe" label="КБЕ">
                        <Input placeholder="17" maxLength={2} />
                    </Form.Item>
                </Col>
            </Row>

            <Row gutter={12}>
                <Col span={12}>
                    <Form.Item name="phone" label="Телефон">
                        <Input placeholder="+77001234567" />
                    </Form.Item>
                </Col>
                <Col span={12}>
                    <Form.Item name="email" label="Email">
                        <Input placeholder="company@example.com" />
                    </Form.Item>
                </Col>
            </Row>

            <Form.Item name="address" label="Юридический адрес">
                <Input placeholder="г. Алматы, ул. Абая 1" />
            </Form.Item>
            <Form.Item
                name="actualAddress"
                label="Фактический адрес"
                help="Если совпадает с юридическим — можно не заполнять"
            >
                <Input placeholder="г. Алматы, ул. Толе би 50" />
            </Form.Item>

            <Раздел>Банковские реквизиты</Раздел>
            <Form.Item
                name="bankAccount"
                label="Расчётный счёт (ИИК)"
                help="Печатается в договоре и счёте. Из реестра по БИН не приходит — только вручную"
            >
                <Input placeholder="KZ123456789012345678" />
            </Form.Item>
            <Row gutter={12}>
                <Col span={14}>
                    <Form.Item name="bankName" label="Банк">
                        <Input placeholder="АО «Банк ЦентрКредит»" />
                    </Form.Item>
                </Col>
                <Col span={10}>
                    <Form.Item name="bankBic" label="БИК/SWIFT">
                        <Input placeholder="KCJBKZKX" />
                    </Form.Item>
                </Col>
            </Row>
            <Form.Item
                name="paymentPurposeCode"
                label="Код назначения платежа (КНП)"
            >
                <Input placeholder="710" maxLength={3} />
            </Form.Item>

            <Раздел>Кто подписывает документы</Раздел>
            <Form.Item name="directorName" label="ФИО руководителя">
                <Input placeholder="Иванов Иван Иванович" />
            </Form.Item>
            <Row gutter={12}>
                <Col span={12}>
                    <Form.Item
                        name="signatoryName"
                        label="ФИО подписанта"
                        help="Если подписывает не руководитель"
                    >
                        <Input placeholder="Петров Пётр Петрович" />
                    </Form.Item>
                </Col>
                <Col span={12}>
                    <Form.Item name="signatoryPosition" label="Должность подписанта">
                        <Input placeholder="Коммерческий директор" />
                    </Form.Item>
                </Col>
            </Row>

            <Раздел>Как заказчик ведёт учёт</Раздел>
            {/*
              * Номер перевозки у самого заказчика. У крупных клиентов заявка
              * живёт и в их системе под своим номером — у одного это «ID», у
              * другого «Номер ТТН», — и счёт они сверяют по нему. Название
              * задаёт заказчик, поэтому это настройка, а не поле с готовым
              * именем.
              */}
            <Form.Item
                name="customerRefLabel"
                label="Как заказчик называет свой номер перевозки"
                help="Появится отдельной графой в заявке. Пусто — графы не будет"
            >
                <Input placeholder="Например: ID, Номер ТТН, Номер заказа" />
            </Form.Item>
            <Form.Item
                name="customerRefPrintInvoice"
                valuePropName="checked"
                help="Заказчик сверяет счёт по своему номеру — без него счёт возвращают на переделку"
            >
                <Checkbox>Печатать этот номер в счёте</Checkbox>
            </Form.Item>

            {canAssignManager && (
                <Form.Item
                    name="responsibleManagerId"
                    label="Ответственный менеджер"
                    help="Кто ведёт этого контрагента. Если включена настройка «менеджеры видят только своих контрагентов», его будет видеть только ответственный"
                >
                    <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        filterOption={(input, option) =>
                            String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                        placeholder="Не назначен (виден всем менеджерам)"
                        options={officeUsers.map(u => ({ value: u.id, label: `${u.lastName} ${u.firstName}` }))}
                    />
                </Form.Item>
            )}
        </>
    );
}
