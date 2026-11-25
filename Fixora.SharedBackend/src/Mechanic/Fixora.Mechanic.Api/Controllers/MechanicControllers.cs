using Fixora.Customer.Contracts;
using Fixora.Manager.Contracts;
using Fixora.Mechanic.Application.Auth;
using Fixora.Mechanic.Application.FixProof;
using Fixora.Mechanic.Application.Jobs;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.DependencyInjection;

// Every controller in this assembly binds JSON bodies and returns ProblemDetails-style 400s.
[assembly: Microsoft.AspNetCore.Mvc.ApiController]

namespace Fixora.Mechanic.Api.Controllers;

/// <summary>Fixora.Mechanic.Api — Fixora Rev endpoints (/api/v1/mechanic/*). Assigned-job guard on every job route.</summary>
[ApiController]
[Authorize(Policy = Policies.Mechanic)]
public abstract class MechanicControllerBase : ControllerBase
{
    protected Guid MechanicId => HttpContext.RequestServices.GetRequiredService<ICurrentUser>().UserId;
}

public sealed record NoteBody(string? Note);
public sealed record SosStatusBody(string Status, string? Note);

[Route("api/v1/mechanic/auth")]
[EnableRateLimiting("auth")]
public sealed class MechanicAuthController(MechanicAuthService auth) : ControllerBase
{
    [HttpPost("pin-login")][AllowAnonymous] public Task<AuthTokens> Login(PinLoginRequest req, CancellationToken ct) => auth.LoginAsync(req, ct);
    [HttpGet("invitations/{token}")][AllowAnonymous] public Task<InvitationInfo> Invitation(string token, CancellationToken ct) => auth.CheckInvitationAsync(token, ct);
    [HttpPost("invitations/accept")][AllowAnonymous] public Task<AuthTokens> Accept(AcceptInvitationRequest req, CancellationToken ct) => auth.AcceptInvitationAsync(req, ct);
}

[Route("api/v1/mechanic/profile")]
public sealed class MechanicProfileController(MechanicAuthService auth) : MechanicControllerBase
{
    [HttpGet] public Task<MechanicProfileDto> Get(CancellationToken ct) => auth.ProfileAsync(MechanicId, ct);
    [HttpPost("pin")] public async Task<IActionResult> ChangePin(ChangePinRequest req, CancellationToken ct) { await auth.ChangePinAsync(MechanicId, req, ct); return NoContent(); }
    [HttpPut("duty")] public Task<MechanicProfileDto> Duty(DutyRequest req, CancellationToken ct) => auth.SetDutyAsync(MechanicId, req.OnDuty, ct);
}

[Route("api/v1/mechanic/jobs")]
public sealed class AssignedJobsController(MechanicJobService jobs) : MechanicControllerBase
{
    [HttpGet] public Task<IReadOnlyList<JobSummaryDto>> Assigned(CancellationToken ct) => jobs.AssignedAsync(MechanicId, ct);
    [HttpGet("queue")] public Task<IReadOnlyList<JobSummaryDto>> Queue(CancellationToken ct) => jobs.QueueBoardAsync(ct);
    [HttpGet("{jobId:guid}")] public Task<MechanicJobDetailDto> Get(Guid jobId, CancellationToken ct) => jobs.DetailAsync(MechanicId, jobId, ct);

    /// <summary>start | pause | resume | progress | complete — progress reaches customer and manager in real time.</summary>
    [HttpPost("{jobId:guid}/actions")] public Task<JobSummaryDto> Action(Guid jobId, JobActionRequest req, CancellationToken ct) => jobs.ActionAsync(MechanicId, jobId, req, ct);

    /// <summary>Repair proposal → manager review → customer → manager release → back to you.</summary>
    [HttpPost("{jobId:guid}/proposals")] public Task<ProposalDto> Propose(Guid jobId, SubmitProposalRequest req, CancellationToken ct) => jobs.SubmitProposalAsync(MechanicId, jobId, req, ct);
    [HttpGet("{jobId:guid}/proposals")] public Task<IReadOnlyList<ProposalDto>> Proposals(Guid jobId, CancellationToken ct) => jobs.ProposalsAsync(MechanicId, jobId, ct);
    [HttpPost("change-requests/{id:guid}/acknowledge")] public Task<ChangeRequestDto> Acknowledge(Guid id, NoteBody req, CancellationToken ct) => jobs.AcknowledgeChangeAsync(MechanicId, id, req.Note, ct);
}

[Route("api/v1/mechanic/jobs/{jobId:guid}/fixproof")]
public sealed class FixProofCaptureController(FixProofCaptureService fixproof) : MechanicControllerBase
{
    [HttpPost("media")]
    [RequestSizeLimit(60_000_000)]
    public async Task<MediaUploadResult> Upload(Guid jobId, IFormFile file, [FromForm] string phase = "Before", [FromForm] string? caption = null, CancellationToken ct = default)
    {
        await using var stream = file.OpenReadStream();
        return await fixproof.UploadMediaAsync(MechanicId, jobId, stream, file.ContentType, file.FileName, phase, caption, ct);
    }

    [HttpGet("media")] public Task<IReadOnlyList<MediaUploadResult>> Media(Guid jobId, CancellationToken ct) => fixproof.ListMediaAsync(MechanicId, jobId, ct);

    [HttpPost("transcribe")]
    [RequestSizeLimit(16 * 1024 * 1024)]
    public async Task<TranscriptResult> Transcribe(Guid jobId, IFormFile audio, [FromForm] string language = "ta", CancellationToken ct = default)
    {
        await using var stream = audio.OpenReadStream();
        return await fixproof.TranscribeAsync(MechanicId, jobId, stream, audio.ContentType, audio.Length, language, ct);
    }

    [HttpGet("drafts")] public Task<IReadOnlyList<DraftDto>> Drafts(Guid jobId, CancellationToken ct) => fixproof.ListDraftsAsync(MechanicId, jobId, ct);
    [HttpPost("drafts")] public Task<DraftDto> Draft(Guid jobId, CreateDraftRequest req, CancellationToken ct) => fixproof.CreateDraftAsync(MechanicId, jobId, req, ct);
    [HttpPut("drafts/{draftId:guid}")] public Task<DraftDto> Update(Guid jobId, Guid draftId, UpdateDraftRequest req, CancellationToken ct) => fixproof.UpdateDraftAsync(MechanicId, draftId, req, ct);
    [HttpPost("drafts/{draftId:guid}/confirm")] public Task<DraftDto> Confirm(Guid jobId, Guid draftId, CancellationToken ct) => fixproof.ConfirmAsync(MechanicId, draftId, ct);
    [HttpDelete("drafts/{draftId:guid}")] public async Task<IActionResult> Discard(Guid jobId, Guid draftId, CancellationToken ct) { await fixproof.DiscardAsync(MechanicId, draftId, ct); return NoContent(); }
}

[Route("api/v1/mechanic/sos")]
public sealed class SosAlertsController(MechanicJobService jobs) : MechanicControllerBase
{
    [HttpGet] public Task<IReadOnlyList<SosDto>> Mine(CancellationToken ct) => jobs.SosAlertsAsync(MechanicId, ct);
    /// <summary>OnSite / Resolved for SOS requests the manager dispatched to you.</summary>
    [HttpPost("{id:guid}/status")] public Task<SosDto> Status(Guid id, SosStatusBody req, CancellationToken ct) => jobs.SosStatusAsync(MechanicId, id, req.Status, req.Note, ct);
}
