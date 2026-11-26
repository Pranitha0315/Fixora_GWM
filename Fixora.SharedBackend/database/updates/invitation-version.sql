-- Run against the existing Fixora database before deploying invitation Version support.
-- Existing rows receive Version = 0. Re-running preserves existing versions.
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'workshop.Invitations', N'U') IS NULL
        THROW 50001, 'workshop.Invitations is missing. Check the selected database.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.columns
        WHERE object_id = OBJECT_ID(N'workshop.Invitations')
          AND name = N'Version'
    )
    BEGIN
        ALTER TABLE [workshop].[Invitations]
            ADD [Version] int NOT NULL
                CONSTRAINT [DF_Invitations_Version] DEFAULT (0) WITH VALUES;
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.columns
        WHERE object_id = OBJECT_ID(N'workshop.Invitations')
          AND name = N'Version'
          AND system_type_id = TYPE_ID(N'int')
          AND is_nullable = 0
          AND is_computed = 0
    )
        THROW 50002, 'Version must be a non-nullable int column.', 1;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;

SELECT name, TYPE_NAME(system_type_id) AS DataType, is_nullable
FROM sys.columns
WHERE object_id = OBJECT_ID(N'workshop.Invitations')
  AND name = N'Version';
