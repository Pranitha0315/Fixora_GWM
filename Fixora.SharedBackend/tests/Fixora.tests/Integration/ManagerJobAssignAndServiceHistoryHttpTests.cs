using System.Net;
using System.Net.Http.Json;
using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Manager.Infrastructure.Persistence;
using Fixora.Mechanic.Infrastructure.Persistence;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Tests.Integration;

/// <summary>
/// FX13-D03-NID-2 HTTP closeout: manager assign gates and customer service-history ownership.
/// Uses an isolated <see cref="FixoraFactory"/> so seed mutations do not affect other API tests.
/// </summary>
public sealed class ManagerJobAssignAndServiceHistoryHttpTests : IAsyncLifetime
{
    private readonly FixoraFactory _factory = new();

    public Task InitializeAsync() => Task.CompletedTask;

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private static async Task<ApiErrorResponse> ReadErrorAsync(HttpResponseMessage response)
    {
        var error = await response.Content.ReadFromJsonAsync<ApiErrorResponse>();
        Assert.NotNull(error);
        return error!;
    }

    private async Task SetMechanicActiveAsync(Guid mechanicId, bool active)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<MechanicDbContext>();
        var mechanic = await db.Mechanics.SingleAsync(m => m.Id == mechanicId);
        mechanic.Active = active;
        await db.SaveChangesAsync();
    }

    private async Task SetBayActiveAsync(Guid bayId, bool active)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ManagerDbContext>();
        var bay = await db.Bays.SingleAsync(b => b.Id == bayId);
        bay.Active = active;
        await db.SaveChangesAsync();
    }

    private async Task<Guid> SeedCompletedHistoryJobAsync(Guid customerId, string customerName, Guid vehicleId, string vehicleLabel)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ManagerDbContext>();
        var now = DateTime.UtcNow;
        var job = new JobCard
        {
            Number = $"JC-H-{Guid.NewGuid():N}"[..16],
            CustomerId = customerId,
            CustomerName = customerName,
            VehicleId = vehicleId,
            VehicleLabel = vehicleLabel,
            MechanicId = DemoIds.MechanicRavi,
            BayId = DemoIds.Bay1,
            Status = JobStatus.Completed,
            Complaint = "History service",
            EstimatedMinutes = 60,
            CreatedAt = now.AddDays(-3),
            StartedAt = now.AddDays(-3),
            CompletedAt = now.AddDays(-2)
        };
        db.JobCards.Add(job);
        db.Invoices.Add(new Invoice
        {
            JobCardId = job.Id,
            CustomerId = customerId,
            Number = $"INV-H-{Guid.NewGuid():N}"[..12],
            Subtotal = 2500m,
            Total = 2500m,
            IssuedAt = now.AddDays(-2)
        });
        await db.SaveChangesAsync();
        return job.Id;
    }

    [Fact]
    public async Task Manager_assigns_active_mechanic_and_active_bay()
    {
        var manager = await _factory.Manager();

        var response = await manager.PostAsJsonAsync(
            $"/api/v1/manager/jobs/{DemoIds.JobArunToday}/assign",
            new { mechanicId = DemoIds.MechanicSenthil, bayId = DemoIds.Bay1 });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var summary = (await response.Content.ReadFromJsonAsync<JobSummaryDto>())!;
        Assert.Equal(DemoIds.MechanicSenthil, summary.MechanicId);
        Assert.Equal(DemoIds.Bay1, summary.BayId);
    }

    [Fact]
    public async Task Unknown_mechanic_assign_succeeds_on_Shared()
    {
        // Shared AssignAsync does not look up mechanic accounts.
        var manager = await _factory.Manager();
        var unknownMechanic = Guid.NewGuid();

        var response = await manager.PostAsJsonAsync(
            $"/api/v1/manager/jobs/{DemoIds.JobArunToday}/assign",
            new { mechanicId = unknownMechanic, bayId = DemoIds.Bay1 });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var summary = (await response.Content.ReadFromJsonAsync<JobSummaryDto>())!;
        Assert.Equal(unknownMechanic, summary.MechanicId);
        Assert.Equal(DemoIds.Bay1, summary.BayId);
    }

    [Fact]
    public async Task Inactive_mechanic_assign_succeeds_on_Shared()
    {
        // Shared AssignAsync does not check mechanic Active.
        var manager = await _factory.Manager();
        await SetMechanicActiveAsync(DemoIds.MechanicSenthil, active: false);
        try
        {
            var response = await manager.PostAsJsonAsync(
                $"/api/v1/manager/jobs/{DemoIds.JobArunToday}/assign",
                new { mechanicId = DemoIds.MechanicSenthil, bayId = DemoIds.Bay1 });

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var summary = (await response.Content.ReadFromJsonAsync<JobSummaryDto>())!;
            Assert.Equal(DemoIds.MechanicSenthil, summary.MechanicId);
            Assert.Equal(DemoIds.Bay1, summary.BayId);
        }
        finally
        {
            await SetMechanicActiveAsync(DemoIds.MechanicSenthil, active: true);
        }
    }

    [Fact]
    public async Task Unknown_bay_assign_succeeds_on_Shared()
    {
        // Shared AssignAsync writes BayId without existence/active checks.
        var manager = await _factory.Manager();
        var unknownBay = Guid.NewGuid();

        var response = await manager.PostAsJsonAsync(
            $"/api/v1/manager/jobs/{DemoIds.JobArunToday}/assign",
            new { mechanicId = DemoIds.MechanicKumar, bayId = unknownBay });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var summary = (await response.Content.ReadFromJsonAsync<JobSummaryDto>())!;
        Assert.Equal(DemoIds.MechanicKumar, summary.MechanicId);
        Assert.Equal(unknownBay, summary.BayId);
    }

    [Fact]
    public async Task Inactive_bay_assign_succeeds_on_Shared()
    {
        var manager = await _factory.Manager();
        await SetBayActiveAsync(DemoIds.Bay2, active: false);
        try
        {
            var response = await manager.PostAsJsonAsync(
                $"/api/v1/manager/jobs/{DemoIds.JobArunToday}/assign",
                new { mechanicId = DemoIds.MechanicKumar, bayId = DemoIds.Bay2 });

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var summary = (await response.Content.ReadFromJsonAsync<JobSummaryDto>())!;
            Assert.Equal(DemoIds.MechanicKumar, summary.MechanicId);
            Assert.Equal(DemoIds.Bay2, summary.BayId);
        }
        finally
        {
            await SetBayActiveAsync(DemoIds.Bay2, active: true);
        }
    }

    [Fact]
    public async Task Unauthenticated_caller_cannot_assign_job()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            $"/api/v1/manager/jobs/{DemoIds.JobArunToday}/assign",
            new { mechanicId = DemoIds.MechanicKumar, bayId = DemoIds.Bay1 });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Mechanic_token_cannot_assign_job()
    {
        var mechanic = await _factory.Mechanic();

        var response = await mechanic.PostAsJsonAsync(
            $"/api/v1/manager/jobs/{DemoIds.JobArunToday}/assign",
            new { mechanicId = DemoIds.MechanicKumar, bayId = DemoIds.Bay1 });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Customer_service_history_returns_only_own_eligible_jobs()
    {
        var kavithaJobId = await SeedCompletedHistoryJobAsync(
            DemoIds.CustomerKavitha,
            "Kavitha",
            DemoIds.VehicleWagonR,
            "Suzuki Wagon R (NP CAB-4521)");
        var arunJobId = await SeedCompletedHistoryJobAsync(
            DemoIds.CustomerArun,
            "Arun",
            DemoIds.VehicleArunAxio,
            "Toyota Axio (NP KX-2210)");

        var kavitha = await _factory.Customer();
        var arun = await _factory.LoginAsync(
            "/api/v1/customer/auth/login",
            new { email = "arun@fixora.lk", password = "Fixora@123" });

        var kavithaHistory = (await kavitha.GetFromJsonAsync<List<ServiceHistoryDto>>(
            "/api/v1/customer/service-history"))!;
        var arunHistory = (await arun.GetFromJsonAsync<List<ServiceHistoryDto>>(
            "/api/v1/customer/service-history"))!;

        Assert.Contains(kavithaHistory, h => h.JobId == kavithaJobId);
        Assert.DoesNotContain(kavithaHistory, h => h.JobId == arunJobId);
        Assert.All(kavithaHistory, h => Assert.True(h.JobId != Guid.Empty));

        Assert.Contains(arunHistory, h => h.JobId == arunJobId);
        Assert.DoesNotContain(arunHistory, h => h.JobId == kavithaJobId);
    }

    [Fact]
    public async Task Unauthenticated_caller_cannot_read_service_history()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/v1/customer/service-history");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
