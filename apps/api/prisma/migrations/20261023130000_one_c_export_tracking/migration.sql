-- AlterTable
ALTER TABLE "OneCConnection" ADD COLUMN     "peerReceivedNo" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OneCObjectMap" ADD COLUMN     "hash" TEXT,
ADD COLUMN     "sentNo" INTEGER;

