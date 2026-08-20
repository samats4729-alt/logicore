'use client';

import {  AutoComplete, Button, Col, DatePicker, Divider, Form, Input, InputNumber, Row, Select, Typography } from 'antd';
import type { FormInstance } from 'antd';
import { CheckCircleOutlined, DeleteOutlined, EnvironmentOutlined, FlagOutlined, InboxOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { VEHICLE_TYPES } from '@/lib/constants';
import { prepareCompanyOptions } from '@/lib/company-helper';
import { CargoComposition } from '@/components/orders/CargoComposition';
import type { CargoState } from '@/lib/cargo';
import CurrencySelect from '@/components/orders/CurrencySelect';
import { MarginSummary } from '@/components/orders/MarginSummary';
import { MoneyInput } from '@/components/ui/MoneyInput';
import nova from '@/components/nova/nova.module.css';
import { paymentTermsLabel, vatLabel } from '@/lib/settlement-terms';
import type { OrderSettlements } from '@/lib/settlement-terms';

const { TextArea } = Input;
const { Text } = Typography;

// Спецзначения выпадающих списков сторон сделки — те же, что в карточке.
const MARKETPLACE_VALUE = '__MARKETPLACE__';
const MY_COMPANY_VALUE = '__MY_COMPANY__';

interface OrderEditFormProps {
    editForm: FormInstance;
    handleEditOrder: (values: any) => void;

    /** Точки маршрута правятся отдельным состоянием, а не полями формы. */
    routePointsState: any[];
    setRoutePointsState: (points: any[]) => void;
    getLocationOptions: () => any[];
    locations: any[];

    /** Стороны сделки */
    selectedCustomer: string;
    setSelectedCustomer: (id: string) => void;
    selectedCarrier: string;
    setSelectedCarrier: (id: string) => void;
    getPartyOptions: (role: 'customer' | 'carrier') => any[];
    myCompanyName: string;
    roleInfo: { text: string; color: string };
    setQuickPartnerModalOpen: (open: boolean) => void;
    setQuickPartnerTarget: (target: 'CUSTOMER' | 'CARRIER' | null) => void;
    /** Как выбранный заказчик называет свой номер перевозки. Пусто — графы нет. */
    customerRefLabel?: string | null;

    /** Справочники формы — грузятся при входе в режим правки */
    cargoCategories: any[];

    /** Деньги: какие поля показывать и как их назвать зависит от роли */
    showCustomerPriceField: boolean;
    showDriverCostField: boolean;
    customerPriceLabel: string;
    driverCostLabel: string;

    /** Права на правку денежных полей — у логиста их нет. */
    canEditFinance: boolean;
    /**
     * Условия расчётов по рейсу: НДС сторон и сроки оплаты.
     *
     * Здесь они показаны строкой и не правятся: ответ принадлежит карточке
     * контрагента, а по конкретному рейсу его меняет бухгалтер во вкладке
     * «Финансы». Раньше в этой форме стояла галочка «НДС» со снятой отметкой
     * и ставка 16% по умолчанию — и тот, кто ведёт рейс, решал за бухгалтера,
     * сам того не зная.
     */
    settlements?: OrderSettlements | null;
    setIsEditing: (editing: boolean) => void;

    /**
     * Состав груза правится своим состоянием, а не полями формы: паллеты —
     * список переменной длины, а способ погрузки и упаковка — наборы
     * переключателей. Так же он устроен и в мастере создания заявки.
     */
    cargo: CargoState;
    setCargo: (next: CargoState) => void;
}

/**
 * Форма редактирования заявки — самый большой блок карточки.
 *
 * Вынесена, чтобы карточка перестала быть файлом на две с половиной тысячи
 * строк. Логика прежняя: и форма, и состояние точек маршрута, и обработчик
 * сохранения живут в карточке и приходят пропсами.
 */
export default function OrderEditForm(props: OrderEditFormProps) {
    const {
        editForm, handleEditOrder,
        routePointsState, setRoutePointsState, getLocationOptions, locations,
        selectedCustomer, setSelectedCustomer, selectedCarrier, setSelectedCarrier,
        getPartyOptions, myCompanyName, roleInfo,
        setQuickPartnerModalOpen, setQuickPartnerTarget, customerRefLabel,
        settlements,
        cargoCategories,
        showCustomerPriceField, showDriverCostField, customerPriceLabel, driverCostLabel,
        canEditFinance, setIsEditing,
        cargo, setCargo,
    } = props;

    return (
        <Form form={editForm} layout="vertical" onFinish={handleEditOrder}>
            <Row gutter={[24, 24]}>
                <Col xs={24} lg={15}>
                    {/* Route Card (Editable) */}
                    <section className={nova.card} style={{ marginBottom: 16 }}>
                        <div className={nova.cardHead}>
                            <EnvironmentOutlined />
                            <h2 className={nova.cardTitle}>Маршрут следования</h2>
                        </div>
                        <div className={nova.cardBody}>
                        <Form.Item name="pickupDate" label="Дата погрузки" rules={[{ required: true, message: 'Укажите дату' }]}>
                            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY HH:mm" showTime={{ format: 'HH:mm' }} placeholder="Дата и время" />
                        </Form.Item>
                        {routePointsState.map((pt, i) => (
                            /* Точки различаются подписью, а не цветом заливки:
                               синий и зелёный блоки читались как светофор и
                               спорили с чёрно-белой темой кабинета. */
                            <div key={i} style={{
                                padding: '12px 16px',
                                background: 'var(--nova-surface-2)',
                                borderRadius: 12,
                                marginBottom: 12,
                                border: '1px solid var(--nova-border)',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <Select
                                        value={pt.pointType}
                                        onChange={val => { const newPts = [...routePointsState]; newPts[i].pointType = val; setRoutePointsState(newPts); }}
                                        size="small"
                                        style={{ width: 160, fontWeight: 600 }}
                                        variant="borderless"
                                    >
                                        <Select.Option value="PICKUP"><EnvironmentOutlined style={{ marginRight: 4 }} /> Погрузка</Select.Option>
                                        <Select.Option value="ADDITIONAL_PICKUP"><EnvironmentOutlined style={{ marginRight: 4 }} /> Доп. погрузка</Select.Option>
                                        <Select.Option value="DELIVERY"><FlagOutlined style={{ marginRight: 4 }} /> Выгрузка</Select.Option>
                                    </Select>
                                    {routePointsState.length > 2 && (
                                        <Button size="small" danger type="text" icon={<DeleteOutlined />} onClick={() => {
                                            const newPts = [...routePointsState]; newPts.splice(i, 1); setRoutePointsState(newPts);
                                        }} />
                                    )}
                                </div>
                                <Select
                                    placeholder="Выберите адрес"
                                    allowClear showSearch optionFilterProp="children"
                                    style={{ width: '100%' }}
                                    value={pt.id || undefined}
                                    onChange={(val) => {
                                        const newPts = [...routePointsState];
                                        if (!val) { newPts[i] = { ...newPts[i], city: '', address: '', id: undefined }; }
                                        else {
                                            const loc = locations.find((l: any) => l.id === val);
                                            if (loc) {
                                                newPts[i] = { ...newPts[i], city: loc.city || '', address: loc.address, id: loc.id };
                                            }
                                        }
                                        setRoutePointsState(newPts);
                                    }}
                                >
                                    {getLocationOptions().map(group => (
                                        <Select.OptGroup key={group.label} label={group.label}>
                                            {group.options.map((l: any) => (
                                                <Select.Option key={l.id} value={l.id}>
                                                    {l.name}, Казахстан{l.city ? `, ${l.city}` : ''}, {l.address}
                                                </Select.Option>
                                            ))}
                                        </Select.OptGroup>
                                    ))}
                                </Select>
                            </div>
                        ))}
                        <Button
                            type="dashed"
                            icon={<PlusOutlined />}
                            onClick={() => setRoutePointsState([...routePointsState, { city: '', address: '', pointType: 'ADDITIONAL_PICKUP' }])}
                            style={{ width: '100%' }}
                        >
                            Добавить точку
                        </Button>
                        </div>
                    </section>

                    {/* Cargo Card (Editable) */}
                    <section className={nova.card}>
                        <div className={nova.cardHead}>
                            <InboxOutlined />
                            <h2 className={nova.cardTitle}>Информация о грузе</h2>
                        </div>
                        <div className={nova.cardBody}>
                        <Row gutter={12}>
                            <Col span={12}>
                                <Form.Item name="natureOfCargo" label="Характер груза" rules={[{ required: true, message: 'Выберите из списка или впишите свой вариант' }]}>
                                    <AutoComplete
                                        placeholder="Выберите или впишите свой вариант..."
                                        size="large"
                                        options={cargoCategories.map(cat => ({
                                            label: cat.name,
                                            options: (cat.types || []).map((t: any) => ({ value: t.name, label: t.name })),
                                        }))}
                                        filterOption={(input, option: any) =>
                                            String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())
                                        }
                                    />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item name="cargoType" label="Тип кузова">
                                    <Select placeholder="Тент, Реф..." allowClear showSearch optionFilterProp="children" size="large">
                                        {VEHICLE_TYPES.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
                                    </Select>
                                </Form.Item>
                            </Col>
                        </Row>
                        <Form.Item name="cargoDescription" label="Описание груза">
                            <TextArea rows={2} placeholder="Мебель, 20 коробок, палеты..." />
                        </Form.Item>
                        <Row gutter={12}>
                            <Col span={12}>
                                <Form.Item name="cargoWeight" label="Вес (кг)">
                                    <InputNumber min={0} style={{ width: '100%' }} placeholder="0" size="large" />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item name="cargoVolume" label="Объём (м³)">
                                    <InputNumber min={0} style={{ width: '100%' }} placeholder="0" size="large" />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={12}>
                            <Col span={6}>
                                <Form.Item name="cargoLength" label="Длина (м)">
                                    <InputNumber min={0} step={0.1} style={{ width: '100%' }} placeholder="0" size="large" />
                                </Form.Item>
                            </Col>
                            <Col span={6}>
                                <Form.Item name="cargoWidth" label="Ширина (м)">
                                    <InputNumber min={0} step={0.1} style={{ width: '100%' }} placeholder="0" size="large" />
                                </Form.Item>
                            </Col>
                            <Col span={6}>
                                <Form.Item name="cargoHeight" label="Высота (м)">
                                    <InputNumber min={0} step={0.1} style={{ width: '100%' }} placeholder="0" size="large" />
                                </Form.Item>
                            </Col>
                            {/* Пока состава нет — палеты вводят одним числом. Как
                                только состав заполнен, число считается по нему, и
                                отдельное поле только путало бы: в нём можно было
                                написать 20 при составе на 18. */}
                            {cargo.pallets.length === 0 && (
                                <Col span={6}>
                                    <Form.Item name="palletCount" label="Палет">
                                        <InputNumber min={0} style={{ width: '100%' }} placeholder="0" size="large" />
                                    </Form.Item>
                                </Col>
                            )}
                        </Row>

                        {/* Состав груза заполняли при создании заявки, а поправить
                            потом было негде: в правке стояло только общее число
                            палет. Заявки же меняются — груз переигрывают чаще, чем
                            маршрут. */}
                        <div style={{ marginBottom: 16 }}>
                            <CargoComposition value={cargo} onChange={setCargo} />
                        </div>

                        <Form.Item name="requirements" label="Доп. требования">
                            <TextArea rows={2} placeholder="Ремни, коники, гидроборт..." />
                        </Form.Item>
                        </div>
                    </section>
                </Col>

                <Col xs={24} lg={9}>
                    {/* Role & Parties Card (Editable) */}
                    <section className={nova.card}>
                        <div className={nova.cardHead}>
                            <TeamOutlined />
                            <h2 className={nova.cardTitle}>Участники и ставки</h2>
                        </div>
                        <div className={nova.cardBody}>
                        {/* Role info text */}
                        <div style={{
                            padding: '10px 14px',
                            background: 'var(--nova-surface-2)',
                            border: '1px solid var(--nova-border)',
                            borderRadius: 12,
                            marginBottom: 18,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                        }}>
                            <CheckCircleOutlined style={{ color: 'var(--nova-fg-3)', fontSize: 15 }} />
                            <Text style={{ color: 'var(--nova-fg-2)', fontWeight: 500, fontSize: 13 }}>{roleInfo.text}</Text>
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Кто заказчик?</div>
                            <Select
                                placeholder="Выберите заказчика"
                                style={{ width: '100%' }}
                                size="large"
                                value={selectedCustomer || undefined}
                                onChange={setSelectedCustomer}
                                showSearch
                                optionLabelProp="label"
                                options={[
                                    { value: MY_COMPANY_VALUE, label: `${myCompanyName || 'Моя компания'} (Моя компания)` },
                                    ...prepareCompanyOptions(getPartyOptions('customer'), selectedCustomer)
                                ]}
                                dropdownRender={(menu) => (
                                    <>
                                        <Button
                                            type="text"
                                            icon={<PlusOutlined />}
                                            block
                                            onClick={() => {
                                                setQuickPartnerTarget('CUSTOMER');
                                                setQuickPartnerModalOpen(true);
                                            }}
                                            style={{ textAlign: 'left', padding: '8px 12px', height: 'auto', color: '#1677ff', fontWeight: 500 }}
                                        >
                                            + Добавить контрагента
                                        </Button>
                                        <Divider style={{ margin: '4px 0' }} />
                                        {menu}
                                    </>
                                )}
                            />
                            {/*
                              * Номер этой перевозки в системе заказчика. Графа
                              * была только в мастере создания: узнали номер
                              * позже или ошиблись — исправить нечем, а счёт без
                              * него заказчик возвращает.
                              */}
                            {customerRefLabel && (
                                <div style={{ marginTop: 12 }}>
                                    <Form.Item name="customerRefNumber" label={customerRefLabel} style={{ marginBottom: 0 }}>
                                        <Input size="large" placeholder={`${customerRefLabel} у заказчика`} />
                                    </Form.Item>
                                </div>
                            )}
                        </div>

                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Кто перевозчик?</div>
                            <Select
                                placeholder="Выберите перевозчика"
                                style={{ width: '100%' }}
                                size="large"
                                value={selectedCarrier || undefined}
                                onChange={setSelectedCarrier}
                                showSearch
                                optionLabelProp="label"
                                options={[
                                    { value: MY_COMPANY_VALUE, label: `${myCompanyName || 'Моя компания'} (Моя компания)` },
                                    ...(selectedCarrier === MARKETPLACE_VALUE ? [{ value: MARKETPLACE_VALUE, label: '📢 Опубликовать на бирже' }] : []),
                                    ...prepareCompanyOptions(getPartyOptions('carrier'), selectedCarrier)
                                ]}
                                dropdownRender={(menu) => (
                                    <>
                                        <Button
                                            type="text"
                                            icon={<PlusOutlined />}
                                            block
                                            onClick={() => {
                                                setQuickPartnerTarget('CARRIER');
                                                setQuickPartnerModalOpen(true);
                                            }}
                                            style={{ textAlign: 'left', padding: '8px 12px', height: 'auto', color: '#1677ff', fontWeight: 500 }}
                                        >
                                            + Добавить контрагента
                                        </Button>
                                        <Divider style={{ margin: '4px 0' }} />
                                        {menu}
                                    </>
                                )}
                            />
                        </div>

                        <Divider style={{ margin: '8px 0 16px' }}>Ставки</Divider>

                        {showCustomerPriceField && (
                            <Row gutter={12}>
                                <Col span={24}>
                                    <Form.Item name="customerPrice" label={customerPriceLabel}>
                                        <MoneyInput
                                            size="large"
                                            disabled={!canEditFinance}
                                            addonAfter={(
                                                <Form.Item name="currency" noStyle initialValue="KZT">
                                                    <CurrencySelect disabled={!canEditFinance} />
                                                </Form.Item>
                                            )}
                                        />
                                    </Form.Item>
                                </Col>

                            </Row>
                        )}

                        {showDriverCostField && (
                            <Row gutter={12}>
                                <Col span={24}>
                                    <Form.Item name="driverCost" label={driverCostLabel}>
                                        <MoneyInput
                                            size="large"
                                            disabled={!canEditFinance}
                                            addonAfter={(
                                                <Form.Item name="driverCostCurrency" noStyle initialValue="KZT">
                                                    <CurrencySelect disabled={!canEditFinance} />
                                                </Form.Item>
                                            )}
                                        />
                                    </Form.Item>
                                </Col>

                            </Row>
                        )}

                        {/* Условия расчётов — не поле, а справка.
                            Менеджеру они нужны, чтобы разговаривать с
                            перевозчиком, но менять их он не может: ответ
                            принадлежит карточке контрагента. */}
                        {settlements && (settlements.customer.companyId || settlements.carrier.companyId) && (
                            <div className={nova.item} style={{ marginBottom: 12 }}>
                                <span className={nova.itemText}>
                                    <span className={nova.itemLabel}>Условия расчётов</span>
                                    {/* Строка длинная и в узкой колонке обрезалась
                                        на «перевозчик — с НД…»: обрезать условия
                                        сделки нельзя, их читают целиком. */}
                                    <span className={nova.itemDesc} style={{ whiteSpace: 'normal' }}>
                                        {settlements.customer.companyId && (
                                            <>
                                                заказчик — {vatLabel(settlements.customer.vatPayer, settlements.customer.vatRate)}
                                                {paymentTermsLabel(settlements.customer.days, settlements.customer.from)
                                                    && `, оплата ${paymentTermsLabel(settlements.customer.days, settlements.customer.from)}`}
                                            </>
                                        )}
                                        {settlements.customer.companyId && settlements.carrier.companyId && ' · '}
                                        {settlements.carrier.companyId && (
                                            <>
                                                перевозчик — {vatLabel(settlements.carrier.vatPayer, settlements.carrier.vatRate)}
                                                {paymentTermsLabel(settlements.carrier.days, settlements.carrier.from)
                                                    && `, платим ${paymentTermsLabel(settlements.carrier.days, settlements.carrier.from)}`}
                                            </>
                                        )}
                                    </span>
                                </span>
                                <span className={nova.chip}>
                                    {settlements.confirmed ? 'проверено' : 'ждёт бухгалтера'}
                                </span>
                            </div>
                        )}

                        <Form.Item name="customerPriceType" label="Тип оплаты" initialValue="FIXED">
                            <Select style={{ width: '100%' }} size="large">
                                <Select.Option value="FIXED">За рейс</Select.Option>
                                <Select.Option value="PER_KM">За км</Select.Option>
                                <Select.Option value="PER_TON">За тонну</Select.Option>
                            </Select>
                        </Form.Item>

                        {/* Условия и формы оплаты из общего справочника убраны:
                            «форма оплаты» — это «НДС / без НДС», а «условие» —
                            та самая свободная строка, из которой не посчитать
                            ни одной даты. И то и другое приходит из карточки
                            контрагента. Налоги и сроки по конкретному рейсу
                            правит бухгалтер во вкладке «Финансы» — так у них
                            одно место, а не два. */}

                        {/* Margin preview */}
                        <Form.Item noStyle dependencies={['customerPrice', 'driverCost']}>
                            {({ getFieldValue }) => {
                                const cp = getFieldValue('customerPrice') || 0;
                                const dc = getFieldValue('driverCost') || 0;
                                // НДС — из условий расчётов рейса, то есть оттуда
                                // же, откуда его берут документы и отчёты.
                                const hasVat = !!settlements?.customer.vatPayer;
                                const vatRate = Number(settlements?.customer.vatRate ?? 0);
                                const executorHasVat = !!settlements?.carrier.vatPayer;
                                const executorVatRate = Number(settlements?.carrier.vatRate ?? 0);

                                if (cp && dc && showCustomerPriceField && showDriverCostField) {
                                    const cpNet = hasVat ? (cp / (1 + vatRate / 100)) : cp;
                                    const dcNet = executorHasVat ? (dc / (1 + executorVatRate / 100)) : dc;
                                    const margin = Math.round((cpNet - dcNet) * 100) / 100;
                                    const marginPercent = cpNet > 0 ? Math.round((margin / cpNet) * 100) : 0;

                                    return (
                                        <MarginSummary
                                            customerLabel={customerPriceLabel}
                                            customerNet={cpNet}
                                            carrierLabel={driverCostLabel}
                                            carrierNet={dcNet}
                                            margin={margin}
                                            marginPercent={marginPercent}
                                            netOfVat={hasVat || executorHasVat}
                                        />
                                    );
                                }
                                return null;
                            }}
                        </Form.Item>
                        </div>
                    </section>

                    {/* Action buttons for saving the inline form */}
                    <div style={{ marginTop: 20, background: 'var(--lc-card-2)', padding: 16, borderRadius: 8, border: '1px solid var(--lc-border)', display: 'flex', gap: 12 }}>
                        <Button type="primary" onClick={() => editForm.submit()} style={{ flex: 1 }} disabled={!selectedCustomer || !selectedCarrier}>
                            Сохранить
                        </Button>
                        <Button onClick={() => setIsEditing(false)} style={{ flex: 1 }}>
                            Отмена
                        </Button>
                    </div>
                </Col>
            </Row>
        </Form>
    );
}
