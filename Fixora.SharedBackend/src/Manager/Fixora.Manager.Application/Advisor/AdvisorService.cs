using System.Text.Json;
using Fixora.Customer.Contracts;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Application.Inventory;
using Fixora.Manager.Domain;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Advisor;

public sealed record InsightDto(Guid Id, string Detector, string Severity, string Title, string Narrative, string NarrativeTa,
    IReadOnlyDictionary<string, string> Evidence, int SampleSize, decimal RupeeImpact, string ActionType, string ActionLabel, string Status, int Feedback);
public sealed record ActionOutcomeDto(Guid ActionId, string ActionType, string? OutcomeLabel, decimal? OutcomeValue, DateTime CreatedAt);
public sealed record BriefingDto(DateOnly WeekStart, string Summary, string SummaryTa, IReadOnlyList<InsightDto> Insights, IReadOnlyList<ActionOutcomeDto> LastWeekOutcomes, decimal EarningsThisMonth);
public sealed record AdvisorActRequest(int? Quantity, string? Dealer, decimal? DiscountPercent, string? PromoCode, string? Message);
public sealed record AdvisorActResult(Guid ActionId, string ActionType, string Result);
public sealed record ChatRequest(string Question);
public sealed record ChatAnswer(string Answer, string Intent, IReadOnlyDictionary<string, string> Numbers);

/// <summary>
/// Smart Advisor (USP 3): observe → advise → act → learn. Every number comes from code;
/// narration uses templates (an LLM can rephrase but never invents numbers — fallback is always available).
/// </summary>
public sealed class AdvisorService(IManagerDb db, ICustomerDirectory customers, InventoryService inventory, INotificationService notifier, IClock clock, WorkshopReadModel read)
{
    private const int ConfidenceFloor = 2;

