import 'package:flutter/material.dart';

/// waiting → diagnosing → awaitingApproval → approved → inProgress
/// → qualityCheck → completed. parked = inconclusive.
enum JobStatus {
  waiting,
  diagnosing,
  awaitingApproval,
  approved,
  inProgress,
  qualityCheck,
  completed,
  parked,
}

extension JobStatusX on JobStatus {
  bool get isActive =>
      this != JobStatus.completed && this != JobStatus.parked;

  String get label => switch (this) {
        JobStatus.waiting => 'Waiting',
        JobStatus.diagnosing => 'Diagnosing',
        JobStatus.awaitingApproval => 'Awaiting approval',
        JobStatus.approved => 'Approved',
        JobStatus.inProgress => 'In progress',
        JobStatus.qualityCheck => 'Quality check',
        JobStatus.completed => 'Completed',
        JobStatus.parked => 'Parked',
      };

  /// API / SignalR status string → [JobStatus].
  /// 'Paused' maps to [JobStatus.inProgress] (paused flag set separately).
  static JobStatus fromApi(String? raw, {void Function()? onPaused}) {
    final s = (raw ?? '').trim().toLowerCase();
    if (s == 'paused') {
      onPaused?.call();
      return JobStatus.inProgress;
    }
    return switch (s) {
      'waiting' || 'queued' || 'assigned' => JobStatus.waiting,
      'diagnosing' || 'diagnosis' => JobStatus.diagnosing,
      'awaitingapproval' || 'awaiting_approval' || 'pending_approval' =>
        JobStatus.awaitingApproval,
      'approved' => JobStatus.approved,
      'inprogress' || 'in_progress' || 'repair' => JobStatus.inProgress,
      'qualitycheck' || 'quality_check' || 'qc' => JobStatus.qualityCheck,
      'completed' || 'done' => JobStatus.completed,
      'parked' || 'onhold' || 'on_hold' => JobStatus.parked,
      _ => JobStatus.waiting,
    };
  }
}

enum JobPriority {
  low,
  normal,
  high,
  urgent,
}

extension JobPriorityX on JobPriority {
  int get rank => switch (this) {
        JobPriority.urgent => 0,
        JobPriority.high => 1,
        JobPriority.normal => 2,
        JobPriority.low => 3,
      };

  String get label => switch (this) {
        JobPriority.low => 'Low',
        JobPriority.normal => 'Normal',
        JobPriority.high => 'High',
        JobPriority.urgent => 'Urgent',
      };
}

class JobCustomer {
  const JobCustomer({required this.name, this.phone});

  final String name;
  final String? phone;
}

class JobLogEntry {
  JobLogEntry({
    required this.message,
    this.detail,
    this.icon,
    DateTime? at,
  }) : at = at ?? DateTime.now();

  final String message;
  final String? detail;
  final IconData? icon;
  final DateTime at;
}

/// Mechanic-assigned job card (mutable lifecycle fields).
class Job {
  Job({
    required this.id,
    required this.token,
    required this.vehicleReg,
    required this.vehicleModel,
    required this.customerName,
    required this.summary,
    required this.status,
    this.priority = JobPriority.normal,
    this.bay,
    this.startedAt,
    this.paused = false,
    this.progressPercent = 0,
    List<JobLogEntry>? logs,
  }) : logs = logs ?? <JobLogEntry>[];

  final String id;
  final String token;
  final String vehicleReg;
  final String vehicleModel;
  final String customerName;
  final String summary;
  JobStatus status;
  final JobPriority priority;
  final String? bay;
  DateTime? startedAt;
  bool paused;
  int progressPercent;
  final List<JobLogEntry> logs;

  JobCustomer get customer => JobCustomer(name: customerName);

  void log(String message, {String? detail, IconData? icon}) {
    logs.insert(
      0,
      JobLogEntry(message: message, detail: detail, icon: icon),
    );
  }

  Job copyWith({
    JobStatus? status,
    DateTime? startedAt,
    bool? paused,
  }) {
    final j = Job(
      id: id,
      token: token,
      vehicleReg: vehicleReg,
      vehicleModel: vehicleModel,
      customerName: customerName,
      summary: summary,
      status: status ?? this.status,
      priority: priority,
      bay: bay,
      startedAt: startedAt ?? this.startedAt,
      paused: paused ?? this.paused,
      progressPercent: progressPercent,
      logs: List<JobLogEntry>.from(logs),
    );
    return j;
  }

  /// Build from API JSON (`Paused` → inProgress + paused flag).
  factory Job.fromJson(Map<String, dynamic> json) {
    var paused = false;
    final status = JobStatusX.fromApi(
      (json['status'] ?? json['state'])?.toString(),
      onPaused: () => paused = true,
    );
    final customer = json['customer'];
    final customerName = customer is Map
        ? (customer['name'] ?? '').toString()
        : (json['customerName'] ?? json['customer_name'] ?? '').toString();
    return Job(
      id: (json['id'] ?? json['jobId'] ?? '').toString(),
      token: (json['token'] ?? json['queueToken'] ?? '').toString(),
      vehicleReg: (json['vehicleReg'] ??
              json['vehicle_reg'] ??
              json['registration'] ??
              '')
          .toString(),
      vehicleModel:
          (json['vehicleModel'] ?? json['vehicle_model'] ?? json['model'] ?? '')
              .toString(),
      customerName: customerName.isEmpty ? 'Customer' : customerName,
      summary: (json['summary'] ?? json['title'] ?? json['issue'] ?? '')
          .toString(),
      status: status,
      priority: _priorityFrom(json['priority']?.toString()),
      bay: (json['bay'] ?? json['bayName'])?.toString(),
      startedAt: DateTime.tryParse(
        (json['startedAt'] ?? json['started_at'] ?? '').toString(),
      ),
      paused: paused || json['paused'] == true,
      progressPercent: _progressFrom(json),
    );
  }

  static int _progressFrom(Map<String, dynamic> json) {
    final raw = json['progressPercent'] ?? json['progress_percent'];
    return switch (raw) {
      final int n => n.clamp(0, 100),
      final num n => n.round().clamp(0, 100),
      final String s => int.tryParse(s)?.clamp(0, 100) ?? 0,
      _ => 0,
    };
  }

  static JobPriority _priorityFrom(String? raw) {
    switch ((raw ?? '').toLowerCase()) {
      case 'urgent':
        return JobPriority.urgent;
      case 'high':
        return JobPriority.high;
      case 'low':
        return JobPriority.low;
      default:
        return JobPriority.normal;
    }
  }
}
