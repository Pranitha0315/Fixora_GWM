using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Fixora.Mechanic.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "mechanic");

            migrationBuilder.CreateTable(
                name: "Drafts",
                schema: "mechanic",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    JobCardId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MechanicId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Component = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Transcript = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Language = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Severity = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    FindingEn = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    FindingTa = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    RecommendationEn = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    RecommendationTa = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    MediaRefsCsv = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Source = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(12)", maxLength: 12, nullable: false),
                    PublishedIssueId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ConfirmedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Drafts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Mechanics",
                schema: "mechanic",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Phone = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    EmployeeCode = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    PinHash = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Active = table.Column<bool>(type: "bit", nullable: false),
                    OnDuty = table.Column<bool>(type: "bit", nullable: false),
                    PreferredLanguage = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    FailedPinAttempts = table.Column<int>(type: "int", nullable: false),
                    LockedUntil = table.Column<DateTime>(type: "datetime2", nullable: true),
                    InvitationId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Mechanics", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Media",
                schema: "mechanic",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    JobCardId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MechanicId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MediaRef = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Size = table.Column<long>(type: "bigint", nullable: false),
                    Phase = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Caption = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CapturedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Media", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Drafts_JobCardId_MechanicId",
                schema: "mechanic",
                table: "Drafts",
                columns: new[] { "JobCardId", "MechanicId" });

            migrationBuilder.CreateIndex(
                name: "IX_Mechanics_EmployeeCode",
                schema: "mechanic",
                table: "Mechanics",
                column: "EmployeeCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Mechanics_Phone",
                schema: "mechanic",
                table: "Mechanics",
                column: "Phone");

            migrationBuilder.CreateIndex(
                name: "IX_Media_JobCardId",
                schema: "mechanic",
                table: "Media",
                column: "JobCardId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Drafts",
                schema: "mechanic");

            migrationBuilder.DropTable(
                name: "Mechanics",
                schema: "mechanic");

            migrationBuilder.DropTable(
                name: "Media",
                schema: "mechanic");
        }
    }
}
