-- DropUniqueIndex
DROP INDEX `UserSession_userId_key` ON `UserSession`;

-- CreateIndex
CREATE INDEX `UserSession_userId_idx` ON `UserSession`(`userId`);
