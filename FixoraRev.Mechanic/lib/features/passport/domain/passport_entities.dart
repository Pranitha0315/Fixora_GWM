import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../jobs/domain/job_entities.dart';

/// Lifecycle of an unresolved issue (BRD USP 3).
enum PassportStatus { unresolved, monitoring, resolved, escalated }

extension PassportStatusX on PassportStatus {
  String get label => switch (this) {
        PassportStatus.unresolved => 'Unresolved',
        PassportStatus.monitoring => 'Monitoring',
        PassportStatus.resolved => 'Resolved',
        PassportStatus.escalated => 'Escalated',
      };

  Color get color => switch (this) {
        PassportStatus.unresolved => AppColors.danger,
        PassportStatus.monitoring => AppColors.warning,
        PassportStatus.resolved => AppColors.success,
        PassportStatus.escalated => AppColors.purple,
      };

  IconData get icon => switch (this) {
        PassportStatus.unresolved => Icons.report_gmailerrorred_rounded,
        PassportStatus.monitoring => Icons.visibility_outlined,
        PassportStatus.resolved => Icons.verified_outlined,
        PassportStatus.escalated => Icons.trending_up_rounded,
      };

  bool get isOpen => this != PassportStatus.resolved;
}

/// One block in an entry's hash chain. [hash] covers [prevHash] plus the
/// record's content, so any silent edit breaks the chain.
class PassportRecord {
  PassportRecord({
    required this.kind,
    required this.at,
    required this.mechanic,
    required this.note,
    required this.hash,
    required this.prevHash,
    this.mileageKm,
    this.codes = const [],
    this.symptoms = const [],
    this.evidenceCount = 0,
    this.jobId,
  });

  final String kind; // Created, Note, Status change, Resolved
  final DateTime at;
  final String mechanic;
  final String note;
  final String hash;
  final String prevHash;
  final int? mileageKm;
  final List<String> codes;
  final List<String> symptoms;
  final int evidenceCount;
  final String? jobId;

  String get payload =>
      '$kind|${at.toIso8601String()}|$mechanic|$note|${mileageKm ?? ''}|'
      '${codes.join(',')}|${symptoms.join(',')}|$evidenceCount|${jobId ?? ''}';
}

class PassportEntry {
  PassportEntry({
    required this.id,
    required this.vehicle,
    required this.title,
    required this.status,
    required this.records,
    this.resolvedByJobId,
  });

  final String id;
  final Vehicle vehicle;
  final String title;
  PassportStatus status;
  final List<PassportRecord> records; // oldest first
  String? resolvedByJobId;

  DateTime get openedAt => records.first.at;
  DateTime get updatedAt => records.last.at;
  List<String> get codes => records.expand((r) => r.codes).toSet().toList();
  int get evidenceCount => records.fold<int>(0, (s, r) => s + r.evidenceCount);
}
