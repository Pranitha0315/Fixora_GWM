using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Fixora.Customer.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "customer");

            migrationBuilder.CreateTable(
                name: "Customers",
                schema: "customer",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Email = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    Phone = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    PasswordHash = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    EmailVerified = table.Column<bool>(type: "bit", nullable: false),
                    PreferredLanguage = table.Column<string>(type: "nvarchar(5)", maxLength: 5, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Customers", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Loyalty",
                schema: "customer",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Points = table.Column<int>(type: "int", nullable: false),
                    Source = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Loyalty", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "OtpChallenges",
                schema: "customer",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Email = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    CodeHash = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Purpose = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Attempts = table.Column<int>(type: "int", nullable: false),
                    ConsumedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OtpChallenges", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SosRequests",
                schema: "customer",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    VehicleId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Lat = table.Column<double>(type: "float", nullable: false),
                    Lng = table.Column<double>(type: "float", nullable: false),
                    Category = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    IdempotencyKey = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ReceivedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    AcknowledgedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    AssignedMechanicId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    DriveSenseContext = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SosRequests", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Suggestions",
                schema: "customer",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    VehicleId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Component = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    WearFactor = table.Column<double>(type: "float", nullable: false),
                    SuggestedServiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(12)", maxLength: 12, nullable: false),
                    AppointmentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ClosedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Suggestions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Trips",
                schema: "customer",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    VehicleId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StartedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DistanceKm = table.Column<double>(type: "float", nullable: false),
                    RoughKm = table.Column<double>(type: "float", nullable: false),
                    PotholeCount = table.Column<int>(type: "int", nullable: false),
                    HarshBrakes = table.Column<int>(type: "int", nullable: false),
                    HarshAccels = table.Column<int>(type: "int", nullable: false),
                    SharpCorners = table.Column<int>(type: "int", nullable: false),
                    Score = table.Column<int>(type: "int", nullable: false),
                    Confidence = table.Column<double>(type: "float", nullable: false),
                    SegmentGeohashesCsv = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    IsDemoReplay = table.Column<bool>(type: "bit", nullable: false),
                    UploadedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Trips", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Vehicles",
                schema: "customer",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RegistrationNo = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Make = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Model = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Year = table.Column<int>(type: "int", nullable: false),
                    Type = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MileageKm = table.Column<int>(type: "int", nullable: false),
                    Color = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Fuel = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    DriveSenseOptIn = table.Column<bool>(type: "bit", nullable: false),
                    DriveSenseConsentAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Active = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Vehicles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WearProfiles",
                schema: "customer",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    VehicleId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WeekStart = table.Column<DateOnly>(type: "date", nullable: false),
                    RoughRoadPct = table.Column<double>(type: "float", nullable: false),
                    PotholeHits = table.Column<int>(type: "int", nullable: false),
                    DriveScore = table.Column<int>(type: "int", nullable: false),
                    HarshBrakesPer100Km = table.Column<double>(type: "float", nullable: false),
                    HarshAccelsPer100Km = table.Column<double>(type: "float", nullable: false),
                    DistanceKm = table.Column<double>(type: "float", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WearProfiles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SosHistory",
                schema: "customer",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SosRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    ActorRole = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ActorId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    At = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SosHistory", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SosHistory_SosRequests_SosRequestId",
                        column: x => x.SosRequestId,
                        principalSchema: "customer",
                        principalTable: "SosRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Customers_Email",
                schema: "customer",
                table: "Customers",
                column: "Email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Loyalty_CustomerId",
                schema: "customer",
                table: "Loyalty",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_OtpChallenges_Email_Purpose",
                schema: "customer",
                table: "OtpChallenges",
                columns: new[] { "Email", "Purpose" });

            migrationBuilder.CreateIndex(
                name: "IX_SosHistory_SosRequestId",
                schema: "customer",
                table: "SosHistory",
                column: "SosRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_SosRequests_CustomerId_IdempotencyKey",
                schema: "customer",
                table: "SosRequests",
                columns: new[] { "CustomerId", "IdempotencyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Suggestions_VehicleId_Component_Status",
                schema: "customer",
                table: "Suggestions",
                columns: new[] { "VehicleId", "Component", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_Trips_VehicleId_StartedAt",
                schema: "customer",
                table: "Trips",
                columns: new[] { "VehicleId", "StartedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Vehicles_CustomerId",
                schema: "customer",
                table: "Vehicles",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_WearProfiles_VehicleId_WeekStart",
                schema: "customer",
                table: "WearProfiles",
                columns: new[] { "VehicleId", "WeekStart" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Customers",
                schema: "customer");

            migrationBuilder.DropTable(
                name: "Loyalty",
                schema: "customer");

            migrationBuilder.DropTable(
                name: "OtpChallenges",
                schema: "customer");

            migrationBuilder.DropTable(
                name: "SosHistory",
                schema: "customer");

            migrationBuilder.DropTable(
                name: "Suggestions",
                schema: "customer");

            migrationBuilder.DropTable(
                name: "Trips",
                schema: "customer");

            migrationBuilder.DropTable(
                name: "Vehicles",
                schema: "customer");

            migrationBuilder.DropTable(
                name: "WearProfiles",
                schema: "customer");

            migrationBuilder.DropTable(
                name: "SosRequests",
                schema: "customer");
        }
    }
}
