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
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Tests.Integration;

/// <summary>
/// CURRENT BEHAVIOUR (characterization only — no production change).
/// The job-card manager note is stripped for customers. The manager note on a forwarded proposal and on a
/// change request is not: it is still present on the customer job detail and on pending approvals.
/// A product decision is required before this is treated as a bug fix.
/// Uses the shared API host and removes the seeded rows afterwards.
/// </summary>
[Collection("api")]
public class ProposalChangeRequestNoteVisibilityTests(FixoraFactory factory)
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);
    private const string JobSentinel = "JOB-NOTE-MASKED-SENTINEL-3a91";
    private const string ProposalSentinel = "PROPOSAL-NOTE-VISIBLE-SENTINEL-3a91";
    private const string ChangeSentinel = "CHANGE-NOTE-VISIBLE-SENTINEL-3a91";

    private async Task<HttpClient> ClientAsync(Guid userId, string role, string name)
    {
        using var scope = factory.Services.CreateScope();
        var tokens = await scope.ServiceProvider.GetRequiredService<ITokenService>().IssueAsync(userId, role, name);
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokens.AccessToken);
        return client;
    }

    private async Task SeedAsync()
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IManagerDb>();
        var job = db.JobCards.Single(j => j.Id == DemoIds.JobKavithaToday);
        job.ManagerNote = JobSentinel;

        var proposal = new RepairProposal
        {
            JobCardId = job.Id,
            MechanicId = DemoIds.MechanicRavi,
            Status = ProposalStatus.AwaitingCustomer,
            ManagerNote = ProposalSentinel,
            SubmittedAt = DateTime.UtcNow,
            PublishedAt = DateTime.UtcNow,
        };
        proposal.Items.Add(new RepairItem
        {
            ProposalId = proposal.Id,
            JobCardId = job.Id,
            Title = "Pads",
            Kind = RepairItemKind.Part,
            Qty = 1,
            UnitPrice = 1000,
            Status = RepairItemStatus.AwaitingCustomer,
        });
        db.Proposals.Add(proposal);
        db.ChangeRequests.Add(new CustomerChangeRequest
        {
            JobCardId = job.Id,
            CustomerId = DemoIds.CustomerKavitha,
            Number = "CR-TEST-3A91",
            ChangesPipe = "Keep old parts",
            Details = "characterization",
            Status = ChangeRequestStatus.PendingManagerReview,
            ManagerNote = ChangeSentinel,
            CreatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
    }

    private async Task CleanupAsync()
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IManagerDb>();
        var proposals = await db.Proposals.Include(p => p.Items).Where(p => p.ManagerNote == ProposalSentinel).ToListAsync();
        db.Proposals.RemoveRange(proposals);
        var changes = await db.ChangeRequests.Where(c => c.ManagerNote == ChangeSentinel).ToListAsync();
        db.ChangeRequests.RemoveRange(changes);
        var job = await db.JobCards.SingleAsync(j => j.Id == DemoIds.JobKavithaToday);
        if (job.ManagerNote == JobSentinel) job.ManagerNote = null;
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Customer_job_detail_hides_the_job_note_but_still_returns_proposal_and_change_request_notes()
    {
        await SeedAsync();
        try
        {
            var customer = await ClientAsync(DemoIds.CustomerKavitha, Roles.Customer, "Kavitha");
            var res = await customer.GetAsync($"/api/v1/customer/jobs/{DemoIds.JobKavithaToday}");
            Assert.Equal(HttpStatusCode.OK, res.StatusCode);
            var body = await res.Content.ReadAsStringAsync();
            var detail = JsonSerializer.Deserialize<JobDetailDto>(body, Web)!;

            Assert.Null(detail.Job.ManagerNote);
            Assert.DoesNotContain(JobSentinel, body);
            var proposal = Assert.Single(detail.Proposals, p => p.ManagerNote == ProposalSentinel);
            var change = Assert.Single(detail.ChangeRequests, c => c.ManagerNote == ChangeSentinel);
            Assert.Contains(ProposalSentinel, body);
            Assert.Contains(ChangeSentinel, body);
            Assert.Equal(DemoIds.JobKavithaToday, proposal.JobCardId);
            Assert.Equal(DemoIds.JobKavithaToday, change.JobCardId);
        }
        finally
        {
            await CleanupAsync();
        }
    }

    [Fact]
    public async Task Customer_pending_approvals_still_include_the_proposal_manager_note()
    {
        await SeedAsync();
        try
        {
            var customer = await ClientAsync(DemoIds.CustomerKavitha, Roles.Customer, "Kavitha");
            var res = await customer.GetAsync("/api/v1/customer/approvals/pending");
            Assert.Equal(HttpStatusCode.OK, res.StatusCode);
            var body = await res.Content.ReadAsStringAsync();
            var pending = JsonSerializer.Deserialize<List<ProposalDto>>(body, Web)!;

            Assert.Contains(pending, p => p.ManagerNote == ProposalSentinel);
            Assert.Contains(ProposalSentinel, body);
            Assert.DoesNotContain(JobSentinel, body);
        }
        finally
        {
            await CleanupAsync();
        }
    }

    [Fact]
    public async Task Staff_job_detail_still_shows_all_three_notes()
    {
        await SeedAsync();
        try
        {
            var manager = await ClientAsync(DemoIds.Manager, Roles.Manager, "Manager");
            var res = await manager.GetAsync($"/api/v1/manager/jobs/{DemoIds.JobKavithaToday}");
            Assert.Equal(HttpStatusCode.OK, res.StatusCode);
            var detail = (await res.Content.ReadFromJsonAsync<JobDetailDto>(Web))!;

            Assert.Equal(JobSentinel, detail.Job.ManagerNote);
            Assert.Contains(detail.Proposals, p => p.ManagerNote == ProposalSentinel);
            Assert.Contains(detail.ChangeRequests, c => c.ManagerNote == ChangeSentinel);
        }
        finally
        {
            await CleanupAsync();
        }
    }
}
