using Fixora.Manager.Domain;

namespace Fixora.Manager.Application.Advisor;

public sealed record SlotUtilisation(string Day, string Window, double IdlePct, double IdleHours, int SampleDays);
public sealed record MechanicComebacks(Guid MechanicId, string Name, int Comebacks, int Jobs, IReadOnlyList<string> Services);
public sealed record StockRisk(Guid PartId, string Name, int Quantity, double DaysLeft, int JobsLastMonth, decimal UnitCost);

public sealed record WeeklyMetrics(
    DateOnly WeekStart,
    decimal RevenueThisWeek,
    decimal RevenueFourWeekAvg,
    IReadOnlyList<SlotUtilisation> Slots,
    IReadOnlyList<MechanicComebacks> Comebacks,
    double GarageComebackRate,
    IReadOnlyList<StockRisk> Stock,
    int ChurnRiskCustomers,
    int UnpaidInvoices,
    decimal UnpaidAmount,
    int MaxUnpaidDays,
    int AppointmentsLast4Weeks,
    int NoShowsLast4Weeks,
    decimal AverageJobValue);

public sealed record InsightDraft(
    string Detector,
    InsightSeverity Severity,
    string TitleEn,
    string NarrativeEn,
    string NarrativeTa,
    IReadOnlyDictionary<string, string> Evidence,
    int SampleSize,
    decimal RupeeImpact,
    string ActionType,
    string ActionLabel);

/// <summary>
/// Seven deterministic detectors (BRD §10). Pure functions of WeeklyMetrics → unit-testable.
/// <paramref name="m"/> multiplier per detector raises thresholds after repeated thumbs-down (BR-SA-10).
/// </summary>
public static class AdvisorDetectors
{
    public static IReadOnlyList<InsightDraft> RunAll(WeeklyMetrics m, Func<string, decimal> multiplier) =>
        new[]
        {
            IdleSlot(m, (double)multiplier("IdleSlot")),
            ComebackSpike(m, (double)multiplier("ComebackSpike")),
            StockOut(m, (double)multiplier("StockOut")),
            RevenueDrop(m, multiplier("RevenueDrop")),
            ChurnRisk(m, multiplier("ChurnRisk")),
            UnpaidInvoice(m, multiplier("UnpaidInvoice")),
            NoShow(m, (double)multiplier("NoShow")),
        }.Where(d => d is not null).Select(d => d!).ToList();

    public static InsightDraft? IdleSlot(WeeklyMetrics m, double mult = 1)
    {
        var worst = m.Slots.OrderByDescending(s => s.IdleHours).FirstOrDefault();
        if (worst is null || worst.IdlePct <= Math.Min(0.95, 0.50 * mult)) return null;
        var sev = worst.IdlePct > 0.60 ? InsightSeverity.High : InsightSeverity.Medium;
        var impact = (decimal)worst.IdleHours * m.AverageJobValue / 2m;
        var pct = (int)Math.Round(worst.IdlePct * 100);
        return new InsightDraft("IdleSlot", sev, $"{worst.Day} {worst.Window} is {pct}% idle",
            $"{worst.Day} {worst.Window} bays were {pct}% idle over the last 4 weeks ({worst.IdleHours:0} idle bay-hours). A targeted promo can fill them.",
            $"{worst.Day} {worst.Window} நேரத்தில் பே {pct}% காலியாக இருந்தது. ஒரு சலுகை அனுப்பினால் நிரப்பலாம்.",
            new Dictionary<string, string> { ["day"] = worst.Day, ["window"] = worst.Window, ["idlePct"] = pct.ToString(), ["idleHours"] = worst.IdleHours.ToString("0") },
            worst.SampleDays, Math.Round(impact, 0), "CreatePromo", "Create promo");
    }

    public static InsightDraft? ComebackSpike(WeeklyMetrics m, double mult = 1)
    {
        var avg = Math.Max(m.GarageComebackRate, 0.01);
        var worst = m.Comebacks.Where(c => c.Jobs > 0 && c.Comebacks >= 2 && (double)c.Comebacks / c.Jobs > 2 * avg * mult)
            .OrderByDescending(c => c.Comebacks).FirstOrDefault();
        if (worst is null) return null;
        var top = worst.Services.GroupBy(s => s).OrderByDescending(g => g.Count()).First().Key;
        return new InsightDraft("ComebackSpike", InsightSeverity.High, $"{worst.Name}: {worst.Comebacks} comeback jobs",
            $"{worst.Name} had {worst.Comebacks} comebacks in 30 days (garage average about {avg * worst.Jobs:0.#}). Most were {top}.",
            $"{worst.Name}-க்கு 30 நாட்களில் {worst.Comebacks} திரும்பி வந்த வேலைகள். பெரும்பாலானவை {top}.",
            new Dictionary<string, string> { ["mechanicId"] = worst.MechanicId.ToString(), ["mechanic"] = worst.Name, ["comebacks"] = worst.Comebacks.ToString(), ["topService"] = top },
            worst.Jobs, worst.Comebacks * m.AverageJobValue, "ReviewMechanic", "Review mechanic");
    }

