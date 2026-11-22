-- CreateIndex
CREATE INDEX `UserSession_userId_idx` ON `UserSession`(`userId`);

-- DropUniqueIndex
DROP INDEX `UserSession_userId_key` ON `UserSession`;
