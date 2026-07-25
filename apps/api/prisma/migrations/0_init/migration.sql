-- CreateEnum
CREATE TYPE "PriceType" AS ENUM ('FIXED', 'PER_KM', 'PER_TON');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'COMPANY_ADMIN', 'LOGISTICIAN', 'WAREHOUSE_MANAGER', 'ACCOUNTANT', 'DRIVER', 'RECIPIENT', 'PARTNER', 'FORWARDER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING', 'ASSIGNED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADING', 'IN_TRANSIT', 'AT_DELIVERY', 'UNLOADING', 'COMPLETED', 'CANCELLED', 'PROBLEM');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('TTN', 'POWER_OF_ATTORNEY', 'ACT', 'INVOICE', 'OTHER');

-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('CUSTOMER', 'FORWARDER');

-- CreateEnum
CREATE TYPE "RoutePointType" AS ENUM ('PICKUP', 'ADDITIONAL_PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'PENDING', 'ACTIVE', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AffiliationType" AS ENUM ('EMPLOYEE', 'PRIVATE_CARRIER', 'COLLABORATOR');

-- CreateEnum
CREATE TYPE "PartnershipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('CASH', 'BANK');

-- CreateEnum
CREATE TYPE "CostType" AS ENUM ('PER_ORDER', 'PER_VEHICLE', 'GENERAL');

-- CreateEnum
CREATE TYPE "FinanceOperationSource" AS ENUM ('PAYMENT', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "StockMoveType" AS ENUM ('RECEIPT', 'TRANSFER', 'WRITEOFF');

-- CreateEnum
CREATE TYPE "DictionaryKind" AS ENUM ('PAYMENT_CONDITION', 'PAYMENT_FORM', 'OWNERSHIP_TYPE', 'BANK');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('INCOMING', 'OUTGOING');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'PENDING', 'DISPUTED', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccountingDocumentType" AS ENUM ('PAYMENT_INVOICE', 'SERVICE_ACT', 'RECONCILIATION_ACT', 'CORRECTION');

-- CreateEnum
CREATE TYPE "AccountingDocumentDirection" AS ENUM ('INCOMING', 'OUTGOING');

-- CreateEnum
CREATE TYPE "AccountingDocumentStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccountingDocumentLinkType" AS ENUM ('BASED_ON', 'CORRECTS', 'REPLACES', 'RECONCILES');

-- CreateEnum
CREATE TYPE "AccountingVatTreatment" AS ENUM ('WITHOUT_VAT', 'STANDARD', 'ZERO', 'EXEMPT');

-- CreateEnum
CREATE TYPE "AccountingVatCalculation" AS ENUM ('INCLUDED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "googleId" TEXT,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "middleName" TEXT,
    "role" "UserRole" NOT NULL,
    "position" TEXT,
    "avatarPath" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isTrackable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT,
    "personId" TEXT,
    "departmentId" TEXT,
    "iin" TEXT,
    "vehicleType" TEXT,
    "vehiclePlate" TEXT,
    "vehicleModel" TEXT,
    "trailerNumber" TEXT,
    "docType" TEXT,
    "docNumber" TEXT,
    "docIssuedAt" TIMESTAMP(3),
    "docExpiresAt" TIMESTAMP(3),
    "docIssuedBy" TEXT,
    "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "middleName" TEXT,
    "phone" TEXT,
    "iin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "mergedIntoId" TEXT,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Affiliation" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "AffiliationType" NOT NULL DEFAULT 'EMPLOYEE',
    "role" "UserRole" NOT NULL,
    "position" TEXT,
    "departmentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "rate" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "sourceUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Affiliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonMerge" (
    "id" TEXT NOT NULL,
    "targetPersonId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revertedAt" TIMESTAMP(3),

    CONSTRAINT "PersonMerge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonMergeItem" (
    "id" TEXT NOT NULL,
    "mergeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "previousPersonId" TEXT NOT NULL,

    CONSTRAINT "PersonMergeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bin" TEXT,
    "address" TEXT,
    "actualAddress" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "directorName" TEXT,
    "bankAccount" TEXT,
    "bankName" TEXT,
    "bankBic" TEXT,
    "kbe" TEXT,
    "stampImage" TEXT,
    "signatureImage" TEXT,
    "type" "CompanyType" DEFAULT 'CUSTOMER',
    "isCustomer" BOOLEAN NOT NULL DEFAULT true,
    "isCarrier" BOOLEAN NOT NULL DEFAULT false,
    "isOurCompany" BOOLEAN NOT NULL DEFAULT false,
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "managersSeeOwnOrdersOnly" BOOLEAN NOT NULL DEFAULT true,
    "managersSeeOwnPartnersOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdByCompanyId" TEXT,
    "responsibleManagerId" TEXT,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partnership" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "status" "PartnershipStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "city" TEXT,
    "cityId" TEXT,
    "notes" TEXT,
    "emails" TEXT,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Country" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "externalProvider" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "externalProvider" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "externalProvider" TEXT,
    "externalId" TEXT,
    "regionId" TEXT,
    "countryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "pendingStatus" "OrderStatus",
    "pendingStatusById" TEXT,
    "pendingStatusAt" TIMESTAMP(3),
    "cargoDescription" TEXT,
    "cargoWeight" DOUBLE PRECISION,
    "cargoVolume" DOUBLE PRECISION,
    "cargoLength" DOUBLE PRECISION,
    "cargoWidth" DOUBLE PRECISION,
    "cargoHeight" DOUBLE PRECISION,
    "palletCount" INTEGER,
    "cargoType" TEXT,
    "natureOfCargo" TEXT,
    "requirements" TEXT,
    "customerId" TEXT NOT NULL,
    "driverId" TEXT,
    "recipientId" TEXT,
    "partnerId" TEXT,
    "customerCompanyId" TEXT,
    "forwarderId" TEXT,
    "responsibleManagerId" TEXT,
    "subForwarderId" TEXT,
    "subForwarderPrice" DOUBLE PRECISION,
    "assignedDriverName" TEXT,
    "assignedDriverPhone" TEXT,
    "assignedDriverPlate" TEXT,
    "assignedDriverTrailer" TEXT,
    "assignedAt" TIMESTAMP(3),
    "driverToken" TEXT,
    "driverLat" DOUBLE PRECISION,
    "driverLng" DOUBLE PRECISION,
    "driverSpeed" DOUBLE PRECISION,
    "driverHeading" DOUBLE PRECISION,
    "driverLocationAt" TIMESTAMP(3),
    "vehicleId" TEXT,
    "customerPrice" DOUBLE PRECISION,
    "customerPriceType" "PriceType" NOT NULL DEFAULT 'FIXED',
    "driverCost" DOUBLE PRECISION,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hasVat" BOOLEAN NOT NULL DEFAULT false,
    "executorVatRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "executorHasVat" BOOLEAN NOT NULL DEFAULT false,
    "appliedTariffId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'KZT',
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "isCustomerPaid" BOOLEAN NOT NULL DEFAULT false,
    "customerPaidAt" TIMESTAMP(3),
    "isDriverPaid" BOOLEAN NOT NULL DEFAULT false,
    "driverPaidAt" TIMESTAMP(3),
    "isSubForwarderPaid" BOOLEAN NOT NULL DEFAULT false,
    "subForwarderPaidAt" TIMESTAMP(3),
    "customerPaymentCondition" TEXT,
    "customerPaymentForm" TEXT,
    "customerPaymentDate" TIMESTAMP(3),
    "driverPaymentCondition" TEXT,
    "driverPaymentForm" TEXT,
    "driverPaymentDate" TIMESTAMP(3),
    "ttnNumber" TEXT,
    "atiCodeCustomer" TEXT,
    "atiCodeCarrier" TEXT,
    "trailerNumber" TEXT,
    "actualWeight" DOUBLE PRECISION,
    "actualVolume" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "incomingInvoiceId" TEXT,
    "outgoingInvoiceId" TEXT,
    "proposedCustomerPrice" DOUBLE PRECISION,
    "proposedDriverCost" DOUBLE PRECISION,
    "proposedSubForwarderPrice" DOUBLE PRECISION,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderRoutePoint" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "pointType" "RoutePointType" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "expectedDate" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "OrderRoutePoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "comment" TEXT,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderProblem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderProblem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "orderId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "companyId" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GpsPoint" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "orderId" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GpsPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseGate" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "gateNumber" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WarehouseGate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseQueueItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "gateId" TEXT,
    "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "instructions" TEXT,

    CONSTRAINT "WarehouseQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargoCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CargoCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargoType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CargoType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "customerCompanyId" TEXT NOT NULL,
    "forwarderCompanyId" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "content" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplementaryAgreement" (
    "id" TEXT NOT NULL,
    "agreementNumber" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "status" "AgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "proposedBy" TEXT NOT NULL DEFAULT 'FORWARDER',
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplementaryAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteTariff" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "originCityId" TEXT NOT NULL,
    "destinationCityId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "priceType" "PriceType" NOT NULL DEFAULT 'FIXED',
    "vehicleType" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouteTariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "orderId" TEXT,
    "accountId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Income" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "orderId" TEXT,
    "accountId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Income_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT,
    "counterpartyId" TEXT,
    "direction" "PaymentDirection" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK',
    "note" TEXT,
    "createdById" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT,
    "categoryId" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "direction" "PaymentDirection" NOT NULL,
    "costType" "CostType",
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceOperation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "source" "FinanceOperationSource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "direction" "PaymentDirection" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "categoryId" TEXT,
    "categoryLabel" TEXT,
    "description" TEXT,
    "note" TEXT,
    "orderId" TEXT,
    "counterpartyId" TEXT,
    "accountId" TEXT,
    "method" "PaymentMethod",
    "createdById" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NomenclatureItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'шт',
    "sku" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NomenclatureItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockWarehouse" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockWarehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMove" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "StockMoveType" NOT NULL,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "toWarehouseId" TEXT,
    "counterparty" TEXT,
    "expenseCategory" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockMove_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMoveLine" (
    "id" TEXT NOT NULL,
    "moveId" TEXT NOT NULL,
    "nomenclatureId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION,

    CONSTRAINT "StockMoveLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderNumbering" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "padding" INTEGER NOT NULL DEFAULT 9,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderNumbering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DictionaryItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "DictionaryKind" NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DictionaryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCatalogItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'услуга',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounterpartyOpeningBalance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "openingReceivable" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingPayable" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingDate" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CounterpartyOpeningBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClosedPeriod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "closedById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClosedPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bonus" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'MARGIN_PERCENT',
    "percentage" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bonus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "position" TEXT,
    "companyId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sharedCompanyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "departmentId" TEXT,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderAssignee" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderChangeLog" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "companyId" TEXT NOT NULL,
    "parentDepartmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "trailerNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "vin" TEXT,
    "ownerPersonId" TEXT,
    "driverPersonId" TEXT,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issuerId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "shareToken" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "adjustedAmount" DOUBLE PRECISION,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "type" "AccountingDocumentType" NOT NULL,
    "direction" "AccountingDocumentDirection" NOT NULL,
    "status" "AccountingDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "number" TEXT NOT NULL,
    "externalNumber" TEXT,
    "externalDate" DATE,
    "documentDate" DATE NOT NULL,
    "operationDate" DATE,
    "dueDate" DATE,
    "reportPeriodFrom" DATE,
    "reportPeriodTo" DATE,
    "contractId" TEXT,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'KZT',
    "subtotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "vatTotal" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "openingBalance" DECIMAL(20,2),
    "debitTurnover" DECIMAL(20,2),
    "creditTurnover" DECIMAL(20,2),
    "closingBalance" DECIMAL(20,2),
    "issuerSnapshot" JSONB NOT NULL,
    "recipientSnapshot" JSONB NOT NULL,
    "issuerSignatorySnapshot" JSONB,
    "recipientSignatorySnapshot" JSONB,
    "basisSnapshot" JSONB,
    "paymentPurposeCode" TEXT,
    "paymentTerms" TEXT,
    "customerMaterialsInfo" TEXT,
    "appendixInfo" TEXT,
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "checksum" VARCHAR(64),
    "pdfFileUrl" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingDocumentLine" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "serviceCode" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "serviceDate" DATE,
    "reportDetails" TEXT,
    "quantity" DECIMAL(20,3) NOT NULL DEFAULT 1,
    "unit" VARCHAR(32) NOT NULL DEFAULT 'усл',
    "unitCode" TEXT,
    "unitPrice" DECIMAL(20,2) NOT NULL,
    "subtotal" DECIMAL(20,2) NOT NULL,
    "discountAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "vatTreatment" "AccountingVatTreatment" NOT NULL DEFAULT 'WITHOUT_VAT',
    "vatCalculation" "AccountingVatCalculation" NOT NULL DEFAULT 'INCLUDED',
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,2) NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingDocumentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingReconciliationLine" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "transactionDate" DATE NOT NULL,
    "sourceDocumentType" TEXT,
    "sourceDocumentNumber" TEXT,
    "description" TEXT,
    "debit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "runningBalance" DECIMAL(20,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingReconciliationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingDocumentOrder" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingDocumentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPaymentAllocation" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingDocumentLink" (
    "id" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "targetDocumentId" TEXT NOT NULL,
    "type" "AccountingDocumentLinkType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingDocumentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingDocumentNumbering" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "AccountingDocumentType" NOT NULL,
    "direction" "AccountingDocumentDirection" NOT NULL,
    "year" INTEGER NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "padLength" INTEGER NOT NULL DEFAULT 6,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingDocumentNumbering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCompanyRelation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'COMPANY_ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCompanyRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformUpdate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceCommits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "PlatformUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userEmail" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "description" TEXT NOT NULL,
    "orders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "details" JSONB,
    "transcript" JSONB,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollScheme" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "fixedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percentBase" TEXT NOT NULL DEFAULT 'MARGIN',
    "accrualStatus" TEXT NOT NULL DEFAULT 'COMPLETED',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollScheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollKpiRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "metric" TEXT NOT NULL DEFAULT 'COMPLETED_ORDERS_MONTH',
    "threshold" INTEGER NOT NULL,
    "bonusAmount" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollKpiRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAccrual" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "kind" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "periodMonth" TEXT NOT NULL,
    "baseAmount" DOUBLE PRECISION,
    "schemeSnapshot" JSONB,
    "kpiRuleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollAccrual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceMonthly" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KZT',
    "maxUsers" INTEGER,
    "maxOrdersPerMonth" INTEGER,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySubscription" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "planId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3),
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "userRole" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "entityLabel" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderResponsible" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderResponsible_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "User_phone_idx" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE INDEX "User_personId_idx" ON "User"("personId");

-- CreateIndex
CREATE INDEX "Person_phone_idx" ON "Person"("phone");

-- CreateIndex
CREATE INDEX "Person_iin_idx" ON "Person"("iin");

-- CreateIndex
CREATE INDEX "Person_mergedIntoId_idx" ON "Person"("mergedIntoId");

-- CreateIndex
CREATE INDEX "Affiliation_personId_idx" ON "Affiliation"("personId");

-- CreateIndex
CREATE INDEX "Affiliation_companyId_idx" ON "Affiliation"("companyId");

-- CreateIndex
CREATE INDEX "Affiliation_companyId_role_idx" ON "Affiliation"("companyId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Affiliation_personId_companyId_role_key" ON "Affiliation"("personId", "companyId", "role");

-- CreateIndex
CREATE INDEX "PersonMerge_targetPersonId_idx" ON "PersonMerge"("targetPersonId");

-- CreateIndex
CREATE INDEX "PersonMerge_status_idx" ON "PersonMerge"("status");

-- CreateIndex
CREATE INDEX "PersonMergeItem_mergeId_idx" ON "PersonMergeItem"("mergeId");

-- CreateIndex
CREATE INDEX "PersonMergeItem_userId_idx" ON "PersonMergeItem"("userId");

-- CreateIndex
CREATE INDEX "Company_bin_idx" ON "Company"("bin");

-- CreateIndex
CREATE INDEX "Partnership_status_idx" ON "Partnership"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Partnership_requesterId_recipientId_key" ON "Partnership"("requesterId", "recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_deviceId_idx" ON "Session"("deviceId");

-- CreateIndex
CREATE INDEX "Location_latitude_longitude_idx" ON "Location"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "Location_cityId_idx" ON "Location"("cityId");

-- CreateIndex
CREATE UNIQUE INDEX "Country_name_key" ON "Country"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Country_code_key" ON "Country"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Country_externalProvider_externalId_key" ON "Country"("externalProvider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Region_countryId_name_key" ON "Region"("countryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Region_externalProvider_externalId_key" ON "Region"("externalProvider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "City_countryId_regionId_name_key" ON "City"("countryId", "regionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "City_externalProvider_externalId_key" ON "City"("externalProvider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Order_driverId_idx" ON "Order"("driverId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_customerCompanyId_status_idx" ON "Order"("customerCompanyId", "status");

-- CreateIndex
CREATE INDEX "Order_forwarderId_status_idx" ON "Order"("forwarderId", "status");

-- CreateIndex
CREATE INDEX "Order_partnerId_status_idx" ON "Order"("partnerId", "status");

-- CreateIndex
CREATE INDEX "Order_responsibleManagerId_idx" ON "Order"("responsibleManagerId");

-- CreateIndex
CREATE INDEX "Order_subForwarderId_idx" ON "Order"("subForwarderId");

-- CreateIndex
CREATE INDEX "OrderRoutePoint_orderId_idx" ON "OrderRoutePoint"("orderId");

-- CreateIndex
CREATE INDEX "OrderRoutePoint_locationId_idx" ON "OrderRoutePoint"("locationId");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_idx" ON "OrderStatusHistory"("orderId");

-- CreateIndex
CREATE INDEX "OrderProblem_orderId_idx" ON "OrderProblem"("orderId");

-- CreateIndex
CREATE INDEX "Document_orderId_idx" ON "Document"("orderId");

-- CreateIndex
CREATE INDEX "Document_type_idx" ON "Document"("type");

-- CreateIndex
CREATE INDEX "GpsPoint_driverId_recordedAt_idx" ON "GpsPoint"("driverId", "recordedAt");

-- CreateIndex
CREATE INDEX "GpsPoint_orderId_idx" ON "GpsPoint"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseGate_locationId_gateNumber_key" ON "WarehouseGate"("locationId", "gateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseQueueItem_orderId_key" ON "WarehouseQueueItem"("orderId");

-- CreateIndex
CREATE INDEX "WarehouseQueueItem_gateId_idx" ON "WarehouseQueueItem"("gateId");

-- CreateIndex
CREATE UNIQUE INDEX "CargoCategory_name_key" ON "CargoCategory"("name");

-- CreateIndex
CREATE INDEX "CargoType_categoryId_idx" ON "CargoType"("categoryId");

-- CreateIndex
CREATE INDEX "Contract_customerCompanyId_idx" ON "Contract"("customerCompanyId");

-- CreateIndex
CREATE INDEX "Contract_forwarderCompanyId_idx" ON "Contract"("forwarderCompanyId");

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_customerCompanyId_forwarderCompanyId_contractNumbe_key" ON "Contract"("customerCompanyId", "forwarderCompanyId", "contractNumber");

-- CreateIndex
CREATE INDEX "SupplementaryAgreement_contractId_idx" ON "SupplementaryAgreement"("contractId");

-- CreateIndex
CREATE INDEX "SupplementaryAgreement_status_idx" ON "SupplementaryAgreement"("status");

-- CreateIndex
CREATE INDEX "RouteTariff_agreementId_idx" ON "RouteTariff"("agreementId");

-- CreateIndex
CREATE INDEX "RouteTariff_originCityId_destinationCityId_idx" ON "RouteTariff"("originCityId", "destinationCityId");

-- CreateIndex
CREATE INDEX "Expense_companyId_idx" ON "Expense"("companyId");

-- CreateIndex
CREATE INDEX "Expense_companyId_date_idx" ON "Expense"("companyId", "date");

-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");

-- CreateIndex
CREATE INDEX "Expense_orderId_idx" ON "Expense"("orderId");

-- CreateIndex
CREATE INDEX "Expense_accountId_idx" ON "Expense"("accountId");

-- CreateIndex
CREATE INDEX "Income_companyId_idx" ON "Income"("companyId");

-- CreateIndex
CREATE INDEX "Income_companyId_date_idx" ON "Income"("companyId", "date");

-- CreateIndex
CREATE INDEX "Income_category_idx" ON "Income"("category");

-- CreateIndex
CREATE INDEX "Income_orderId_idx" ON "Income"("orderId");

-- CreateIndex
CREATE INDEX "Income_accountId_idx" ON "Income"("accountId");

-- CreateIndex
CREATE INDEX "Payment_companyId_date_idx" ON "Payment"("companyId", "date");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_direction_idx" ON "Payment"("direction");

-- CreateIndex
CREATE INDEX "Payment_accountId_idx" ON "Payment"("accountId");

-- CreateIndex
CREATE INDEX "Payment_categoryId_idx" ON "Payment"("categoryId");

-- CreateIndex
CREATE INDEX "FinanceAccount_companyId_idx" ON "FinanceAccount"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccount_companyId_name_kind_key" ON "FinanceAccount"("companyId", "name", "kind");

-- CreateIndex
CREATE INDEX "FinanceCategory_companyId_idx" ON "FinanceCategory"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCategory_companyId_name_direction_key" ON "FinanceCategory"("companyId", "name", "direction");

-- CreateIndex
CREATE INDEX "FinanceOperation_companyId_date_idx" ON "FinanceOperation"("companyId", "date");

-- CreateIndex
CREATE INDEX "FinanceOperation_companyId_isDeleted_idx" ON "FinanceOperation"("companyId", "isDeleted");

-- CreateIndex
CREATE INDEX "FinanceOperation_orderId_idx" ON "FinanceOperation"("orderId");

-- CreateIndex
CREATE INDEX "FinanceOperation_accountId_idx" ON "FinanceOperation"("accountId");

-- CreateIndex
CREATE INDEX "FinanceOperation_categoryId_idx" ON "FinanceOperation"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceOperation_source_sourceId_key" ON "FinanceOperation"("source", "sourceId");

-- CreateIndex
CREATE INDEX "NomenclatureItem_companyId_idx" ON "NomenclatureItem"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "NomenclatureItem_companyId_name_key" ON "NomenclatureItem"("companyId", "name");

-- CreateIndex
CREATE INDEX "StockWarehouse_companyId_idx" ON "StockWarehouse"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "StockWarehouse_companyId_name_key" ON "StockWarehouse"("companyId", "name");

-- CreateIndex
CREATE INDEX "StockMove_companyId_type_idx" ON "StockMove"("companyId", "type");

-- CreateIndex
CREATE INDEX "StockMove_companyId_date_idx" ON "StockMove"("companyId", "date");

-- CreateIndex
CREATE INDEX "StockMoveLine_moveId_idx" ON "StockMoveLine"("moveId");

-- CreateIndex
CREATE INDEX "StockMoveLine_nomenclatureId_idx" ON "StockMoveLine"("nomenclatureId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderNumbering_companyId_key" ON "OrderNumbering"("companyId");

-- CreateIndex
CREATE INDEX "DictionaryItem_companyId_kind_idx" ON "DictionaryItem"("companyId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "DictionaryItem_companyId_kind_name_key" ON "DictionaryItem"("companyId", "kind", "name");

-- CreateIndex
CREATE INDEX "ServiceCatalogItem_companyId_idx" ON "ServiceCatalogItem"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCatalogItem_companyId_name_key" ON "ServiceCatalogItem"("companyId", "name");

-- CreateIndex
CREATE INDEX "CounterpartyOpeningBalance_companyId_idx" ON "CounterpartyOpeningBalance"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CounterpartyOpeningBalance_companyId_counterpartyId_key" ON "CounterpartyOpeningBalance"("companyId", "counterpartyId");

-- CreateIndex
CREATE INDEX "ClosedPeriod_companyId_idx" ON "ClosedPeriod"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ClosedPeriod_companyId_year_month_key" ON "ClosedPeriod"("companyId", "year", "month");

-- CreateIndex
CREATE INDEX "Bonus_userId_idx" ON "Bonus"("userId");

-- CreateIndex
CREATE INDEX "Bonus_orderId_idx" ON "Bonus"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_companyId_idx" ON "Invitation"("companyId");

-- CreateIndex
CREATE INDEX "Invitation_token_idx" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_departmentId_idx" ON "Invitation"("departmentId");

-- CreateIndex
CREATE INDEX "OrderAssignee_orderId_idx" ON "OrderAssignee"("orderId");

-- CreateIndex
CREATE INDEX "OrderAssignee_userId_idx" ON "OrderAssignee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderAssignee_orderId_userId_key" ON "OrderAssignee"("orderId", "userId");

-- CreateIndex
CREATE INDEX "OrderChangeLog_orderId_idx" ON "OrderChangeLog"("orderId");

-- CreateIndex
CREATE INDEX "Department_companyId_idx" ON "Department"("companyId");

-- CreateIndex
CREATE INDEX "Department_parentDepartmentId_idx" ON "Department"("parentDepartmentId");

-- CreateIndex
CREATE INDEX "Vehicle_companyId_idx" ON "Vehicle"("companyId");

-- CreateIndex
CREATE INDEX "Vehicle_ownerPersonId_idx" ON "Vehicle"("ownerPersonId");

-- CreateIndex
CREATE INDEX "Vehicle_driverPersonId_idx" ON "Vehicle"("driverPersonId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_shareToken_key" ON "Invoice"("shareToken");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_shareToken_idx" ON "Invoice"("shareToken");

-- CreateIndex
CREATE INDEX "Invoice_issuerId_idx" ON "Invoice"("issuerId");

-- CreateIndex
CREATE INDEX "Invoice_recipientId_idx" ON "Invoice"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_issuerId_invoiceNumber_type_key" ON "Invoice"("issuerId", "invoiceNumber", "type");

-- CreateIndex
CREATE INDEX "AccountingDocument_companyId_documentDate_idx" ON "AccountingDocument"("companyId", "documentDate");

-- CreateIndex
CREATE INDEX "AccountingDocument_companyId_status_idx" ON "AccountingDocument"("companyId", "status");

-- CreateIndex
CREATE INDEX "AccountingDocument_counterpartyId_documentDate_idx" ON "AccountingDocument"("counterpartyId", "documentDate");

-- CreateIndex
CREATE INDEX "AccountingDocument_companyId_counterpartyId_externalNumber_idx" ON "AccountingDocument"("companyId", "counterpartyId", "externalNumber");

-- CreateIndex
CREATE INDEX "AccountingDocument_contractId_idx" ON "AccountingDocument"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingDocument_companyId_type_number_key" ON "AccountingDocument"("companyId", "type", "number");

-- CreateIndex
CREATE INDEX "AccountingDocumentLine_orderId_idx" ON "AccountingDocumentLine"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingDocumentLine_documentId_lineNumber_key" ON "AccountingDocumentLine"("documentId", "lineNumber");

-- CreateIndex
CREATE INDEX "AccountingReconciliationLine_transactionDate_idx" ON "AccountingReconciliationLine"("transactionDate");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingReconciliationLine_documentId_lineNumber_key" ON "AccountingReconciliationLine"("documentId", "lineNumber");

-- CreateIndex
CREATE INDEX "AccountingDocumentOrder_orderId_idx" ON "AccountingDocumentOrder"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingDocumentOrder_documentId_orderId_key" ON "AccountingDocumentOrder"("documentId", "orderId");

-- CreateIndex
CREATE INDEX "AccountingPaymentAllocation_paymentId_idx" ON "AccountingPaymentAllocation"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPaymentAllocation_documentId_paymentId_key" ON "AccountingPaymentAllocation"("documentId", "paymentId");

-- CreateIndex
CREATE INDEX "AccountingDocumentLink_targetDocumentId_idx" ON "AccountingDocumentLink"("targetDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingDocumentLink_sourceDocumentId_targetDocumentId_ty_key" ON "AccountingDocumentLink"("sourceDocumentId", "targetDocumentId", "type");

-- CreateIndex
CREATE INDEX "AccountingDocumentNumbering_companyId_idx" ON "AccountingDocumentNumbering"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingDocumentNumbering_companyId_type_direction_year_key" ON "AccountingDocumentNumbering"("companyId", "type", "direction", "year");

-- CreateIndex
CREATE INDEX "UserCompanyRelation_userId_idx" ON "UserCompanyRelation"("userId");

-- CreateIndex
CREATE INDEX "UserCompanyRelation_companyId_idx" ON "UserCompanyRelation"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCompanyRelation_userId_companyId_key" ON "UserCompanyRelation"("userId", "companyId");

-- CreateIndex
CREATE INDEX "PlatformUpdate_status_idx" ON "PlatformUpdate"("status");

-- CreateIndex
CREATE INDEX "PlatformUpdate_createdAt_idx" ON "PlatformUpdate"("createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- CreateIndex
CREATE INDEX "SupportTicket_companyId_idx" ON "SupportTicket"("companyId");

-- CreateIndex
CREATE INDEX "SupportTicket_createdAt_idx" ON "SupportTicket"("createdAt");

-- CreateIndex
CREATE INDEX "PayrollScheme_companyId_idx" ON "PayrollScheme"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollScheme_companyId_userId_key" ON "PayrollScheme"("companyId", "userId");

-- CreateIndex
CREATE INDEX "PayrollKpiRule_companyId_idx" ON "PayrollKpiRule"("companyId");

-- CreateIndex
CREATE INDEX "PayrollAccrual_companyId_periodMonth_idx" ON "PayrollAccrual"("companyId", "periodMonth");

-- CreateIndex
CREATE INDEX "PayrollAccrual_userId_periodMonth_idx" ON "PayrollAccrual"("userId", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollAccrual_orderId_userId_kind_key" ON "PayrollAccrual"("orderId", "userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollAccrual_userId_periodMonth_kind_kpiRuleId_key" ON "PayrollAccrual"("userId", "periodMonth", "kind", "kpiRuleId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySubscription_companyId_key" ON "CompanySubscription"("companyId");

-- CreateIndex
CREATE INDEX "CompanySubscription_status_idx" ON "CompanySubscription"("status");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "OrderResponsible_userId_idx" ON "OrderResponsible"("userId");

-- CreateIndex
CREATE INDEX "OrderResponsible_companyId_idx" ON "OrderResponsible"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderResponsible_orderId_companyId_key" ON "OrderResponsible"("orderId", "companyId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Affiliation" ADD CONSTRAINT "Affiliation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Affiliation" ADD CONSTRAINT "Affiliation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonMergeItem" ADD CONSTRAINT "PersonMergeItem_mergeId_fkey" FOREIGN KEY ("mergeId") REFERENCES "PersonMerge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_createdByCompanyId_fkey" FOREIGN KEY ("createdByCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_responsibleManagerId_fkey" FOREIGN KEY ("responsibleManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partnership" ADD CONSTRAINT "Partnership_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partnership" ADD CONSTRAINT "Partnership_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerCompanyId_fkey" FOREIGN KEY ("customerCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_forwarderId_fkey" FOREIGN KEY ("forwarderId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_responsibleManagerId_fkey" FOREIGN KEY ("responsibleManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_subForwarderId_fkey" FOREIGN KEY ("subForwarderId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_appliedTariffId_fkey" FOREIGN KEY ("appliedTariffId") REFERENCES "RouteTariff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_incomingInvoiceId_fkey" FOREIGN KEY ("incomingInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_outgoingInvoiceId_fkey" FOREIGN KEY ("outgoingInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRoutePoint" ADD CONSTRAINT "OrderRoutePoint_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRoutePoint" ADD CONSTRAINT "OrderRoutePoint_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProblem" ADD CONSTRAINT "OrderProblem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GpsPoint" ADD CONSTRAINT "GpsPoint_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GpsPoint" ADD CONSTRAINT "GpsPoint_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseGate" ADD CONSTRAINT "WarehouseGate_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseQueueItem" ADD CONSTRAINT "WarehouseQueueItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseQueueItem" ADD CONSTRAINT "WarehouseQueueItem_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "WarehouseGate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoType" ADD CONSTRAINT "CargoType_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CargoCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_customerCompanyId_fkey" FOREIGN KEY ("customerCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_forwarderCompanyId_fkey" FOREIGN KEY ("forwarderCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplementaryAgreement" ADD CONSTRAINT "SupplementaryAgreement_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteTariff" ADD CONSTRAINT "RouteTariff_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SupplementaryAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteTariff" ADD CONSTRAINT "RouteTariff_originCityId_fkey" FOREIGN KEY ("originCityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteTariff" ADD CONSTRAINT "RouteTariff_destinationCityId_fkey" FOREIGN KEY ("destinationCityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCategory" ADD CONSTRAINT "FinanceCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOperation" ADD CONSTRAINT "FinanceOperation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOperation" ADD CONSTRAINT "FinanceOperation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOperation" ADD CONSTRAINT "FinanceOperation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOperation" ADD CONSTRAINT "FinanceOperation_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOperation" ADD CONSTRAINT "FinanceOperation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NomenclatureItem" ADD CONSTRAINT "NomenclatureItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockWarehouse" ADD CONSTRAINT "StockWarehouse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "StockWarehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "StockWarehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMoveLine" ADD CONSTRAINT "StockMoveLine_moveId_fkey" FOREIGN KEY ("moveId") REFERENCES "StockMove"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMoveLine" ADD CONSTRAINT "StockMoveLine_nomenclatureId_fkey" FOREIGN KEY ("nomenclatureId") REFERENCES "NomenclatureItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderNumbering" ADD CONSTRAINT "OrderNumbering_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DictionaryItem" ADD CONSTRAINT "DictionaryItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCatalogItem" ADD CONSTRAINT "ServiceCatalogItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterpartyOpeningBalance" ADD CONSTRAINT "CounterpartyOpeningBalance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterpartyOpeningBalance" ADD CONSTRAINT "CounterpartyOpeningBalance_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosedPeriod" ADD CONSTRAINT "ClosedPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosedPeriod" ADD CONSTRAINT "ClosedPeriod_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bonus" ADD CONSTRAINT "Bonus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bonus" ADD CONSTRAINT "Bonus_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAssignee" ADD CONSTRAINT "OrderAssignee_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAssignee" ADD CONSTRAINT "OrderAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderChangeLog" ADD CONSTRAINT "OrderChangeLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderChangeLog" ADD CONSTRAINT "OrderChangeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentDepartmentId_fkey" FOREIGN KEY ("parentDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_driverPersonId_fkey" FOREIGN KEY ("driverPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingDocument" ADD CONSTRAINT "AccountingDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingDocument" ADD CONSTRAINT "AccountingDocument_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingDocument" ADD CONSTRAINT "AccountingDocument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingDocument" ADD CONSTRAINT "AccountingDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingDocument" ADD CONSTRAINT "AccountingDocument_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingDocument" ADD CONSTRAINT "AccountingDocument_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingDocumentLine" ADD CONSTRAINT "AccountingDocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AccountingDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingDocumentLine" ADD CONSTRAINT "AccountingDocumentLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingReconciliationLine" ADD CONSTRAINT "AccountingReconciliationLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AccountingDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingDocumentOrder" ADD CONSTRAINT "AccountingDocumentOrder_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AccountingDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingDocumentOrder" ADD CONSTRAINT "AccountingDocumentOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPaymentAllocation" ADD CONSTRAINT "AccountingPaymentAllocation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AccountingDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPaymentAllocation" ADD CONSTRAINT "AccountingPaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPaymentAllocation" ADD CONSTRAINT "AccountingPaymentAllocation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingDocumentLink" ADD CONSTRAINT "AccountingDocumentLink_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "AccountingDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingDocumentLink" ADD CONSTRAINT "AccountingDocumentLink_targetDocumentId_fkey" FOREIGN KEY ("targetDocumentId") REFERENCES "AccountingDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingDocumentNumbering" ADD CONSTRAINT "AccountingDocumentNumbering_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompanyRelation" ADD CONSTRAINT "UserCompanyRelation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompanyRelation" ADD CONSTRAINT "UserCompanyRelation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySubscription" ADD CONSTRAINT "CompanySubscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySubscription" ADD CONSTRAINT "CompanySubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderResponsible" ADD CONSTRAINT "OrderResponsible_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderResponsible" ADD CONSTRAINT "OrderResponsible_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderResponsible" ADD CONSTRAINT "OrderResponsible_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

