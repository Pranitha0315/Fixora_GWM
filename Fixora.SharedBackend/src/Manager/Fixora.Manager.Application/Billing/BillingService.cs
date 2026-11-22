using Fixora.Customer.Contracts;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Billing;

public sealed record RecordPaymentRequest(string Method, string? Reference);

/// <summary>Invoice from the booked service plus released (customer-approved) items, with the loyalty discount line.</summary>
public sealed class BillingService(IManagerDb db, ICustomerDirectory customers, INotificationService notifier, IClock clock)
{
    public async Task<InvoiceDto> CreateInvoiceForJobAsync(Guid jobId, CancellationToken ct = default)
    {
        var existing = await db.Invoices.Include(i => i.Lines).FirstOrDefaultAsync(i => i.JobCardId == jobId, ct);
        if (existing is not null) return WorkshopReadModel.Invoice(existing);

        var job = await db.JobCards.FirstAsync(j => j.Id == jobId, ct);
        var workshop = await db.Workshops.AsNoTracking().FirstAsync(ct);
        var now = clock.UtcNow;
        var invoice = new Invoice { JobCardId = job.Id, CustomerId = job.CustomerId, IssuedAt = now, Number = await JobNumbers.NextInvoiceNumberAsync(db, now, ct) };

        if (job.AppointmentId is { } apptId)
        {
            var appt = await db.Appointments.AsNoTracking().FirstOrDefaultAsync(a => a.Id == apptId, ct);
            var service = appt is null ? null : await db.Services.AsNoTracking().FirstOrDefaultAsync(s => s.Id == appt.ServiceId, ct);
            if (service is not null)
                invoice.Lines.Add(new InvoiceLine { InvoiceId = invoice.Id, Description = service.Name, Qty = 1, UnitPrice = service.BasePrice, Amount = service.BasePrice });
        }
        var released = await db.RepairItems.AsNoTracking().Where(i => i.JobCardId == job.Id && i.Status == RepairItemStatus.Released).ToListAsync(ct);
        foreach (var i in released)
            invoice.Lines.Add(new InvoiceLine { InvoiceId = invoice.Id, Description = i.Title, Qty = i.Qty, UnitPrice = i.UnitPrice, Amount = i.Amount });

        invoice.Subtotal = invoice.Lines.Sum(l => l.Amount);
        if (workshop.LoyaltyEnabled && job.CustomerId != Guid.Empty && invoice.Subtotal > 0)
        {
            var redemption = await customers.RedeemForInvoiceAsync(job.CustomerId, invoice.Subtotal, workshop.LoyaltyPercent, workshop.LoyaltyCapRupees, invoice.Number, ct);
            invoice.LoyaltyDiscount = redemption.DiscountRupees;
        }
        invoice.Tax = Math.Round((invoice.Subtotal - invoice.LoyaltyDiscount) * workshop.VatRate, 2);
        invoice.Total = invoice.Subtotal - invoice.LoyaltyDiscount + invoice.Tax;
        db.Invoices.Add(invoice);
        await db.SaveChangesAsync(ct);

        if (job.CustomerId != Guid.Empty)
            await notifier.NotifyAsync(new NotificationMessage(NotificationTypes.InvoiceIssued, "Invoice ready",
                    $"{invoice.Number} · Rs {invoice.Total:N0}" + (invoice.LoyaltyDiscount > 0 ? $" (loyalty discount Rs {invoice.LoyaltyDiscount:N0})" : ""),
                    "invoice", invoice.Id, job.Id), new[] { Recipient.User(Roles.Customer, job.CustomerId) }, ct);
        return WorkshopReadModel.Invoice(invoice);
    }

    public async Task<InvoiceDto> RecordPaymentAsync(Guid staffId, Guid invoiceId, RecordPaymentRequest req, CancellationToken ct = default)
    {
        var invoice = await db.Invoices.Include(i => i.Lines).FirstOrDefaultAsync(i => i.Id == invoiceId, ct) ?? throw new NotFoundException("Invoice");
        invoice.RecordPayment(req.Method, req.Reference, staffId, clock.UtcNow);
        var job = await db.JobCards.FirstAsync(j => j.Id == invoice.JobCardId, ct);
        if (job.Status == JobStatus.Completed) job.Status = JobStatus.Closed;
        await db.SaveChangesAsync(ct);

        if (invoice.CustomerId != Guid.Empty)
        {
            await customers.AwardSpendPointsAsync(invoice.CustomerId, invoice.Total, invoice.Number, ct);
            await notifier.NotifyAsync(new NotificationMessage(NotificationTypes.PaymentRecorded, "Payment received",
                $"{invoice.Number}: Rs {invoice.Total:N0} by {(req.Method == "Cash" ? "cash" : "bank transfer")}. Thank you!", "invoice", invoice.Id, job.Id),
                new[] { Recipient.User(Roles.Customer, invoice.CustomerId) }, ct);
        }
        await notifier.PublishAsync(RealtimeEvents.JobUpdated, new { jobId = job.Id, status = job.Status.ToString() }, new[] { RealtimeGroups.Staff }, ct);
        return WorkshopReadModel.Invoice(invoice);
    }

    public async Task<IReadOnlyList<InvoiceDto>> ListAsync(Guid? customerId, string? status, CancellationToken ct = default)
    {
        var q = db.Invoices.Include(i => i.Lines).AsNoTracking();
        if (customerId is { } c) q = q.Where(i => i.CustomerId == c);
        if (Enum.TryParse<InvoiceStatus>(status, true, out var s)) q = q.Where(i => i.Status == s);
        return (await q.OrderByDescending(i => i.IssuedAt).Take(200).ToListAsync(ct)).Select(WorkshopReadModel.Invoice).ToList();
    }
}
