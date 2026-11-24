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

/// Mechanic-assigned job card.
class Job {
  const Job({
    required this.id,
    required this.token,
    required this.vehicleReg,
    required this.vehicleModel,
    required this.customerName,
    required this.summary,
    required this.status,
    this.priority = JobPriority.normal,
    this.bay,
  });

  final String id;
  final String token;
  final String vehicleReg;
  final String vehicleModel;
  final String customerName;
  final String summary;
  final JobStatus status;
  final JobPriority priority;
  final String? bay;

  Job copyWith({JobStatus? status}) => Job(
        id: id,
        token: token,
        vehicleReg: vehicleReg,
        vehicleModel: vehicleModel,
        customerName: customerName,
        summary: summary,
        status: status ?? this.status,
        priority: priority,
        bay: bay,
      );
}
