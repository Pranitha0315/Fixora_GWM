using System.Net;
using System.Net.Http.Json;
using Fixora.Manager.Application.Advisor;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("advisor-briefing-http", DisableParallelization = true)]
public sealed class AdvisorBriefingHttpCollection;

/// <summary>
/// FX13-D12-NID-1 (+ light D12-NID-2 chat) tests-only: metrics, weekly run → briefing,
/// insight act/feedback, grounded chat. Does not edit THA AdvisorService/Detectors production.
/// </summary>
[Collection("advisor-briefing-http")]
public sealed class AdvisorBriefingHttpTests
{
    private const string Base = "/api/v1/manager/advisor";
    private static readonly string[] KnownDetectors =
    {
        "IdleSlot", "ComebackSpike", "StockOut", "RevenueDrop", "ChurnRisk", "UnpaidInvoice", "NoShow"
    };

    private static FixoraFactory NewFactory() => new();

    [Fact]
    public async Task Metrics_returns_week_slots_and_seeded_stock_risk()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        var response = await manager.GetAsync($"{Base}/metrics");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var metrics = (await response.Content.ReadFromJsonAsync<WeeklyMetrics>())!;

        Assert.True(metrics.WeekStart != default);
        Assert.NotEmpty(metrics.Slots);
        Assert.Contains(metrics.Stock, s => s.PartId == DemoIds.PartBrakePads && s.Quantity == 2);
        Assert.True(metrics.AverageJobValue > 0);
    }

    [Fact]
    public async Task Run_weekly_produces_briefing_with_known_detectors()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        var run = await manager.PostAsync($"{Base}/run", null);
        Assert.Equal(HttpStatusCode.OK, run.StatusCode);
        var briefing = (await run.Content.ReadFromJsonAsync<BriefingDto>())!;

        Assert.False(string.IsNullOrWhiteSpace(briefing.Summary));
        Assert.False(string.IsNullOrWhiteSpace(briefing.SummaryTa));
        Assert.NotEmpty(briefing.Insights);
        Assert.True(briefing.Insights.Count <= 5);
        Assert.All(briefing.Insights, i =>
        {
            Assert.Contains(i.Detector, KnownDetectors);
            Assert.Equal("Open", i.Status);
            Assert.False(string.IsNullOrWhiteSpace(i.Title));
            Assert.False(string.IsNullOrWhiteSpace(i.ActionType));
            Assert.True(i.SampleSize >= 2);
        });

        var get = await manager.GetFromJsonAsync<BriefingDto>($"{Base}/briefing");
        Assert.Equal(briefing.WeekStart, get!.WeekStart);
        Assert.Equal(briefing.Insights.Count, get.Insights.Count);
    }

    [Fact]
    public async Task Act_on_open_insight_then_blocks_second_act()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();
        var briefing = (await (await manager.PostAsync($"{Base}/run", null))
            .EnsureSuccessStatusCode()
            .Content.ReadFromJsonAsync<BriefingDto>())!;

        var insight = briefing.Insights.FirstOrDefault(i => i.ActionType is "OrderParts" or "CreatePromo")
            ?? briefing.Insights[0];

        var act = await manager.PostAsJsonAsync(
            $"{Base}/insights/{insight.Id}/act",
            new AdvisorActRequest(Quantity: 6, Dealer: "Jaffna Auto Parts", DiscountPercent: 15, PromoCode: null, Message: null));
        Assert.Equal(HttpStatusCode.OK, act.StatusCode);
        var result = (await act.Content.ReadFromJsonAsync<AdvisorActResult>())!;
        Assert.Equal(insight.ActionType, result.ActionType);
        Assert.False(string.IsNullOrWhiteSpace(result.Result));
        Assert.NotEqual(Guid.Empty, result.ActionId);

        var after = (await manager.GetFromJsonAsync<BriefingDto>($"{Base}/briefing"))!;
        Assert.Equal("Actioned", after.Insights.Single(i => i.Id == insight.Id).Status);

        var again = await manager.PostAsJsonAsync(
            $"{Base}/insights/{insight.Id}/act",
            new AdvisorActRequest(null, null, null, null, null));
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        var error = (await again.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("insight_closed", error.Code);
    }

    [Fact]
    public async Task Negative_feedback_dismisses_insight()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();
        var briefing = (await (await manager.PostAsync($"{Base}/run", null))
            .EnsureSuccessStatusCode()
            .Content.ReadFromJsonAsync<BriefingDto>())!;
        var insight = briefing.Insights[0];

        var feedback = await manager.PostAsJsonAsync(
            $"{Base}/insights/{insight.Id}/feedback",
            new { vote = -1 });
        Assert.Equal(HttpStatusCode.NoContent, feedback.StatusCode);

        var after = (await manager.GetFromJsonAsync<BriefingDto>($"{Base}/briefing"))!;
        var updated = after.Insights.Single(i => i.Id == insight.Id);
        Assert.Equal(-1, updated.Feedback);
        Assert.Equal("Dismissed", updated.Status);
    }

    [Fact]
    public async Task Chat_answers_revenue_stock_and_unknown_grounded()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        var revenue = await manager.PostAsJsonAsync($"{Base}/chat", new ChatRequest("What is this week revenue?"));
        Assert.Equal(HttpStatusCode.OK, revenue.StatusCode);
        var revenueAnswer = (await revenue.Content.ReadFromJsonAsync<ChatAnswer>())!;
        Assert.Equal("revenue", revenueAnswer.Intent);
        Assert.Contains("This week Rs", revenueAnswer.Answer);
        Assert.True(revenueAnswer.Numbers.ContainsKey("thisWeek"));

        var stock = await manager.PostAsJsonAsync($"{Base}/chat", new ChatRequest("stock pads"));
        Assert.Equal(HttpStatusCode.OK, stock.StatusCode);
        var stockAnswer = (await stock.Content.ReadFromJsonAsync<ChatAnswer>())!;
        Assert.Equal("stock", stockAnswer.Intent);
        Assert.Contains("brake", stockAnswer.Answer, StringComparison.OrdinalIgnoreCase);

        var unknown = await manager.PostAsJsonAsync($"{Base}/chat", new ChatRequest("tell me a joke"));
        Assert.Equal(HttpStatusCode.OK, unknown.StatusCode);
        var unknownAnswer = (await unknown.Content.ReadFromJsonAsync<ChatAnswer>())!;
        Assert.Equal("unknown", unknownAnswer.Intent);
    }

    [Fact]
    public async Task Simulate_next_week_after_order_action_fills_outcomes()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();
        var briefing = (await (await manager.PostAsync($"{Base}/run", null))
            .EnsureSuccessStatusCode()
            .Content.ReadFromJsonAsync<BriefingDto>())!;

        var insight = briefing.Insights.FirstOrDefault(i => i.ActionType == "OrderParts")
            ?? briefing.Insights.FirstOrDefault(i => i.ActionType == "CreatePromo")
            ?? briefing.Insights[0];

        (await manager.PostAsJsonAsync(
                $"{Base}/insights/{insight.Id}/act",
                new AdvisorActRequest(8, "Jaffna Auto Parts", 20, null, null)))
            .EnsureSuccessStatusCode();

        var simulate = await manager.PostAsync($"{Base}/simulate-next-week", null);
        Assert.Equal(HttpStatusCode.OK, simulate.StatusCode);
        var next = (await simulate.Content.ReadFromJsonAsync<BriefingDto>())!;
        Assert.NotEmpty(next.LastWeekOutcomes);
        Assert.Contains(next.LastWeekOutcomes, o => !string.IsNullOrWhiteSpace(o.OutcomeLabel));
    }

    [Fact]
    public async Task Anonymous_metrics_returns_unauthorized()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();

        var response = await client.GetAsync($"{Base}/metrics");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Customer_cannot_run_advisor()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();

        var response = await kavitha.PostAsync($"{Base}/run", null);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
