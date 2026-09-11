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
 *
 * Поля стоят в две колонки, а окно широкое. В один столбец этот же набор
 * превращался в простыню на два экрана, и до банковских реквизитов надо
 * было доскроллить. На узком экране колонки складываются в одну сами —
 * за это отвечает `md` у каждой ячейки.
 *
 * Строка всегда делится пополам, а мелкие поля (КБЕ при БИН, БИК и КНП при
 * счёте) прячутся внутрь половины. Если вместо этого дать им свою долю от
 * всей ширины, правые края полей перестают совпадать и сетка выглядит
 * случайной.
 */

/** Что показывать: ответственного назначает только администратор. */
export interface PartnerFormFieldsProps {
    /** Офисные сотрудники — для выбора ответственного. */
    officeUsers?: { id: string; firstName: string; lastName: string }[];
    canAssignManager?: boolean;
}

/**
 * Размеры окна правки.
 *
 * Ширины хватает на две колонки с подписями под полями. Высоту ограничиваем
 * экраном: на ноутбуке набор полей длиннее окна, и без ограничения кнопки
 * «Сохранить» и «Отмена» уезжают за нижний край — их не видно и не нажать.
 * Прокручивается тогда сама середина окна, а шапка и кнопки стоят на месте.
 */
export const ОКНО_КОНТРАГЕНТА = {
    width: 880,
    centered: true,
    styles: {
        body: {
            maxHeight: 'calc(100vh - 200px)',
            overflowY: 'auto' as const,
            paddingRight: 12,
        },
    },
};

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
function Раздел({ children, hint }: { children: React.ReactNode; hint?: string }) {
    return (
        <div style={{
            marginTop: 12, marginBottom: 10,
            paddingTop: 12, borderTop: '1px solid var(--nova-border)',
        }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--nova-fg)' }}>{children}</div>
            {hint && (
                <div style={{ fontSize: 12, color: 'var(--nova-fg-2)', marginTop: 2 }}>{hint}</div>
            )}
        </div>
    );
}

/** Ячейка сетки: на узком экране занимает всю ширину. */
function Поле({ span = 12, children }: { span?: number; children: React.ReactNode }) {
    return <Col xs={24} md={span}>{children}</Col>;
}

/** Половина строки, разделённая на два поля: широкое и короткое рядом. */
function Пара({ left, right, leftSpan = 16 }: {
    left: React.ReactNode; right: React.ReactNode; leftSpan?: number;
}) {
    return (
        <Поле>
            <Row gutter={12}>
                <Col span={leftSpan}>{left}</Col>
                <Col span={24 - leftSpan}>{right}</Col>
            </Row>
        </Поле>
    );
}

export default function PartnerFormFields({
    officeUsers = [],
    canAssignManager = false,
}: PartnerFormFieldsProps) {
    return (
        <>
            <Row gutter={16}>
                <Поле>
                    <Form.Item name="name" label="Название компании" rules={[{ required: true, message: 'Введите название' }]}>
                        <Input placeholder="ТОО Пример" />
                    </Form.Item>
                </Поле>
                <Поле>
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
                </Поле>

                <Пара
                    left={(
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
                    )}
                    right={(
                        <Form.Item name="kbe" label="КБЕ">
                            <Input placeholder="17" maxLength={2} />
                        </Form.Item>
                    )}
                />
                <Пара
                    leftSpan={11}
                    left={(
                        <Form.Item name="phone" label="Телефон">
                            <Input placeholder="+77001234567" />
                        </Form.Item>
                    )}
                    right={(
                        <Form.Item name="email" label="Email">
                            <Input placeholder="company@example.com" />
                        </Form.Item>
                    )}
                />

                <Поле>
                    <Form.Item name="address" label="Юридический адрес">
                        <Input placeholder="г. Алматы, ул. Абая 1" />
                    </Form.Item>
                </Поле>
                <Поле>
                    <Form.Item
                        name="actualAddress"
                        label="Фактический адрес"
                        help="Совпадает с юридическим — можно не заполнять"
                    >
                        <Input placeholder="г. Алматы, ул. Толе би 50" />
                    </Form.Item>
                </Поле>
            </Row>

            <Раздел hint="Печатаются в договоре и счёте. Из реестра по БИН не приходят — только вручную">
                Банковские реквизиты
            </Раздел>
            <Row gutter={16}>
                <Поле>
                    <Form.Item name="bankAccount" label="Расчётный счёт (ИИК)">
                        <Input placeholder="KZ123456789012345678" />
                    </Form.Item>
                </Поле>
                <Поле>
                    <Form.Item name="bankName" label="Банк">
                        <Input placeholder="АО «Банк ЦентрКредит»" />
                    </Form.Item>
                </Поле>
                <Поле>
                    <Form.Item name="bankBic" label="БИК/SWIFT">
                        <Input placeholder="KCJBKZKX" />
                    </Form.Item>
                </Поле>
                <Поле>
                    <Form.Item name="paymentPurposeCode" label="Код назначения платежа (КНП)">
                        <Input placeholder="710" maxLength={3} />
                    </Form.Item>
                </Поле>
            </Row>

            <Раздел>Кто подписывает документы</Раздел>
            <Row gutter={16}>
                <Поле span={8}>
                    <Form.Item name="directorName" label="ФИО руководителя">
                        <Input placeholder="Иванов Иван Иванович" />
                    </Form.Item>
                </Поле>
                <Поле span={8}>
                    <Form.Item
                        name="signatoryName"
                        label="ФИО подписанта"
                        help="Если подписывает не руководитель"
                    >
                        <Input placeholder="Петров Пётр Петрович" />
                    </Form.Item>
                </Поле>
                <Поле span={8}>
                    <Form.Item name="signatoryPosition" label="Должность подписанта">
                        <Input placeholder="Коммерческий директор" />
                    </Form.Item>
                </Поле>
            </Row>

            <Раздел>Как заказчик ведёт учёт</Раздел>
            <Row gutter={16}>
                {/*
                  * Номер перевозки у самого заказчика. У крупных клиентов
                  * заявка живёт и в их системе под своим номером — у одного
                  * это «ID», у другого «Номер ТТН», — и счёт они сверяют по
                  * нему. Название задаёт заказчик, поэтому это настройка, а
                  * не поле с готовым именем.
                  */}
                <Поле span={canAssignManager ? 12 : 24}>
                    <Form.Item
                        name="customerRefLabel"
                        label="Как заказчик называет свой номер перевозки"
                        help="Появится отдельной графой в заявке. Пусто — графы не будет"
                    >
                        <Input placeholder="Например: ID, Номер ТТН, Номер заказа" />
                    </Form.Item>
                </Поле>
                {canAssignManager && (
                    <Поле>
                        <Form.Item
                            name="responsibleManagerId"
                            label="Ответственный менеджер"
                            help="Если включена настройка «менеджеры видят только своих контрагентов», его будет видеть только ответственный"
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
                    </Поле>
                )}
                <Поле span={24}>
                    <Form.Item
                        name="customerRefPrintInvoice"
                        valuePropName="checked"
                        help="Заказчик сверяет счёт по своему номеру — без него счёт возвращают на переделку"
                        style={{ marginBottom: 0 }}
                    >
                        <Checkbox>Печатать этот номер в счёте</Checkbox>
                    </Form.Item>
                </Поле>
            </Row>
        </>
    );
}
