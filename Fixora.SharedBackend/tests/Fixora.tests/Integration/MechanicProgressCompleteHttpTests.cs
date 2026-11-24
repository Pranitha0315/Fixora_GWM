using System.Net;
using System.Net.Http.Json;
using Fixora.Manager.Contracts;
using Fixora.Mechanic.Application.Jobs;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("mechanic-progress-complete-http", DisableParallelization = true)]
public sealed class MechanicProgressCompleteHttpCollection;

/// <summary>
/// Conflict-safe tests-only: mechanic progress + complete on Open→Inspecting jobs.
/// Does not change Confirm/CheckIn timing or THA production files.
/// </summary>
[Collection("mechanic-progress-complete-http")]
public sealed class MechanicProgressCompleteHttpTests
{
    private static FixoraFactory NewFactory() => new();

    [Fact]
    public async Task Assignee_can_report_progress_after_start()
    {
        await using var factory = NewFactory();
        var kumar = await factory.LoginAsync(
            "/api/v1/mechanic/auth/pin-login",
            new { login = "EMP-002", pin = "2345" });
        var jobId = DemoIds.JobArunToday;

        Assert.Equal(HttpStatusCode.OK,
            (await kumar.PostAsJsonAsync(
                $"/api/v1/mechanic/jobs/{jobId}/actions",
                new JobActionRequest("start", null, null, null))).StatusCode);

        var progress = await kumar.PostAsJsonAsync(
            $"/api/v1/mechanic/jobs/{jobId}/actions",
            new JobActionRequest("progress", "Inspection", "Found oil leak near filter", 35));
        Assert.Equal(HttpStatusCode.OK, progress.StatusCode);
        var job = (await progress.Content.ReadFromJsonAsync<JobSummaryDto>())!;
        Assert.Equal("Inspecting", job.Status);

        var detail = (await kumar.GetFromJsonAsync<MechanicJobDetailDto>(
            $"/api/v1/mechanic/jobs/{jobId}"))!;
        Assert.Contains(detail.Detail.Timeline, t =>
            t.Message.Contains("oil leak", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Progress_without_message_is_bad_request()
    {
        await using var factory = NewFactory();
        var kumar = await factory.LoginAsync(
            "/api/v1/mechanic/auth/pin-login",
            new { login = "EMP-002", pin = "2345" });
        var jobId = DemoIds.JobArunToday;

        Assert.Equal(HttpStatusCode.OK,
            (await kumar.PostAsJsonAsync(
                $"/api/v1/mechanic/jobs/{jobId}/actions",
                new JobActionRequest("start", null, null, null))).StatusCode);

        var response = await kumar.PostAsJsonAsync(
            $"/api/v1/mechanic/jobs/{jobId}/actions",
            new JobActionRequest("progress", "Inspection", "  ", 20));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Progress_on_open_job_before_start_succeeds_on_Shared()
    {
        // Shared ApplyMechanicActionAsync "progress" only blocks approval-pending statuses,
        // not Open (no EnsureCanReportProgress gate).
        await using var factory = NewFactory();
        var kumar = await factory.LoginAsync(
            "/api/v1/mechanic/auth/pin-login",
            new { login = "EMP-002", pin = "2345" });

        var response = await kumar.PostAsJsonAsync(
            $"/api/v1/mechanic/jobs/{DemoIds.JobArunToday}/actions",
            new JobActionRequest("progress", "Inspection", "too early", 10));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Assignee_can_complete_inspecting_job()
    {
        await using var factory = NewFactory();
        var kumar = await factory.LoginAsync(
            "/api/v1/mechanic/auth/pin-login",
            new { login = "EMP-002", pin = "2345" });
        var jobId = DemoIds.JobArunToday;

        Assert.Equal(HttpStatusCode.OK,
            (await kumar.PostAsJsonAsync(
                $"/api/v1/mechanic/jobs/{jobId}/actions",
                new JobActionRequest("start", null, null, null))).StatusCode);

        var complete = await kumar.PostAsJsonAsync(
            $"/api/v1/mechanic/jobs/{jobId}/actions",
            new JobActionRequest("complete", null, "Inspection only — ready for pickup", null));
        Assert.Equal(HttpStatusCode.OK, complete.StatusCode);
        Assert.Equal("Completed",
            (await complete.Content.ReadFromJsonAsync<JobSummaryDto>())!.Status);
    }

    [Fact]
    public async Task Unknown_action_is_bad_request()
    {
        await using var factory = NewFactory();
        var kumar = await factory.LoginAsync(
            "/api/v1/mechanic/auth/pin-login",
            new { login = "EMP-002", pin = "2345" });

        var response = await kumar.PostAsJsonAsync(
            $"/api/v1/mechanic/jobs/{DemoIds.JobArunToday}/actions",
            new JobActionRequest("teleport", null, null, null));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
