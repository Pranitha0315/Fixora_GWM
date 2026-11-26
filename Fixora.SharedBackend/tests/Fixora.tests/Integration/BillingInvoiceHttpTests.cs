using System.Net;
using System.Net.Http.Json;
using Fixora.Manager.Application.Staff;
using Fixora.Manager.Contracts;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("billing-invoice-http", DisableParallelization = true)]
public sealed class BillingInvoiceHttpCollection;

/// <summary>
/// FX13-D11-NID-1 Slice 1 (tests-only): characterize job→invoice create, unpaid listing,
/// payment recording, and customer invoice visibility. Does not edit THA BillingService
/// production or Shared_Backend-divergent files. Unpaid Advisor reminder is D12 scope.
/// </summary>
[Collection("billing-invoice-http")]
public sealed class BillingInvoiceHttpTests
{
    private const string ManagerCreateUrl = "/api/v1/manager/billing/jobs/{0}/invoice";
    private const string ManagerInvoicesUrl = "/api/v1/manager/billing/invoices";
    private const string ManagerPayUrl = "/api/v1/manager/billing/invoices/{0}/payments";
    private const string CustomerInvoicesUrl = "/api/v1/customer/invoices";
    private const string DashboardUrl = "/api/v1/manager/dashboard";

    private static FixoraFactory NewFactory() => new();

    private static string CreateUrl(Guid jobId) => string.Format(ManagerCreateUrl, jobId);

    private static string PayUrl(Guid invoiceId) => string.Format(ManagerPayUrl, invoiceId);

    [Fact]
    public async Task Manager_create_invoice_for_job_returns_unpaid_with_service_line()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        var response = await manager.PostAsync(CreateUrl(DemoIds.JobKavithaToday), null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var invoice = (await response.Content.ReadFromJsonAsync<InvoiceDto>())!;

        Assert.Equal(DemoIds.JobKavithaToday, invoice.JobCardId);
        Assert.Equal(DemoIds.CustomerKavitha, invoice.CustomerId);
        Assert.Equal("Unpaid", invoice.Status);
        Assert.False(string.IsNullOrWhiteSpace(invoice.Number));
        Assert.Contains(invoice.Lines, l => l.Description.Contains("Brake", StringComparison.OrdinalIgnoreCase));
        Assert.True(invoice.Subtotal > 0);
        Assert.True(invoice.Total > 0);
        Assert.Null(invoice.PaidAt);
    }

    [Fact]
    public async Task Create_invoice_twice_is_idempotent()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        var first = (await (await manager.PostAsync(CreateUrl(DemoIds.JobKavithaToday), null))
            .EnsureSuccessStatusCode()
            .Content.ReadFromJsonAsync<InvoiceDto>())!;
        var second = (await (await manager.PostAsync(CreateUrl(DemoIds.JobKavithaToday), null))
            .EnsureSuccessStatusCode()
            .Content.ReadFromJsonAsync<InvoiceDto>())!;

