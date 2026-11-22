-- DropIndex
DROP INDEX "UserSession_userId_key";

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");
