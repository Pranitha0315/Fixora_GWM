using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;
using Fixora.SharedKernel;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Tests.Integration;

/// <summary>
/// ManagerNote privacy (tests only — no production change).
/// The manager note is internal (manager → workshop floor). A customer must never receive it on any
/// customer endpoint. Positive controls (staff + assigned mechanic still see it) prove the sentinel really
/// reaches the payload, so "customer does not see it" is a meaningful result and not a false pass.
/// Covers the paths not yet asserted elsewhere: customer job list, job detail, home dashboard.
/// (Booking list is covered by BookingAuditFixTests.BT06.)
/// </summary>
[Collection("api")]
public class BookingManagerNotePrivacyTests(FixoraFactory factory)
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);
    private const string Sentinel = "MGR-NOTE-PRIVACY-SENTINEL-7f3a";

    // Tokens are minted with the app's own ITokenService instead of POST /auth/login:
    // the auth endpoint is rate-limited (10 per minute per IP) and the shared suite already uses that budget.
    private async Task<HttpClient> ClientAsync(Guid userId, string role, string name)
    {
        using var scope = factory.Services.CreateScope();
        var tokens = await scope.ServiceProvider.GetRequiredService<ITokenService>().IssueAsync(userId, role, name);
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokens.AccessToken);
        return client;
    }

    private Task<HttpClient> Manager() => ClientAsync(DemoIds.Manager, Roles.Manager, "Manager");
    private Task<HttpClient> Customer() => ClientAsync(DemoIds.CustomerKavitha, Roles.Customer, "Kavitha");
    private Task<HttpClient> Mechanic() => ClientAsync(DemoIds.MechanicRavi, Roles.Mechanic, "Ravi");

    /// <summary>Sets (or clears) the manager note on Kavitha's seeded active job.</summary>
    private async Task SetJobManagerNoteAsync(string? note)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IManagerDb>();
        var job = db.JobCards.Single(j => j.Id == DemoIds.JobKavithaToday);
        job.ManagerNote = note;
        await db.SaveChangesAsync();
    }

    private static async Task<string> GetBodyAsync(HttpClient client, string path)
    {
        var res = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return await res.Content.ReadAsStringAsync();
    }

    // Customer job list: the job is present, but the note is stripped from every row.
    [Fact]
    public async Task Customer_job_list_hides_the_manager_note_but_still_lists_the_job()
    {
        await SetJobManagerNoteAsync(Sentinel);
        try
        {
            var res = await (await Customer()).GetAsync("/api/v1/customer/jobs?activeOnly=false");
            Assert.Equal(HttpStatusCode.OK, res.StatusCode);
            var jobs = (await res.Content.ReadFromJsonAsync<List<JobSummaryDto>>(Web))!;

            var mine = Assert.Single(jobs, j => j.Id == DemoIds.JobKavithaToday);
            Assert.Null(mine.ManagerNote);
        }
        finally
        {
            await SetJobManagerNoteAsync(null);
        }
    }

    [Fact]
    public async Task Customer_job_list_body_never_contains_the_note_text()
    {
        await SetJobManagerNoteAsync(Sentinel);
        try
        {
            var body = await GetBodyAsync(await Customer(), "/api/v1/customer/jobs?activeOnly=false");
            Assert.Contains(DemoIds.JobKavithaToday.ToString(), body); // proves the job is in the payload
            Assert.DoesNotContain(Sentinel, body);
        }
        finally
        {
            await SetJobManagerNoteAsync(null);
        }
    }

    // Customer job detail: summary is masked.
    [Fact]
    public async Task Customer_job_detail_hides_the_manager_note()
    {
        await SetJobManagerNoteAsync(Sentinel);
        try
        {
            var body = await GetBodyAsync(await Customer(), $"/api/v1/customer/jobs/{DemoIds.JobKavithaToday}");
            Assert.Contains(DemoIds.JobKavithaToday.ToString(), body);
            Assert.DoesNotContain(Sentinel, body);
        }
        finally
        {
            await SetJobManagerNoteAsync(null);
        }
    }

    // Customer home dashboard (active job card): must not leak the note either.
    [Fact]
    public async Task Customer_home_dashboard_never_contains_the_manager_note()
    {
        await SetJobManagerNoteAsync(Sentinel);
        try
        {
            var body = await GetBodyAsync(await Customer(), "/api/v1/customer/home");
            Assert.Contains(DemoIds.JobKavithaToday.ToString(), body); // active job is shown on home
            Assert.DoesNotContain(Sentinel, body);
        }
        finally
        {
            await SetJobManagerNoteAsync(null);
        }
    }

    // Positive control: staff sees the note on the same job (so the customer "absent" results above mean something).
    [Fact]
    public async Task Staff_job_detail_shows_the_manager_note_positive_control()
    {
        await SetJobManagerNoteAsync(Sentinel);
        try
        {
            var res = await (await Manager()).GetAsync($"/api/v1/manager/jobs/{DemoIds.JobKavithaToday}");
            Assert.Equal(HttpStatusCode.OK, res.StatusCode);
            var detail = (await res.Content.ReadFromJsonAsync<JobDetailDto>(Web))!;
            Assert.Equal(Sentinel, detail.Job.ManagerNote);
        }
        finally
        {
            await SetJobManagerNoteAsync(null);
        }
    }

    // Positive control: the assigned mechanic (manager → mechanic is the intended audience) still sees the note.
    [Fact]
    public async Task Assigned_mechanic_job_detail_still_shows_the_manager_note()
    {
        await SetJobManagerNoteAsync(Sentinel);
        try
        {
            var body = await GetBodyAsync(await Mechanic(), $"/api/v1/mechanic/jobs/{DemoIds.JobKavithaToday}");
            Assert.Contains(Sentinel, body);
        }
        finally
        {
            await SetJobManagerNoteAsync(null);
        }
    }
}

/// <summary>Pure unit checks for the response-layer mask (no HTTP, no database).</summary>
public class ManagerNoteVisibilityTests
{
    private const string Sentinel = "MGR-NOTE-PRIVACY-SENTINEL-7f3a";

    private static JobSummaryDto Job(string? note) => new(
        Guid.NewGuid(), "JC-2026-0042", Guid.NewGuid(), "Kavitha", Guid.NewGuid(), "Wagon R",
        Guid.NewGuid(), "Ravi", Guid.NewGuid(), "Bay 1", "InProgress", JobPriority.High, 0, null,
        60, 10.5, DateTime.UtcNow, null, null, "Brake noise", note);

    [Fact]
    public void ForCustomer_clears_only_the_manager_note_and_keeps_everything_else()
    {
        var job = Job(Sentinel);

        var masked = job.ForCustomer();

        Assert.Null(masked.ManagerNote);
        Assert.Equal(job with { ManagerNote = null }, masked); // nothing else changed
        Assert.Equal(JobPriority.High, masked.Priority);
        Assert.Equal("Brake noise", masked.Complaint);
    }

    [Fact]
    public void ForCustomer_on_a_list_clears_every_row()
    {
        IReadOnlyList<JobSummaryDto> list = new[] { Job(Sentinel), Job("second " + Sentinel), Job(null) };

        var masked = list.ForCustomer();

        Assert.Equal(3, masked.Count);
        Assert.All(masked, j => Assert.Null(j.ManagerNote));
    }

    [Fact]
    public void ForCustomer_does_not_mutate_the_original_staff_record()
    {
        var job = Job(Sentinel);

        _ = job.ForCustomer();

        Assert.Equal(Sentinel, job.ManagerNote); // staff copy is untouched (records are immutable via `with`)
    }
}
