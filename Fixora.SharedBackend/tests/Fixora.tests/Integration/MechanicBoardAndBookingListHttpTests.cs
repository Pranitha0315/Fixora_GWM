using System.Net;
using System.Net.Http.Json;
using Fixora.Customer.Application.Vehicles;
using Fixora.Manager.Contracts;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("mechanic-board-booking-list-http", DisableParallelization = true)]
public sealed class MechanicBoardAndBookingListHttpCollection;

/// <summary>
/// Conflict-safe tests-only: mechanic assigned/queue boards, customer jobs/queue,
/// manager booking list + decline of Requested seed (no Confirm/CheckIn timing).
/// </summary>
[Collection("mechanic-board-booking-list-http")]
public sealed class MechanicBoardAndBookingListHttpTests
{
    private static FixoraFactory NewFactory() => new();

    [Fact]
    public async Task Mechanic_assigned_and_queue_boards_show_seeded_jobs()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();
        var kumar = await factory.LoginAsync(
            "/api/v1/mechanic/auth/pin-login",
            new { login = "EMP-002", pin = "2345" });

        var raviAssigned = (await ravi.GetFromJsonAsync<List<JobSummaryDto>>("/api/v1/mechanic/jobs"))!;
        Assert.Contains(raviAssigned, j => j.Id == DemoIds.JobKavithaToday);
        Assert.DoesNotContain(raviAssigned, j => j.Id == DemoIds.JobArunToday);

        var kumarAssigned = (await kumar.GetFromJsonAsync<List<JobSummaryDto>>("/api/v1/mechanic/jobs"))!;
        Assert.Contains(kumarAssigned, j => j.Id == DemoIds.JobArunToday);

        var queue = (await ravi.GetFromJsonAsync<List<JobSummaryDto>>("/api/v1/mechanic/jobs/queue"))!;
        Assert.Contains(queue, j => j.Id == DemoIds.JobKavithaToday || j.Id == DemoIds.JobArunToday);
    }

    [Fact]
    public async Task Customer_jobs_and_queue_estimate_are_owner_scoped()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var arun = await factory.LoginAsync(
            "/api/v1/customer/auth/login",
            new { email = "arun@fixora.lk", password = "Fixora@123" });

        var jobs = (await kavitha.GetFromJsonAsync<List<JobSummaryDto>>(
            "/api/v1/customer/jobs?activeOnly=true"))!;
        Assert.Contains(jobs, j => j.Id == DemoIds.JobKavithaToday);

        var detail = await kavitha.GetFromJsonAsync<JobDetailDto>(
            $"/api/v1/customer/jobs/{DemoIds.JobKavithaToday}");
        Assert.Equal(DemoIds.JobKavithaToday, detail!.Job.Id);

        var queue = await kavitha.GetFromJsonAsync<QueueEstimateDto>(
            $"/api/v1/customer/queue/{DemoIds.JobKavithaToday}");
        Assert.Equal(DemoIds.JobKavithaToday, queue!.JobId);

        Assert.Equal(HttpStatusCode.NotFound,
            (await arun.GetAsync($"/api/v1/customer/jobs/{DemoIds.JobKavithaToday}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await arun.GetAsync($"/api/v1/customer/queue/{DemoIds.JobKavithaToday}")).StatusCode);
    }

    [Fact]
    public async Task Manager_lists_requested_booking_and_can_decline_without_checkin()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        var list = (await manager.GetFromJsonAsync<PagedResult<BookingDto>>(
            "/api/v1/manager/bookings?status=Requested"))!;
        var requested = Assert.Single(list.Items, b =>
            b.CustomerId == DemoIds.CustomerArun
            && b.ServiceId == DemoIds.ServiceAlignment
            && b.Status == "Requested");

        var decline = await manager.PostAsJsonAsync(
            $"/api/v1/manager/bookings/{requested.Id}/decline",
            new { reason = "Bay full that morning" });
        Assert.Equal(HttpStatusCode.OK, decline.StatusCode);
        var declined = (await decline.Content.ReadFromJsonAsync<BookingDto>())!;
        Assert.Equal("Declined", declined.Status);
        Assert.Contains("Bay full", declined.DeclineReason ?? "", StringComparison.OrdinalIgnoreCase);

        var stillRequested = (await manager.GetFromJsonAsync<PagedResult<BookingDto>>(
            "/api/v1/manager/bookings?status=Requested"))!;
        Assert.DoesNotContain(stillRequested.Items, b => b.Id == requested.Id);
    }

    [Fact]
    public async Task Customer_can_add_and_remove_vehicle()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var reg = $"NP T-{Guid.NewGuid():N}"[..10].ToUpperInvariant();

        var create = await kavitha.PostAsJsonAsync(
            "/api/v1/customer/vehicles",
            new VehicleUpsert(reg, "Honda", "Fit", 2017, "Car", 45000, "Blue", "Petrol"));
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var vehicle = (await create.Content.ReadFromJsonAsync<VehicleDto>())!;
        Assert.Equal(reg, vehicle.RegistrationNo);
        Assert.False(vehicle.DriveSenseOptIn);

        var remove = await kavitha.DeleteAsync($"/api/v1/customer/vehicles/{vehicle.Id}");
        Assert.Equal(HttpStatusCode.NoContent, remove.StatusCode);

        var list = (await kavitha.GetFromJsonAsync<List<VehicleDto>>("/api/v1/customer/vehicles"))!;
        Assert.DoesNotContain(list, v => v.Id == vehicle.Id);
    }

    [Fact]
    public async Task Manager_can_return_proposal_to_mechanic()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();
        var manager = await factory.Manager();
        var jobId = DemoIds.JobKavithaToday;

        var submit = await ravi.PostAsJsonAsync(
            $"/api/v1/mechanic/jobs/{jobId}/proposals",
            new SubmitProposalRequest(
                new[]
                {
                    new ProposalItemInput("Pad kit", "Part", 1, 4000m, null, DemoIds.PartBrakePads),
                },
                "needs clearer photos"));
        submit.EnsureSuccessStatusCode();
        var proposal = (await submit.Content.ReadFromJsonAsync<ProposalDto>())!;
        Assert.Equal("PendingManagerReview", proposal.Status);

        var ret = await manager.PostAsJsonAsync(
            $"/api/v1/manager/approvals/proposals/{proposal.Id}/return",
            new { note = "Retake close-up of pads" });
        Assert.Equal(HttpStatusCode.OK, ret.StatusCode);
        var returned = (await ret.Content.ReadFromJsonAsync<ProposalDto>())!;
        Assert.Equal("ReturnedToMechanic", returned.Status);

        var mechView = (await ravi.GetFromJsonAsync<List<ProposalDto>>(
            $"/api/v1/mechanic/jobs/{jobId}/proposals"))!.Single(p => p.Id == proposal.Id);
        Assert.Equal("ReturnedToMechanic", mechView.Status);
    }

    [Fact]
    public async Task Anonymous_boards_unauthorized()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/mechanic/jobs")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/manager/bookings")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/customer/jobs")).StatusCode);
    }
}
