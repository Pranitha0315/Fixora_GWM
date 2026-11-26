import 'package:flutter/foundation.dart';

import '../../../core/utils/hash_chain.dart';
import '../../diagnosis/domain/diagnosis_entities.dart';
import '../../jobs/domain/job_entities.dart';
import '../domain/passport_entities.dart';

/// Unresolved Diagnostic Evidence Passport (BRD USP 3).
class PassportController extends ChangeNotifier {
  PassportController(this._entries);

  final List<PassportEntry> _entries;

  List<PassportEntry> get entries =>
      List.of(_entries)..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));

  PassportEntry byId(String id) => _entries.firstWhere((e) => e.id == id);

  /// Open entries for a vehicle – re-surfaced on its next visit.
  List<PassportEntry> openFor(Vehicle v) => _entries
      .where((e) => e.vehicle.plate == v.plate && e.status.isOpen)
      .toList();

  List<PassportEntry> allFor(Vehicle v) =>
      _entries.where((e) => e.vehicle.plate == v.plate).toList();

  static PassportRecord buildRecord({
    required String prevHash,
    required String kind,
    required String mechanic,
    required String note,
    DateTime? at,
    int? mileageKm,
    List<String> codes = const [],
    List<String> symptoms = const [],
    int evidenceCount = 0,
    String? jobId,
  }) {
    final draft = PassportRecord(
      kind: kind,
      at: at ?? DateTime.now(),
      mechanic: mechanic,
      note: note,
      hash: '',
      prevHash: prevHash,
      mileageKm: mileageKm,
      codes: codes,
      symptoms: symptoms,
      evidenceCount: evidenceCount,
      jobId: jobId,
    );
    return PassportRecord(
      kind: draft.kind,
      at: draft.at,
      mechanic: draft.mechanic,
      note: draft.note,
      hash: HashChain.hash(prevHash, draft.payload),
      prevHash: prevHash,
      mileageKm: draft.mileageKm,
      codes: draft.codes,
      symptoms: draft.symptoms,
      evidenceCount: draft.evidenceCount,
      jobId: draft.jobId,
    );
  }

  /// True when every record's hash still matches its content and links
  /// to the previous record.
  bool verify(PassportEntry entry) {
    var prev = HashChain.genesis;
    for (final r in entry.records) {
      if (r.prevHash != prev) return false;
      if (HashChain.hash(prev, r.payload) != r.hash) return false;
      prev = r.hash;
    }
    return true;
  }

  void _append(PassportEntry entry, String kind, String mechanic, String note,
      {String? jobId}) {
    entry.records.add(buildRecord(
      prevHash: entry.records.last.hash,
      kind: kind,
      mechanic: mechanic,
      note: note,
      jobId: jobId,
    ));
  }

  /// Inconclusive diagnosis -> new passport entry.
  PassportEntry createFromDiagnosis({
    required Job job,
    required String title,
    required String note,
    required String mechanic,
    required List<String> symptoms,
    required List<String> codes,
    required int evidenceCount,
  }) {
    final entry = PassportEntry(
      id: 'PP-${1000 + _entries.length + 1}',
      vehicle: job.vehicle,
      title: title,
      status: PassportStatus.unresolved,
      records: [
        buildRecord(
          prevHash: HashChain.genesis,
          kind: 'Created',
          mechanic: mechanic,
          note: note,
          mileageKm: job.vehicle.mileageKm,
          codes: codes,
          symptoms: symptoms,
          evidenceCount: evidenceCount,
          jobId: job.id,
        ),
      ],
    );
    _entries.add(entry);
    notifyListeners();
    return entry;
  }

  void addNote(PassportEntry entry, String mechanic, String note) {
    _append(entry, 'Note', mechanic, note);
    notifyListeners();
  }

  void changeStatus(PassportEntry entry, PassportStatus status, String mechanic,
      String note) {
    entry.status = status;
    _append(entry, 'Status → ${status.label}', mechanic, note);
    notifyListeners();
  }

  /// Closing requires a linked job and a verification note.
  void resolve(PassportEntry entry, String jobId, String mechanic,
      String verificationNote) {
    entry.status = PassportStatus.resolved;
    entry.resolvedByJobId = jobId;
    _append(entry, 'Resolved', mechanic, verificationNote, jobId: jobId);
    notifyListeners();
  }

  /// Helper for the diagnosis flow: codes from a report.
  static List<String> codesOf(DiagnosisReport? report) =>
      report?.scan?.codes.map((c) => c.code).toList() ?? const [];
}
