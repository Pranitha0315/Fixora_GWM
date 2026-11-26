import 'dart:ui' show Offset;

import 'package:flutter/material.dart' show Color, IconData, Icons;

import '../../../core/theme/app_colors.dart';

enum Severity { low, medium, high, critical }

extension SeverityX on Severity {
  String get label => switch (this) {
        Severity.low => 'Low',
        Severity.medium => 'Medium',
        Severity.high => 'High',
        Severity.critical => 'Critical',
      };

  Color get color => switch (this) {
        Severity.low => AppColors.success,
        Severity.medium => AppColors.warning,
        Severity.high => AppColors.primary,
        Severity.critical => AppColors.danger,
      };
}

/// OBD-II diagnostic trouble code translated to plain language.
class DtcCode {
  const DtcCode(this.code, this.title, this.plainMeaning, this.severity);
  final String code;
  final String title;
  final String plainMeaning;
  final Severity severity;
}

class LiveReading {
  const LiveReading(this.label, this.value, this.unit, {this.warning = false});
  final String label;
  final String value;
  final String unit;
  final bool warning;
}

class ObdScanResult {
  const ObdScanResult({
    required this.codes,
    required this.readings,
    required this.freezeFrame,
  });
  final List<DtcCode> codes;
  final List<LiveReading> readings;
  final String freezeFrame;
}

enum EvidenceType { photo, endoscope, thermal }

extension EvidenceTypeX on EvidenceType {
  String get label => switch (this) {
        EvidenceType.photo => 'Photo',
        EvidenceType.endoscope => 'Endoscope',
        EvidenceType.thermal => 'Thermal',
      };

  IconData get icon => switch (this) {
        EvidenceType.photo => Icons.photo_camera_outlined,
        EvidenceType.endoscope => Icons.radio_button_checked,
        EvidenceType.thermal => Icons.thermostat_outlined,
      };
}

class EvidenceItem {
  EvidenceItem({
    required this.id,
    required this.type,
    required this.caption,
    required this.capturedAt,
  });
  final String id;
  final EvidenceType type;
  final String caption;
  final DateTime capturedAt;
}

class SuggestedPart {
  const SuggestedPart(this.partId, this.qty);
  final String partId;
  final int qty;
}

/// One ranked suggestion from the AI Diagnosis Assistant.
class AiCause {
  const AiCause({
    required this.title,
    required this.reason,
    required this.confidence,
    required this.zoneId,
    required this.severity,
    required this.parts,
    required this.labourHours,
    required this.repair,
  });

  final String title;
  final String reason;
  final double confidence; // 0..1
  final String zoneId;
  final Severity severity;
  final List<SuggestedPart> parts;
  final double labourHours;
  final String repair;
}

/// Area of the vehicle diagram; [points] are hotspot centres in 0..1
/// coordinates of a top-down car facing up.
class VehicleZone {
  const VehicleZone(this.id, this.label, this.points);
  final String id;
  final String label;
  final List<Offset> points;
}

const List<VehicleZone> vehicleZones = [
  VehicleZone('cooling', 'Radiator / cooling', [Offset(0.5, 0.075)]),
  VehicleZone('engine', 'Engine', [Offset(0.5, 0.2)]),
  VehicleZone('battery', 'Battery / charging', [Offset(0.28, 0.16)]),
  VehicleZone('ac', 'A/C system', [Offset(0.72, 0.16)]),
  VehicleZone('front_brakes', 'Front wheels / brakes',
      [Offset(0.1, 0.25), Offset(0.9, 0.25)]),
  VehicleZone('electrical', 'Dashboard / electrical', [Offset(0.5, 0.37)]),
  VehicleZone('transmission', 'Transmission', [Offset(0.5, 0.5)]),
  VehicleZone(
      'suspension', 'Suspension', [Offset(0.24, 0.5), Offset(0.76, 0.5)]),
  VehicleZone('rear_brakes', 'Rear wheels / brakes',
      [Offset(0.1, 0.76), Offset(0.9, 0.76)]),
  VehicleZone('fuel', 'Fuel system', [Offset(0.5, 0.79)]),
  VehicleZone('exhaust', 'Exhaust', [Offset(0.66, 0.94)]),
];

VehicleZone zoneById(String id) =>
    vehicleZones.firstWhere((z) => z.id == id, orElse: () => vehicleZones[1]);

/// Final result of the guided diagnosis, sent to the customer with the
/// estimate (USP 1).
class DiagnosisReport {
  DiagnosisReport({
    required this.symptoms,
    required this.scan,
    required this.evidence,
    required this.cause,
    required this.causeDetail,
    required this.zoneId,
    required this.severity,
    required this.aiAssisted,
    required this.createdAt,
    this.aiConfidence,
    this.mechanicNotes = '',
  });

  final List<String> symptoms;
  final ObdScanResult? scan;
  final List<EvidenceItem> evidence;
  final String cause;
  final String causeDetail;
  final String zoneId;
  final Severity severity;
  final bool aiAssisted;
  final double? aiConfidence;
  final DateTime createdAt;
  final String mechanicNotes;
}

/// Mock data the diagnosis service returns for a given job scenario.
class DiagnosisScenario {
  const DiagnosisScenario({required this.scan, required this.causes});
  final ObdScanResult scan;
  final List<AiCause> causes;
}
