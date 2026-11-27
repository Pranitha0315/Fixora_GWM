import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';

class Vehicle {
  const Vehicle({
    required this.id,
    required this.make,
    required this.model,
    required this.year,
    required this.plate,
    required this.mileageKm,
    required this.fuel,
    required this.color,
  });

  final String id;
  final String make;
  final String model;
  final int year;
  final String plate;
  final int mileageKm;
  final String fuel;
  final String color;

  String get title => '$make $model';
  String get subtitle => '$year · $fuel · $color';

  static const cutoutPool = <String>[
    'assets/images/car_toyota_cut.png',
    'assets/images/car_honda_cut.png',
    'assets/images/car_hyundai_cut.png',
  ];

  static const imagePool = <String>[
    'assets/images/car_toyota.jpg',
    'assets/images/car_honda.jpg',
    'assets/images/car_hyundai.jpg',
  ];

  /// Thumbnail asset for job cards / home previews.
  String get imageAsset {
    final key = '$make $model'.toLowerCase();
    if (key.contains('honda')) return imagePool[1];
    if (key.contains('hyundai')) return imagePool[2];
    if (key.contains('toyota')) return imagePool[0];
    return imagePool[id.hashCode.abs() % imagePool.length];
  }

  /// Make-based preferred cut-out (may collide when many Toyotas, etc.).
  String get preferredCutout {
    final key = '$make $model'.toLowerCase();
    if (key.contains('honda') || key.contains('nissan')) return cutoutPool[1];
    if (key.contains('hyundai') || key.contains('suzuki')) return cutoutPool[2];
    if (key.contains('toyota')) return cutoutPool[0];
    return cutoutPool[id.hashCode.abs() % cutoutPool.length];
  }

  /// Transparent cut-out used on Jobs / detail when no list uniqueness is needed.
  String get cutoutAsset => preferredCutout;

  /// One PNG per job on a list. Keeps make preference when free, otherwise
  /// hands out unused cutouts so the same car image does not repeat.
  static Map<String, String> uniqueCutoutsForJobs(
    Iterable<({String id, String preferred})> jobs,
  ) {
    final list = jobs.toList();
    final available = List<String>.from(cutoutPool);
    final out = <String, String>{};

    for (final j in list) {
      if (available.contains(j.preferred)) {
        out[j.id] = j.preferred;
        available.remove(j.preferred);
      }
    }
    var fallback = 0;
    for (final j in list) {
      if (out.containsKey(j.id)) continue;
      if (available.isNotEmpty) {
        out[j.id] = available.removeAt(0);
      } else {
        out[j.id] = cutoutPool[fallback++ % cutoutPool.length];
      }
    }
    return out;
  }
}

class Customer {
  const Customer({required this.name, required this.phone});
  final String name;
  final String phone;
}

/// Mechanic's view of a job card. Every status here comes from the backend's JobStatus
/// (Open, Inspecting, AwaitingManagerReview / AwaitingCustomerApproval / AwaitingRelease,
/// InProgress, Paused, Completed, Closed).
enum JobStatus {
  waiting,
  diagnosing,
  awaitingApproval,
  inProgress,
  completed,
}

extension JobStatusX on JobStatus {
  /// Mechanic-facing status labels aligned to:
  /// Pending → In Progress → Awaiting Review → Completed.
  String get label => switch (this) {
        JobStatus.waiting => 'Pending',
        JobStatus.diagnosing => 'In Progress',
        JobStatus.awaitingApproval => 'Awaiting Review',
        JobStatus.inProgress => 'In Progress',
        JobStatus.completed => 'Completed',
      };

  Color get color => switch (this) {
        JobStatus.waiting => AppColors.info,
        JobStatus.diagnosing => AppColors.primary,
        JobStatus.awaitingApproval => AppColors.warning,
        JobStatus.inProgress => AppColors.primary,
        JobStatus.completed => AppColors.success,
      };

  IconData get icon => switch (this) {
        JobStatus.waiting => Icons.schedule_rounded,
        JobStatus.diagnosing => Icons.troubleshoot_rounded,
        JobStatus.awaitingApproval => Icons.hourglass_top_rounded,
        JobStatus.inProgress => Icons.build_circle_outlined,
        JobStatus.completed => Icons.check_circle_outline_rounded,
      };

  bool get isActive => this != JobStatus.completed;

  /// 0..1 progress used on cards.
  double get progress => switch (this) {
        JobStatus.waiting => 0.05,
        JobStatus.diagnosing => 0.2,
        JobStatus.awaitingApproval => 0.35,
        JobStatus.inProgress => 0.65,
        JobStatus.completed => 1,
      };
}

enum JobPriority { normal, sos, returning, safety }

extension JobPriorityX on JobPriority {
  String get label => switch (this) {
        JobPriority.normal => 'Normal',
        JobPriority.sos => 'SOS',
        JobPriority.returning => 'Returning issue',
        JobPriority.safety => 'Safety critical',
      };

  Color get color => switch (this) {
        JobPriority.normal => AppColors.inkSoft,
        JobPriority.sos => AppColors.danger,
        JobPriority.returning => AppColors.purple,
        JobPriority.safety => AppColors.warning,
      };

  IconData get icon => switch (this) {
        JobPriority.normal => Icons.circle_outlined,
        JobPriority.sos => Icons.sos_rounded,
        JobPriority.returning => Icons.history_rounded,
        JobPriority.safety => Icons.warning_amber_rounded,
      };

  /// Lower runs first in the queue.
  int get rank => switch (this) {
        JobPriority.sos => 0,
        JobPriority.safety => 1,
        JobPriority.returning => 2,
        JobPriority.normal => 3,
      };
}

class TimelineEvent {
  TimelineEvent(this.title, this.time, {this.detail, this.icon = Icons.circle});
  final String title;
  final DateTime time;
  final String? detail;
  final IconData icon;
}

class Job {
  Job({
    required this.id,
    required this.token,
    required this.vehicle,
    required this.customer,
    required this.serviceType,
    required this.reportedSymptoms,
    required this.slotTime,
    required this.estimatedMinutes,
    required this.status,
    required this.bay,
    this.priority = JobPriority.normal,
    this.startedAt,
    this.completedAt,
    this.customerNote,
    this.managerNote,
    this.paused = false,
    List<TimelineEvent>? timeline,
  }) : timeline = timeline ?? [];

  final String id;
  final int token;
  final Vehicle vehicle;
  final Customer customer;
  final String serviceType;
  final List<String> reportedSymptoms;
  DateTime slotTime;
  int estimatedMinutes;
  JobStatus status;
  String bay;

  /// True while the backend reports the job as Paused.
  bool paused;

  JobPriority priority;
  DateTime? startedAt;
  DateTime? completedAt;
  String? customerNote;

  /// Manager → mechanic instruction from the booking (never shown to the customer).
  String? managerNote;

  final List<TimelineEvent> timeline;

  void log(String title, {String? detail, IconData icon = Icons.circle}) =>
      timeline.insert(
          0, TimelineEvent(title, DateTime.now(), detail: detail, icon: icon));
}