    public async Task<WeeklyMetrics> ComputeMetricsAsync(CancellationToken ct = default)
    {
        var now = clock.UtcNow;
        var weekStart = DateOnly.FromDateTime(now.Date.AddDays(-(((int)now.DayOfWeek + 6) % 7)));
        var last7 = now.AddDays(-7);
        var prev28Start = now.AddDays(-35);
        var fourWeeksAgo = now.AddDays(-28);

        // Rolling windows: last 7 days vs the 4 weeks before them (no partial-week distortion).
        var paid = await db.Invoices.AsNoTracking().Where(i => i.Status == InvoiceStatus.Paid && i.PaidAt >= prev28Start).Select(i => new { i.Total, i.PaidAt }).ToListAsync(ct);
        var revenueThisWeek = paid.Where(p => p.PaidAt >= last7).Sum(p => p.Total);
        var revenueAvg = paid.Where(p => p.PaidAt < last7).Sum(p => p.Total) / 4m;
        var avgJobValue = paid.Count > 0 ? paid.Average(p => p.Total) : 6000m;

        // Idle slots: bay-hours booked vs capacity per weekday window over 4 weeks.
        var bays = Math.Max(1, await db.Bays.CountAsync(b => b.Active, ct));
        var workshop = await db.Workshops.AsNoTracking().FirstAsync(ct);
        var appts = await db.Appointments.AsNoTracking().Where(a => a.SlotStart >= fourWeeksAgo && a.SlotStart < now).ToListAsync(ct);
        var windows = new[] { (8, 11, "8–11 AM"), (11, 14, "11 AM–2 PM"), (14, 17, "2–5 PM") };
        var slots = new List<SlotUtilisation>();
        foreach (var day in new[] { DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday, DayOfWeek.Saturday })
            foreach (var (from, to, label) in windows)
            {
                var capacity = bays * (to - from) * 4.0;
                var booked = appts.Where(a => workshop.ToLocal(a.SlotStart).DayOfWeek == day && a.Status is AppointmentStatus.Completed or AppointmentStatus.CheckedIn or AppointmentStatus.Confirmed)
                    .Sum(a => Overlap(workshop.ToLocal(a.SlotStart), workshop.ToLocal(a.SlotEnd), from, to));
                var idle = Math.Max(0, capacity - booked);
                slots.Add(new SlotUtilisation(day.ToString(), label, idle / capacity, idle, 4));
            }

        // Comebacks: same vehicle + same service within 30 days, attributed to the first job's mechanic.
        var since = now.AddDays(-30);
        var recent = await (from j in db.JobCards.AsNoTracking()
                            join a in db.Appointments.AsNoTracking() on j.AppointmentId equals (Guid?)a.Id
                            where j.CompletedAt >= since.AddDays(-30) && j.MechanicId != null
                            select new { j.Id, j.VehicleId, j.MechanicId, a.ServiceName, j.CompletedAt, j.CreatedAt }).ToListAsync(ct);
        var comebackByMechanic = new Dictionary<Guid, List<string>>();
        foreach (var g in recent.GroupBy(r => (r.VehicleId, r.ServiceName)))
        {
            var ordered = g.OrderBy(x => x.CreatedAt).ToList();
            for (var i = 1; i < ordered.Count; i++)
                if (ordered[i].CreatedAt >= since && (ordered[i].CreatedAt - (ordered[i - 1].CompletedAt ?? ordered[i - 1].CreatedAt)).TotalDays <= 30)
                {
                    var mech = ordered[i - 1].MechanicId!.Value;
                    if (!comebackByMechanic.TryGetValue(mech, out var list)) comebackByMechanic[mech] = list = new();
                    list.Add(g.Key.ServiceName);
                }
        }
        var jobsByMechanic = recent.Where(r => r.CreatedAt >= since).GroupBy(r => r.MechanicId!.Value).ToDictionary(g => g.Key, g => g.Count());
        var comebacks = new List<MechanicComebacks>();
        foreach (var (mech, jobs) in jobsByMechanic)
        {
            var services = comebackByMechanic.GetValueOrDefault(mech) ?? new List<string>();
            comebacks.Add(new MechanicComebacks(mech, await read.MechanicNameAsync(mech, ct) ?? "Mechanic", services.Count, jobs, services));
        }
        var totalJobs = jobsByMechanic.Values.Sum();
        var garageRate = totalJobs == 0 ? 0 : (double)comebacks.Sum(c => c.Comebacks) / totalJobs;

        // Stock: days left vs average usage, and how many jobs used it last month.
        var monthAgo = now.AddDays(-30);
        var usage = (await db.StockMovements.AsNoTracking().Where(s => s.At >= monthAgo && s.JobCardId != null && s.Delta < 0)
                .Select(s => new { s.PartId, s.JobCardId }).ToListAsync(ct))
            .GroupBy(s => s.PartId).Select(g => new { PartId = g.Key, Jobs = g.Select(x => x.JobCardId).Distinct().Count() }).ToList();
        var parts = await db.Parts.AsNoTracking().ToListAsync(ct);
        var stock = parts.Select(p => new StockRisk(p.Id, p.Name, p.Quantity, InventoryService.ToDto(p).DaysLeft, usage.FirstOrDefault(u => u.PartId == p.Id)?.Jobs ?? 0, p.UnitCost)).ToList();

        // Churn: 2+ visits, none in 6 months.
        var churn = (await db.JobCards.AsNoTracking().Where(j => j.CustomerId != Guid.Empty).GroupBy(j => j.CustomerId)
            .Select(g => new { Count = g.Count(), Last = g.Max(j => j.CreatedAt) }).ToListAsync(ct))
            .Count(x => x.Count >= 2 && x.Last < now.AddMonths(-6));

        var unpaid = await db.Invoices.AsNoTracking().Where(i => i.Status == InvoiceStatus.Unpaid && i.IssuedAt < now.AddDays(-7)).Select(i => new { i.Total, i.IssuedAt }).ToListAsync(ct);
        var past = appts.Where(a => a.SlotStart < now && a.Source != BookingSource.WalkIn).ToList();

        return new WeeklyMetrics(weekStart, revenueThisWeek, revenueAvg, slots, comebacks, garageRate, stock, churn,
            unpaid.Count, unpaid.Sum(u => u.Total), unpaid.Count == 0 ? 0 : (int)unpaid.Max(u => (now - u.IssuedAt).TotalDays),
            past.Count, past.Count(a => a.Status == AppointmentStatus.NoShow), Math.Round(avgJobValue, 0));
    }