    public static InsightDraft? StockOut(WeeklyMetrics m, double mult = 1)
    {
        var risk = m.Stock.Where(s => s.DaysLeft < 3 / mult && s.JobsLastMonth >= 2).OrderBy(s => s.DaysLeft).FirstOrDefault();
        if (risk is null) return null;
        var sev = risk.DaysLeft < 2 ? InsightSeverity.High : InsightSeverity.Medium;
        var qty = Math.Max(4, risk.JobsLastMonth * 2);
        return new InsightDraft("StockOut", sev, $"{risk.Name}: {risk.DaysLeft:0.#} days left",
            $"{risk.Name} will run out in about {risk.DaysLeft:0.#} days ({risk.Quantity} left, used in {risk.JobsLastMonth} jobs last month). Order {qty} now.",
            $"{risk.Name} இன்னும் {risk.DaysLeft:0.#} நாட்களில் தீர்ந்துவிடும். இப்போது {qty} ஆர்டர் செய்யுங்கள்.",
            new Dictionary<string, string> { ["partId"] = risk.PartId.ToString(), ["part"] = risk.Name, ["quantity"] = risk.Quantity.ToString(), ["suggestedQty"] = qty.ToString() },
            risk.JobsLastMonth, risk.JobsLastMonth * m.AverageJobValue / 4, "OrderParts", "Order parts");
    }

    public static InsightDraft? RevenueDrop(WeeklyMetrics m, decimal mult = 1)
    {
        if (m.RevenueFourWeekAvg <= 0) return null;
        var drop = (m.RevenueFourWeekAvg - m.RevenueThisWeek) / m.RevenueFourWeekAvg;
        if (drop <= 0.15m * mult) return null;
        var sev = drop > 0.25m ? InsightSeverity.High : InsightSeverity.Medium;
        var pct = (int)Math.Round(drop * 100);
        return new InsightDraft("RevenueDrop", sev, $"Revenue down {pct}%",
            $"Revenue this week Rs {m.RevenueThisWeek:N0} vs 4-week average Rs {m.RevenueFourWeekAvg:N0} ({pct}% lower).",
            $"இந்த வார வருமானம் ரூ {m.RevenueThisWeek:N0}, சராசரியை விட {pct}% குறைவு.",
            new Dictionary<string, string> { ["thisWeek"] = m.RevenueThisWeek.ToString("0"), ["avg"] = m.RevenueFourWeekAvg.ToString("0"), ["dropPct"] = pct.ToString() },
            4, m.RevenueFourWeekAvg - m.RevenueThisWeek, "ViewBreakdown", "View breakdown");
    }

    public static InsightDraft? ChurnRisk(WeeklyMetrics m, decimal mult = 1)
    {
        if (m.ChurnRiskCustomers < 10 * mult) return null;
        return new InsightDraft("ChurnRisk", InsightSeverity.Medium, $"{m.ChurnRiskCustomers} regular customers have not returned",
            $"{m.ChurnRiskCustomers} customers with 2+ visits have not come back in 6 months. Offer them a service plan.",
            $"2-க்கு மேற்பட்ட முறை வந்த {m.ChurnRiskCustomers} வாடிக்கையாளர்கள் 6 மாதமாக வரவில்லை.",
            new Dictionary<string, string> { ["customers"] = m.ChurnRiskCustomers.ToString() },
            m.ChurnRiskCustomers, m.ChurnRiskCustomers * m.AverageJobValue / 3, "OfferServicePlan", "Offer service plan");
    }

    public static InsightDraft? UnpaidInvoice(WeeklyMetrics m, decimal mult = 1)
    {
        if (!(m.UnpaidAmount > 50_000m * mult || m.UnpaidInvoices > 5 * mult)) return null;
        var sev = m.MaxUnpaidDays > 21 ? InsightSeverity.High : InsightSeverity.Medium;
        return new InsightDraft("UnpaidInvoice", sev, $"Rs {m.UnpaidAmount:N0} unpaid for over a week",
            $"{m.UnpaidInvoices} invoices (Rs {m.UnpaidAmount:N0}) are unpaid for more than 7 days; the oldest is {m.MaxUnpaidDays} days.",
            $"{m.UnpaidInvoices} பில்கள் (ரூ {m.UnpaidAmount:N0}) 7 நாட்களுக்கு மேல் செலுத்தப்படவில்லை.",
            new Dictionary<string, string> { ["invoices"] = m.UnpaidInvoices.ToString(), ["amount"] = m.UnpaidAmount.ToString("0"), ["maxDays"] = m.MaxUnpaidDays.ToString() },
            m.UnpaidInvoices, m.UnpaidAmount, "SendReminder", "Send reminder / instalments");
    }

    public static InsightDraft? NoShow(WeeklyMetrics m, double mult = 1)
    {
        if (m.AppointmentsLast4Weeks < 5) return null;
        var rate = (double)m.NoShowsLast4Weeks / m.AppointmentsLast4Weeks;
        if (rate <= 0.20 * mult) return null;
        var pct = (int)Math.Round(rate * 100);
        return new InsightDraft("NoShow", InsightSeverity.Low, $"{pct}% of bookings were no-shows",
            $"{m.NoShowsLast4Weeks} of {m.AppointmentsLast4Weeks} bookings did not arrive in 4 weeks. Consider a small booking deposit for repeat no-shows.",
            $"4 வாரங்களில் {m.AppointmentsLast4Weeks}-இல் {m.NoShowsLast4Weeks} பதிவுகள் வரவில்லை.",
            new Dictionary<string, string> { ["noShows"] = m.NoShowsLast4Weeks.ToString(), ["appointments"] = m.AppointmentsLast4Weeks.ToString() },
            m.AppointmentsLast4Weeks, m.NoShowsLast4Weeks * m.AverageJobValue / 2, "EnableDeposit", "Enable booking deposit");
    }
}
