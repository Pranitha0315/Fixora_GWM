import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../diagnosis/domain/diagnosis_entities.dart';

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

/// Mechanic's lifecycle of a job card.
///
/// waiting → diagnosing → awaitingApproval → approved → inProgress
/// → qualityCheck → completed. An inconclusive diagnosis is `parked`
/// in the Evidence Passport instead.
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
  /// Mechanic-facing status labels aligned to:
  /// Pending → In Progress → Awaiting Review → Completed.
  String get label => switch (this) {
        JobStatus.waiting => 'Pending',
        JobStatus.diagnosing => 'In Progress',
        JobStatus.awaitingApproval => 'Awaiting Review',
        JobStatus.approved => 'Pending',
        JobStatus.inProgress => 'In Progress',
        JobStatus.qualityCheck => 'Awaiting Review',
        JobStatus.completed => 'Completed',
        JobStatus.parked => 'Completed',
      };

  Color get color => switch (this) {
        JobStatus.waiting => AppColors.info,
        JobStatus.diagnosing => AppColors.primary,
        JobStatus.awaitingApproval => AppColors.warning,
        JobStatus.approved => AppColors.info,
        JobStatus.inProgress => AppColors.primary,
        JobStatus.qualityCheck => AppColors.warning,
        JobStatus.completed => AppColors.success,
        JobStatus.parked => AppColors.success,
      };

  IconData get icon => switch (this) {
        JobStatus.waiting => Icons.schedule_rounded,
        JobStatus.diagnosing => Icons.troubleshoot_rounded,
        JobStatus.awaitingApproval => Icons.hourglass_top_rounded,
        JobStatus.approved => Icons.thumb_up_alt_outlined,
        JobStatus.inProgress => Icons.build_circle_outlined,
        JobStatus.qualityCheck => Icons.fact_check_outlined,
        JobStatus.completed => Icons.check_circle_outline_rounded,
        JobStatus.parked => Icons.bookmark_added_outlined,
      };

  bool get isActive => this != JobStatus.completed && this != JobStatus.parked;

  /// 0..1 progress used on cards.
  double get progress => switch (this) {
        JobStatus.waiting => 0.05,
        JobStatus.diagnosing => 0.2,
        JobStatus.awaitingApproval => 0.35,
        JobStatus.approved => 0.45,
        JobStatus.inProgress => 0.65,
        JobStatus.qualityCheck => 0.9,
        JobStatus.completed => 1,
        JobStatus.parked => 1,
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

class EstimateLine {
  EstimateLine({
    required this.partId,
    required this.name,
    required this.qty,
    required this.unitPrice,
    this.reservedQty = 0,
  });

  String partId;
  String name;
  int qty;
  double unitPrice;

  /// How many units are already held for this job in the stock room.
  int reservedQty;

  double get total => qty * unitPrice;
}

class Estimate {
  Estimate({
    required this.lines,
    required this.labourHours,
    required this.recommendedRepair,
    this.labourRate = 3500,
  });

  final List<EstimateLine> lines;
  double labourHours;
  double labourRate;
  String recommendedRepair;

  double get partsTotal => lines.fold<double>(0, (sum, l) => sum + l.total);
  double get labourTotal => labourHours * labourRate;
  double get total => partsTotal + labourTotal;
}

class RepairTask {
  RepairTask(this.title, {this.done = false});
  final String title;
  bool done;
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
    required this.scenario,
    this.priority = JobPriority.normal,
    this.diagnosis,
    this.estimate,
    this.partsReserved = false,
    List<RepairTask>? tasks,
    List<TimelineEvent>? timeline,
    this.progressPhotos = 0,
    this.startedAt,
    this.completedAt,
    this.passportEntryId,
    this.customerNote,
    this.managerNote,
  })  : tasks = tasks ?? [],
        timeline = timeline ?? [];

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

  /// True while repair is paused (synced via jobAction pause/resume).
  bool paused = false;

  /// Key of the mock OBD / AI scenario used by the diagnosis service.
  final String scenario;
  JobPriority priority;
  DiagnosisReport? diagnosis;
  Estimate? estimate;
  bool partsReserved;
  List<RepairTask> tasks;
  final List<TimelineEvent> timeline;
  int progressPhotos;
  DateTime? startedAt;
  DateTime? completedAt;
  String? passportEntryId;
  String? customerNote;

  /// Manager → mechanic instruction from the booking (never shown to the customer).
  String? managerNote;

  double get taskProgress =>
      tasks.isEmpty ? 0 : tasks.where((t) => t.done).length / tasks.length;

  void log(String title, {String? detail, IconData icon = Icons.circle}) =>
      timeline.insert(
          0, TimelineEvent(title, DateTime.now(), detail: detail, icon: icon));
}