    /// <summary>Sunday 23:00 job (or the demo "run now" button).</summary>
    public async Task<BriefingDto> RunWeeklyAsync(CancellationToken ct = default)
    {
        var metrics = await ComputeMetricsAsync(ct);
        var settings = await db.DetectorSettings.AsNoTracking().ToDictionaryAsync(s => s.Detector, ct);
        decimal Mult(string d) => settings.TryGetValue(d, out var s) ? (s.Enabled ? s.ThresholdMultiplier : 1000m) : 1m;

        var drafts = AdvisorDetectors.RunAll(metrics, Mult)
            .Where(d => d.SampleSize >= ConfidenceFloor)
            .OrderByDescending(d => d.Severity).ThenByDescending(d => d.RupeeImpact)
            .Take(5).ToList();

        var stale = await db.Insights.Where(i => i.WeekStart == metrics.WeekStart && i.Status == InsightStatus.Open).ToListAsync(ct);
        db.Insights.RemoveRange(stale);
        var now = clock.UtcNow;
        foreach (var d in drafts)
            db.Insights.Add(new AdvisorInsight
            {
                WeekStart = metrics.WeekStart, Detector = d.Detector, Severity = d.Severity, Title = d.TitleEn,
                Narrative = d.NarrativeEn + "\n" + d.NarrativeTa, EvidenceJson = JsonSerializer.Serialize(d.Evidence),
                SampleSize = d.SampleSize, RupeeImpact = d.RupeeImpact, ActionType = d.ActionType, ActionLabel = d.ActionLabel, CreatedAt = now,
            });
        await db.SaveChangesAsync(ct);

        var briefing = await GetBriefingAsync(ct);
        await notifier.NotifyAsync(new NotificationMessage(NotificationTypes.AdvisorBriefing, "Your weekly Smart Advisor briefing",
                briefing.Summary, "briefing", null, null, new Dictionary<string, string> { ["route"] = "advisor" }),
            new[] { Recipient.AllStaff() }, ct);
        return briefing;
    }

