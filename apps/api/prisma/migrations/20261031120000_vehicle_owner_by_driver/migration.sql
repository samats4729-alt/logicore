-- Чужая машина водителя без ИП (владелец, 31.10.2026): ИИН собственника из
-- техпаспорта и договор с хозяином машины, где арендатор — сам водитель.
-- Только новые поля; прежние договоры остаются договорами парка.
ALTER TABLE "ExchangeDriver" ADD COLUMN "vehicleOwnerIin" TEXT;
ALTER TABLE "ExchangeVehicleOwnerContract" ADD COLUMN "lessee" TEXT NOT NULL DEFAULT 'PARK';
