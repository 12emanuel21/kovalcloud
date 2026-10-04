-- CreateTable
CREATE TABLE "AutoReply" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "triggerWords" TEXT[],
    "responseType" TEXT NOT NULL DEFAULT 'TEXT',
    "responseBody" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoReply_restaurantId_idx" ON "AutoReply"("restaurantId");

-- AddForeignKey
ALTER TABLE "AutoReply" ADD CONSTRAINT "AutoReply_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
