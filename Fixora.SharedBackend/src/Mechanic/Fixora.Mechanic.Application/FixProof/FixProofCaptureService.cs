using Fixora.Manager.Contracts;
using Fixora.Mechanic.Application.Common;
using Fixora.Mechanic.Domain;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Mechanic.Application.FixProof;

public sealed record MediaUploadResult(Guid Id, string MediaRef, string PreviewUrl, string Phase, DateTime CapturedAt);
public sealed record CreateDraftRequest(string Component, string? Transcript, string Language, string Severity, IReadOnlyList<string>? MediaRefs);
public sealed record UpdateDraftRequest(string Component, string FindingEn, string FindingTa, string RecommendationEn, string RecommendationTa, string Severity);
public sealed record DraftDto(Guid Id, Guid JobCardId, string Component, string Transcript, string Language, string Severity, string FindingEn, string FindingTa,
    string RecommendationEn, string RecommendationTa, IReadOnlyList<string> MediaUrls, IReadOnlyList<string> MediaRefs, string Source, string Status, bool Verified, Guid? PublishedIssueId);

/// <summary>
/// FixProof capture (USP 1) on the mechanic side: photo/video + voice → AI draft (unverified) →
/// mechanic edits and confirms → verified issue published to the manager-owned job card.
/// </summary>
public sealed class FixProofCaptureService(
    IMechanicDb db,
    IWorkshopJobGateway jobs,
    IInspectionDrafter drafter,
    ISpeechToText stt,
    IMediaStorage media,
    IClock clock)
{
    public async Task<MediaUploadResult> UploadMediaAsync(Guid mechanicId, Guid jobId, Stream content, string contentType, string fileName, string phase, string? caption, CancellationToken ct = default)
    {
        await EnsureAssignedAsync(mechanicId, jobId, ct);
        Guard.Against(!(contentType.StartsWith("image/") || contentType.StartsWith("video/") || contentType.StartsWith("audio/")), "Only photos, videos and voice notes can be uploaded.");
        var stored = await media.SaveAsync(content, contentType, fileName, ct);
        var record = new CaptureMedia
        {
            JobCardId = jobId,
            MechanicId = mechanicId,
            MediaRef = stored.MediaRef,
            ContentType = stored.ContentType,
            Size = stored.Size,
            Phase = Enum.TryParse<MediaPhase>(phase, true, out var p) ? p : MediaPhase.Before,
            Caption = caption,
            CapturedAt = clock.UtcNow,
        };
        db.Media.Add(record);
        await db.SaveChangesAsync(ct);
        return new MediaUploadResult(record.Id, record.MediaRef, media.GetSignedUrl(record.MediaRef, TimeSpan.FromMinutes(15)), record.Phase.ToString(), record.CapturedAt);
    }

    public async Task<IReadOnlyList<MediaUploadResult>> ListMediaAsync(Guid mechanicId, Guid jobId, CancellationToken ct = default)
    {
        await EnsureAssignedAsync(mechanicId, jobId, ct);
        var rows = await db.Media.AsNoTracking().Where(m => m.JobCardId == jobId).OrderByDescending(m => m.CapturedAt).ToListAsync(ct);
        return rows.Select(r => new MediaUploadResult(r.Id, r.MediaRef, media.GetSignedUrl(r.MediaRef, TimeSpan.FromMinutes(15)), r.Phase.ToString(), r.CapturedAt)).ToList();
    }

    /// <summary>Transcribe a voice note (server STT) — returns null when no STT provider is configured.</summary>
    public Task<string?> TranscribeAsync(Stream audio, string contentType, string language, CancellationToken ct = default)
        => stt.TranscribeAsync(audio, contentType, language, ct);

    public async Task<DraftDto> CreateDraftAsync(Guid mechanicId, Guid jobId, CreateDraftRequest req, CancellationToken ct = default)
    {
        await EnsureAssignedAsync(mechanicId, jobId, ct);
        Guard.Against(string.IsNullOrWhiteSpace(req.Component), "Pick the component you inspected.");
        var transcript = req.Transcript?.Trim() ?? "";
        DraftOutput output;
        if (string.IsNullOrWhiteSpace(transcript))
            output = new DraftOutput("", "", "", "", req.Severity, "manual"); // manual entry path (BR-FP-13)
        else
            output = await drafter.DraftAsync(new DraftInput(req.Component.Trim(), transcript, req.Language, req.Severity), ct);

        var draft = new InspectionDraft
        {
            JobCardId = jobId,
            MechanicId = mechanicId,
            Component = req.Component.Trim(),
            Transcript = transcript,
            Language = req.Language,
            Severity = output.Severity,
            FindingEn = output.FindingEn,
            FindingTa = output.FindingTa,
            RecommendationEn = output.RecommendationEn,
            RecommendationTa = output.RecommendationTa,
            Source = output.Source,
            MediaRefsCsv = string.Join(',', req.MediaRefs ?? Array.Empty<string>()),
            CreatedAt = clock.UtcNow,
        };
        db.Drafts.Add(draft);
        await db.SaveChangesAsync(ct);
        return ToDto(draft);
    }

    public async Task<DraftDto> UpdateDraftAsync(Guid mechanicId, Guid draftId, UpdateDraftRequest req, CancellationToken ct = default)
    {
        var d = await OwnDraftAsync(mechanicId, draftId, ct);
        if (d.Status != DraftStatus.Draft) throw new ConflictException("draft_closed", "This finding is already confirmed.");
        d.Component = req.Component; d.FindingEn = req.FindingEn; d.FindingTa = req.FindingTa;
        d.RecommendationEn = req.RecommendationEn; d.RecommendationTa = req.RecommendationTa; d.Severity = req.Severity;
        if (d.Source != "manual") d.Source += "+edited";
        await db.SaveChangesAsync(ct);
        return ToDto(d);
    }

    /// <summary>The mechanic owns the diagnosis: only confirmed findings leave the mechanic schema.</summary>
    public async Task<DraftDto> ConfirmAsync(Guid mechanicId, Guid draftId, CancellationToken ct = default)
    {
        var d = await OwnDraftAsync(mechanicId, draftId, ct);
        if (d.Status != DraftStatus.Draft) throw new ConflictException("draft_closed", "This finding is already confirmed.");
        Guard.Against(string.IsNullOrWhiteSpace(d.FindingEn), "Write the finding (English) before confirming.");
        var issue = await jobs.PublishVerifiedIssueAsync(mechanicId, d.JobCardId, new VerifiedIssueInput(
            d.Component, d.FindingEn, d.FindingTa, d.RecommendationEn, d.RecommendationTa, d.Severity,
            d.MediaRefsCsv.Split(',', StringSplitOptions.RemoveEmptyEntries)), ct);
        d.Status = DraftStatus.Confirmed;
        d.ConfirmedAt = clock.UtcNow;
        d.PublishedIssueId = issue.Id;
        await db.SaveChangesAsync(ct);
        return ToDto(d);
    }

    public async Task DiscardAsync(Guid mechanicId, Guid draftId, CancellationToken ct = default)
    {
        var d = await OwnDraftAsync(mechanicId, draftId, ct);
        if (d.Status == DraftStatus.Draft) d.Status = DraftStatus.Discarded;
        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<DraftDto>> ListDraftsAsync(Guid mechanicId, Guid jobId, CancellationToken ct = default)
        => (await db.Drafts.AsNoTracking().Where(d => d.JobCardId == jobId && d.MechanicId == mechanicId && d.Status != DraftStatus.Discarded)
            .OrderBy(d => d.CreatedAt).ToListAsync(ct)).Select(ToDto).ToList();

    private async Task EnsureAssignedAsync(Guid mechanicId, Guid jobId, CancellationToken ct)
    {
        if (await jobs.GetVehicleIdForJobAsync(mechanicId, jobId, ct) is null) throw new NotFoundException("Job");
    }

    private async Task<InspectionDraft> OwnDraftAsync(Guid mechanicId, Guid draftId, CancellationToken ct)
        => await db.Drafts.FirstOrDefaultAsync(d => d.Id == draftId && d.MechanicId == mechanicId, ct) ?? throw new NotFoundException("Draft");

    private DraftDto ToDto(InspectionDraft d)
    {
        var refs = d.MediaRefsCsv.Split(',', StringSplitOptions.RemoveEmptyEntries);
        return new DraftDto(d.Id, d.JobCardId, d.Component, d.Transcript, d.Language, d.Severity, d.FindingEn, d.FindingTa, d.RecommendationEn, d.RecommendationTa,
            refs.Select(r => media.GetSignedUrl(r, TimeSpan.FromMinutes(15))).ToList(), refs, d.Source, d.Status.ToString(), d.Status == DraftStatus.Confirmed, d.PublishedIssueId);
    }
}
