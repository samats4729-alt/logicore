/** Заявка в журнале — как её отдаёт `GET /company/orders`. */
export interface JournalOrder {
    id: string;
    orderNumber: string;
    status: string;
    cargoDescription: string;
    cargoWeight?: number;
    cargoVolume?: number;
    cargoType?: string;
    natureOfCargo?: string;
    requirements?: string;
    customerPrice?: number;
    customerPriceType?: string;
    driverCost?: number;
    createdAt: string;
    routePoints?: { pointType: string; sequence: number; location: { id?: string; name: string; address: string; city?: string; emails?: string } }[];
    customer?: { firstName: string; lastName: string; phone: string; email?: string };
    customerCompany?: { id?: string; name: string; phone?: string; email?: string };
    customerCompanyId?: string;
    assignedDriverName?: string;
    assignedDriverPhone?: string;
    assignedDriverPlate?: string;
    assignedDriverTrailer?: string;
    assignedAt?: string;
    driver?: { firstName: string; lastName: string; middleName?: string; phone: string; vehiclePlate?: string; vehicleModel?: string; trailerNumber?: string };
    subForwarder?: { name: string; email?: string };
    forwarder?: { id?: string; name: string; email?: string };
    partner?: { name: string; email?: string };
    forwarderId?: string;
    subForwarderId?: string;
    /** Счета, выставленные заказчику по этому рейсу. Пусто — счёта ещё нет. */
    accountingDocuments?: { document: { id: string; number: string; status: string } }[];
    subForwarderPrice?: number;
    partnerId?: string;
    isConfirmed?: boolean;
    driverId?: string;
    responsibleManager?: { firstName: string; lastName: string; };
    pendingStatus?: string;
    pendingStatusById?: string;
    /** Рейс закрыл водитель — фото накладной ещё никто не смотрел. */
    driverCompletedAt?: string | null;
    completionReviewedAt?: string | null;
}