        Assert.Equal(first.Id, second.Id);
        Assert.Equal(first.Number, second.Number);
        Assert.Equal(first.Total, second.Total);
    }

    [Fact]
    public async Task Unpaid_invoice_appears_in_manager_filter_customer_list_and_dashboard()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();
        var kavitha = await factory.Customer();

        var beforeDash = (await manager.GetFromJsonAsync<DashboardDto>(DashboardUrl))!;
        var invoice = (await (await manager.PostAsync(CreateUrl(DemoIds.JobKavithaToday), null))
            .EnsureSuccessStatusCode()
            .Content.ReadFromJsonAsync<InvoiceDto>())!;

        var unpaid = (await manager.GetFromJsonAsync<List<InvoiceDto>>($"{ManagerInvoicesUrl}?status=Unpaid"))!;
        Assert.Contains(unpaid, i => i.Id == invoice.Id && i.Status == "Unpaid");

        var customerList = (await kavitha.GetFromJsonAsync<List<InvoiceDto>>(CustomerInvoicesUrl))!;
        Assert.Contains(customerList, i => i.Id == invoice.Id && i.JobCardId == DemoIds.JobKavithaToday);

        var afterDash = (await manager.GetFromJsonAsync<DashboardDto>(DashboardUrl))!;
        Assert.Equal(beforeDash.UnpaidInvoices + 1, afterDash.UnpaidInvoices);
    }

    [Fact]
    public async Task Record_cash_payment_marks_paid_and_blocks_second_payment()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();
        var kavitha = await factory.Customer();

        var invoice = (await (await manager.PostAsync(CreateUrl(DemoIds.JobKavithaToday), null))
            .EnsureSuccessStatusCode()
            .Content.ReadFromJsonAsync<InvoiceDto>())!;

        var pay = await manager.PostAsJsonAsync(PayUrl(invoice.Id), new { method = "Cash", reference = (string?)null });
        Assert.Equal(HttpStatusCode.OK, pay.StatusCode);
        var paid = (await pay.Content.ReadFromJsonAsync<InvoiceDto>())!;
        Assert.Equal("Paid", paid.Status);
        Assert.Equal("Cash", paid.PaymentMethod);
        Assert.NotNull(paid.PaidAt);

        var customerList = (await kavitha.GetFromJsonAsync<List<InvoiceDto>>(CustomerInvoicesUrl))!;
        Assert.Contains(customerList, i => i.Id == invoice.Id && i.Status == "Paid");

        var unpaid = (await manager.GetFromJsonAsync<List<InvoiceDto>>($"{ManagerInvoicesUrl}?status=Unpaid"))!;
        Assert.DoesNotContain(unpaid, i => i.Id == invoice.Id);

        var again = await manager.PostAsJsonAsync(PayUrl(invoice.Id), new { method = "Cash", reference = "dup" });
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        var error = (await again.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("invoice_paid", error.Code);
    }

    [Fact]
    public async Task Invalid_payment_method_returns_validation_failed()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();
        var invoice = (await (await manager.PostAsync(CreateUrl(DemoIds.JobKavithaToday), null))
            .EnsureSuccessStatusCode()
            .Content.ReadFromJsonAsync<InvoiceDto>())!;

        var response = await manager.PostAsJsonAsync(
            PayUrl(invoice.Id),
            new { method = "Card", reference = "x" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var error = (await response.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("validation_failed", error.Code);
    }

    [Fact]
    public async Task Anonymous_create_invoice_returns_unauthorized()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();

        var response = await client.PostAsync(CreateUrl(DemoIds.JobKavithaToday), null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Customer_cannot_call_manager_billing()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();

        var response = await kavitha.PostAsync(CreateUrl(DemoIds.JobKavithaToday), null);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Mechanic_cannot_create_invoice_or_record_payment()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();
        var ravi = await factory.Mechanic();

        Assert.Equal(HttpStatusCode.Forbidden,
            (await ravi.PostAsync(CreateUrl(DemoIds.JobKavithaToday), null)).StatusCode);

        var invoice = (await (await manager.PostAsync(CreateUrl(DemoIds.JobKavithaToday), null))
            .EnsureSuccessStatusCode()
            .Content.ReadFromJsonAsync<InvoiceDto>())!;

        Assert.Equal(HttpStatusCode.Forbidden,
            (await ravi.PostAsJsonAsync(
                PayUrl(invoice.Id),
                new { method = "Cash", reference = (string?)null })).StatusCode);
    }

    [Fact]
    public async Task Other_customer_does_not_see_foreign_invoice()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();
        var arun = await factory.LoginAsync(
            "/api/v1/customer/auth/login",
            new { email = "arun@fixora.lk", password = "Fixora@123" });

        var invoice = (await (await manager.PostAsync(CreateUrl(DemoIds.JobKavithaToday), null))
            .EnsureSuccessStatusCode()
            .Content.ReadFromJsonAsync<InvoiceDto>())!;

        var arunList = (await arun.GetFromJsonAsync<List<InvoiceDto>>(CustomerInvoicesUrl))!;
        Assert.DoesNotContain(arunList, i => i.Id == invoice.Id);
    }
}
