using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Fixora.Manager.Infrastructure.Persistence.Migrations.Workshop
{
    /// <inheritdoc />
    public partial class BookingAuditFixes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ManagerNote",
                schema: "workshop",
                table: "JobCards",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ManagerNote",
                schema: "workshop",
                table: "Appointments",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ManagerNote",
                schema: "workshop",
                table: "JobCards");

            migrationBuilder.DropColumn(
                name: "ManagerNote",
                schema: "workshop",
                table: "Appointments");
        }
    }
}
