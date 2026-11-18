using System.Security.Cryptography;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Staff;

public sealed record StaffLoginRequest(string Email, string Password);
public sealed record CreateInvitationRequest(string Name, string Phone);
public sealed record InvitationDto(Guid Id, string Name, string Phone, string Token, string Link, DateTime ExpiresAt, string Status);
public sealed record WorkshopSettingsDto(string Name, string Phone, string EmergencyPhone, string Address, string OpenTime, string CloseTime,
    int SlotMinutes, int CancelCutoffHours, int EtaShiftNotifyMinutes, bool LoyaltyEnabled, decimal LoyaltyPercent, decimal LoyaltyCapRupees);
public sealed record BayDto(Guid Id, string Name, bool Active);
public sealed record ServiceUpsert(string Name, string Category, int StandardMinutes, decimal BasePrice, bool Active);
public sealed record DashboardDto(int TodayBookings, int PendingBookings, int ActiveJobs, int ProposalsToReview, int ApprovalsToRelease,
    int ChangeRequestsToReview, int OpenSos, int LowStockParts, int UnpaidInvoices, decimal RevenueThisWeek, decimal RevenueLastWeek, decimal PlatformEarningsThisMonth);



/// <summary>Manager-issued 7-day mechanic invitations.</summary>