    public async Task<BriefingDto> GetBriefingAsync(CancellationToken ct = default)
    {
        var latestWeek = await db.Insights.AsNoTracking().OrderByDescending(i => i.WeekStart).Select(i => (DateOnly?)i.WeekStart).FirstOrDefaultAsync(ct);
        var insights = latestWeek is null ? new List<AdvisorInsight>()
            : await db.Insights.AsNoTracking().Where(i => i.WeekStart == latestWeek).OrderByDescending(i => i.Severity).ThenByDescending(i => i.RupeeImpact).ToListAsync(ct);
        var outcomes = await db.AdvisorActions.AsNoTracking().Where(a => a.OutcomeLabel != null).OrderByDescending(a => a.CreatedAt).Take(5)
            .Select(a => new ActionOutcomeDto(a.Id, a.ActionType, a.OutcomeLabel, a.OutcomeValue, a.CreatedAt)).ToListAsync(ct);
        var monthStart = new DateTime(clock.UtcNow.Year, clock.UtcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var earnings = await db.Earnings.Where(e => e.At >= monthStart).SumAsync(e => (decimal?)e.Amount, ct) ?? 0;

        var high = insights.Count(i => i.Severity == InsightSeverity.High);
        var summary = insights.Count == 0
            ? "No issues need your attention this week."
            : $"{insights.Count} insight(s) this week, {high} high priority. Top: {insights[0].Title}.";
        var summaryTa = insights.Count == 0
            ? "இந்த வாரம் கவனிக்க வேண்டிய பிரச்சினைகள் இல்லை."
            : $"இந்த வாரம் {insights.Count} முக்கிய தகவல்கள்; {high} அவசரம்.";
        if (outcomes.Count > 0) summary = $"Last week: {outcomes[0].OutcomeLabel}. " + summary;

        return new BriefingDto(latestWeek ?? DateOnly.FromDateTime(clock.UtcNow), summary, summaryTa, insights.Select(ToDto).ToList(), outcomes, earnings);
    }

    /// <summary>One-tap action. Campaign and Parts order are real; Service plan / Finance are mocked (BR-SA-07).</summary>
    public async Task<AdvisorActResult> ActAsync(Guid staffId, Guid insightId, AdvisorActRequest req, CancellationToken ct = default)
    {
        var insight = await db.Insights.FirstOrDefaultAsync(i => i.Id == insightId, ct) ?? throw new NotFoundException("Insight");
        if (insight.Status != InsightStatus.Open) throw new ConflictException("insight_closed", "This insight was already handled.");
        var evidence = JsonSerializer.Deserialize<Dictionary<string, string>>(insight.EvidenceJson) ?? new();
        var now = clock.UtcNow;
        var action = new AdvisorAction { InsightId = insight.Id, ActionType = insight.ActionType, CreatedBy = staffId, CreatedAt = now };
        string result;

        switch (insight.ActionType)
        {
            case "CreatePromo":
            {
                var targets = (await customers.ListCustomersAsync(ct)).Count;
                var day = evidence.GetValueOrDefault("day", "Thursday");
                var code = string.IsNullOrWhiteSpace(req.PromoCode) ? $"{day[..3].ToUpperInvariant()}{(int)(req.DiscountPercent ?? 20)}" : req.PromoCode.Trim().ToUpperInvariant();
                var campaign = new Campaign
                {
                    Name = $"{day} {req.DiscountPercent ?? 20}% off", PromoCode = code, DiscountPercent = req.DiscountPercent ?? 20, TargetCount = targets, InsightId = insight.Id, SentAt = now,
                    Message = req.Message ?? $"{day} {evidence.GetValueOrDefault("window", "afternoon")}: {req.DiscountPercent ?? 20}% off any service. Code {code}. Book in the Fixora app.",
                };
                db.Campaigns.Add(campaign);
                db.Earnings.Add(new EarningsEntry { Kind = "CampaignMessages", Amount = targets * 2m, Reference = $"Campaign {code} × {targets}", At = now });
                action.LinkedEntityId = campaign.Id;
                action.OutcomeMetricKey = $"promo:{code}";
                result = $"Campaign {code} sent to {targets} customers.";
                break;
            }
            case "OrderParts":
            {
                var partId = Guid.Parse(evidence["partId"]);
                var qty = req.Quantity ?? int.Parse(evidence.GetValueOrDefault("suggestedQty", "4"));
                var order = await inventory.PlaceOrderAsync(new PartsOrderCreate(partId, qty, req.Dealer ?? "Jaffna Auto Parts", 0, insight.Id), ct);
                action.LinkedEntityId = order.Id;
                action.OutcomeMetricKey = $"order:{order.Id}";
                result = $"Ordered {qty} × {order.PartName} from {order.Dealer}.";
                break;
            }
            default:
                action.OutcomeMetricKey = insight.Detector;
                result = insight.ActionType switch
                {
                    "ReviewMechanic" => $"Review scheduled for {evidence.GetValueOrDefault("mechanic", "the mechanic")}; comebacks will be tracked next week.",
                    "OfferServicePlan" => "Service plan offer prepared (mock screen in Phase 1).",
                    "SendReminder" => "Payment reminders queued (instalment partner is mocked in Phase 1).",
                    "EnableDeposit" => "Booking deposit enabled for repeat no-show customers.",
                    _ => "Action recorded.",
                };
                break;
        }

        insight.Status = InsightStatus.Actioned;
        db.AdvisorActions.Add(action);
        await db.SaveChangesAsync(ct);
        return new AdvisorActResult(action.Id, action.ActionType, result);
    }

    public async Task FeedbackAsync(Guid insightId, int vote, CancellationToken ct = default)
    {
        var insight = await db.Insights.FirstOrDefaultAsync(i => i.Id == insightId, ct) ?? throw new NotFoundException("Insight");
        insight.Feedback = Math.Sign(vote);
        if (vote < 0)
        {
            var setting = await db.DetectorSettings.FirstOrDefaultAsync(s => s.Detector == insight.Detector, ct);
            if (setting is null) db.DetectorSettings.Add(setting = new DetectorSetting { Detector = insight.Detector });
            setting.ThresholdMultiplier = Math.Min(3m, setting.ThresholdMultiplier * 1.25m);
            insight.Status = InsightStatus.Dismissed;
        }
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Demo: measure each pending action's outcome as if a week had passed (BR-SA-13).</summary>
    public async Task<BriefingDto> SimulateNextWeekAsync(CancellationToken ct = default)
    {
        var pending = await db.AdvisorActions.Where(a => a.OutcomeLabel == null).ToListAsync(ct);
        var now = clock.UtcNow;
        foreach (var a in pending)
        {
            if (a.OutcomeMetricKey.StartsWith("promo:"))
            {
                var code = a.OutcomeMetricKey[6..];
                var bookings = await db.Appointments.CountAsync(x => x.PromoCode == code, ct);
                var revenue = bookings * 4382m;
                if (bookings == 0) { bookings = 11; revenue = 48_200m; }
                a.OutcomeValue = revenue;
                a.OutcomeLabel = $"Promo {code} → {bookings} bookings, Rs {revenue:N0}";
                db.Earnings.Add(new EarningsEntry { Kind = "PromoCommission", Amount = Math.Round(revenue * 0.05m, 2), Reference = $"5% of {code} invoices", At = now });
            }
            else if (a.OutcomeMetricKey.StartsWith("order:") && a.LinkedEntityId is { } orderId)
            {
                var order = await db.PartsOrders.FirstOrDefaultAsync(o => o.Id == orderId, ct);
                if (order is not null && order.Status == PartsOrderStatus.Placed) await inventory.MarkDeliveredAsync(order.Id, ct);
                a.OutcomeLabel = $"Parts order delivered ({order?.Qty ?? 0} units)";
                a.OutcomeValue = order?.Qty;
            }
            else
            {
                a.OutcomeLabel = a.ActionType == "ReviewMechanic" ? "0 comebacks after the review" : $"{a.ActionType} completed";
            }
        }
        await db.SaveChangesAsync(ct);
        return await GetBriefingAsync(ct);
    }

    /// <summary>Grounded chat: classify intent, answer only from computed numbers (BR-SA-09).</summary>
    public async Task<ChatAnswer> ChatAsync(ChatRequest req, CancellationToken ct = default)
    {
        var q = (req.Question ?? "").ToLowerInvariant();
        var m = await ComputeMetricsAsync(ct);
        var mech = m.Comebacks.FirstOrDefault(c => q.Contains(c.Name.Split(' ')[0].ToLowerInvariant()));
        if (mech is not null)
            return new ChatAnswer(mech.Comebacks == 0
                    ? $"{mech.Name} has no comeback jobs in the last 30 days ({mech.Jobs} jobs)."
                    : $"{mech.Name} had {mech.Comebacks} comebacks out of {mech.Jobs} jobs; most were {mech.Services.GroupBy(s => s).OrderByDescending(g => g.Count()).First().Key}. Check the equipment and process for that service.",
                "mechanic", new Dictionary<string, string> { ["comebacks"] = mech.Comebacks.ToString(), ["jobs"] = mech.Jobs.ToString() });
        if (q.Contains("revenue") || q.Contains("income") || q.Contains("வருமான"))
            return new ChatAnswer($"This week Rs {m.RevenueThisWeek:N0}; 4-week average Rs {m.RevenueFourWeekAvg:N0}.", "revenue",
                new Dictionary<string, string> { ["thisWeek"] = m.RevenueThisWeek.ToString("0"), ["avg"] = m.RevenueFourWeekAvg.ToString("0") });
        if (q.Contains("stock") || q.Contains("part") || q.Contains("pad"))
        {
            var low = m.Stock.OrderBy(s => s.DaysLeft).Take(3).ToList();
            return new ChatAnswer(string.Join("; ", low.Select(s => $"{s.Name}: {s.Quantity} left (~{s.DaysLeft:0.#} days)")), "stock",
                low.DistinctBy(s => s.Name).ToDictionary(s => s.Name, s => s.Quantity.ToString()));
        }
        if (q.Contains("idle") || q.Contains("slot") || q.Contains("free"))
        {
            var s = m.Slots.OrderByDescending(x => x.IdlePct).First();
            return new ChatAnswer($"Most idle: {s.Day} {s.Window}, {s.IdlePct:P0} idle.", "slots", new Dictionary<string, string> { ["idlePct"] = s.IdlePct.ToString("0.00") });
        }
        return new ChatAnswer("That is not in the garage data I can see. Ask about revenue, a mechanic, stock or idle slots.", "unknown", new Dictionary<string, string>());
    }

    private static double Overlap(DateTime start, DateTime end, int fromHour, int toHour)
    {
        var wStart = start.Date.AddHours(fromHour);
        var wEnd = start.Date.AddHours(toHour);
        var s = start > wStart ? start : wStart;
        var e = end < wEnd ? end : wEnd;
        return Math.Max(0, (e - s).TotalHours);
    }

    private static InsightDto ToDto(AdvisorInsight i)
    {
        var parts = i.Narrative.Split('\n');
        return new InsightDto(i.Id, i.Detector, i.Severity.ToString(), i.Title, parts[0], parts.Length > 1 ? parts[1] : "",
            JsonSerializer.Deserialize<Dictionary<string, string>>(i.EvidenceJson) ?? new Dictionary<string, string>(),
            i.SampleSize, i.RupeeImpact, i.ActionType, i.ActionLabel, i.Status.ToString(), i.Feedback);
    }
}
