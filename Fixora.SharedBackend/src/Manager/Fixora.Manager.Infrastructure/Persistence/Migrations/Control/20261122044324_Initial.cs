using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Fixora.Manager.Infrastructure.Persistence.Migrations.Control
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "control");

            migrationBuilder.CreateTable(
                name: "AutoActions",
                schema: "control",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    At = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Detail = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    EntityId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    JobCardId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Held = table.Column<bool>(type: "bit", nullable: false),
                    Seen = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AutoActions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ControlSettings",
                schema: "control",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Mode = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    AutoWhenAway = table.Column<bool>(type: "bit", nullable: false),
                    AwayMinutes = table.Column<int>(type: "int", nullable: false),
                    HoldAboveRupees = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    AutoBookings = table.Column<bool>(type: "bit", nullable: false),
                    AutoSos = table.Column<bool>(type: "bit", nullable: false),
                    UpdatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ControlSettings", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AutoActions_At",
                schema: "control",
                table: "AutoActions",
                column: "At");

            migrationBuilder.CreateIndex(
                name: "IX_AutoActions_EntityId_Kind",
                schema: "control",
                table: "AutoActions",
                columns: new[] { "EntityId", "Kind" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AutoActions",
                schema: "control");

            migrationBuilder.DropTable(
                name: "ControlSettings",
                schema: "control");
        }
    }
}
