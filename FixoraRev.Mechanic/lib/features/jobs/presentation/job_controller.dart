import 'package:flutter/material.dart';

import '../../../core/di/app_services.dart';
import '../../diagnosis/domain/diagnosis_entities.dart';
import '../../inventory/domain/part.dart';
import '../../notifications/domain/app_notification.dart';
import '../../sos/domain/sos_entities.dart';
import '../domain/job_entities.dart';
import '../../../core/backend/mechanic_backend.dart';

/// The mechanic's job cards and the live queue (BRD USP 5).
class JobController extends ChangeNotifier {
  JobController(this._jobs);

  final List<Job> _jobs;

  List<Job> get all => List.unmodifiable(_jobs);

  /// Replaces the demo jobs with the mechanic's assigned job cards from the backend.
  void replaceAll(List<Job> jobs) {
    _jobs
      ..clear()
      ..addAll(jobs);
    notifyListeners();
  }

  Job? tryById(String id) {
    for (final j in _jobs) {
      if (j.id == id) return j;
    }
    return null;
  }

  /// Live mode: mirror a lifecycle step to the backend (manager and customer follow it in real time).
  void _sync(Job job, String action, {String? stage, String? message, int? percent}) {
    final be = MechanicBackend.instance;
    if (!be.live) return;
    be.jobAction(job.id, action, stage: stage, message: message, percent: percent).catchError((Object _) {});
  }

  Job byId(String id) => _jobs.firstWhere((j) => j.id == id);

  int _statusGroup(JobStatus s) => switch (s) {
        JobStatus.inProgress => 0,
        JobStatus.qualityCheck => 0,
        JobStatus.diagnosing => 1,
        JobStatus.approved => 2,
        JobStatus.waiting => 3,
        JobStatus.awaitingApproval => 4,
        JobStatus.completed => 5,
        JobStatus.parked => 6,
      };

  /// Active jobs: work in hand first, then the waiting line ordered by
  /// priority rule (SOS > safety > returning issue > normal) and token.
  List<Job> get queue {
    final list = _jobs.where((j) => j.status.isActive).toList();
    list.sort((a, b) {
      final g = _statusGroup(a.status).compareTo(_statusGroup(b.status));
      if (g != 0) return g;
      final p = a.priority.rank.compareTo(b.priority.rank);
      if (p != 0) return p;
      return a.token.compareTo(b.token);
    });
    return list;
  }

  List<Job> get finished => _jobs.where((j) => !j.status.isActive).toList()
    ..sort((a, b) =>
        (b.completedAt ?? b.slotTime).compareTo(a.completedAt ?? a.slotTime));

  List<Job> byStatus(Set<JobStatus> statuses) =>
      queue.where((j) => statuses.contains(j.status)).toList();

  Job? get currentJob {
    for (final j in queue) {
      if (j.status == JobStatus.inProgress ||
          j.status == JobStatus.qualityCheck ||
          j.status == JobStatus.diagnosing) {
        return j;
      }
    }
    return null;
  }

  /// Rolling ETA for jobs still waiting: starts after the work in hand and
  /// adds each job's estimated duration. Recomputed on every change, so an
  /// SOS insert or an early finish shifts everyone automatically.
  DateTime? etaFor(Job job) {
    if (job.status != JobStatus.waiting && job.status != JobStatus.approved) {
      return null;
    }
    var cursor = DateTime.now();
    for (final j in queue) {
      if (j.status == JobStatus.inProgress ||
          j.status == JobStatus.qualityCheck) {
        final started = j.startedAt ?? DateTime.now();
        final end = started.add(Duration(minutes: j.estimatedMinutes));
        if (end.isAfter(cursor)) cursor = end;
      }
    }
    for (final j in queue) {
      if (j.status != JobStatus.waiting && j.status != JobStatus.approved) {
        continue;
      }
      if (j.id == job.id) return cursor;
      cursor = cursor.add(Duration(minutes: j.estimatedMinutes));
    }
    return cursor;
  }

  int positionOf(Job job) {
    final waiting = queue
        .where((j) =>
            j.status == JobStatus.waiting || j.status == JobStatus.approved)
        .toList();
    return waiting.indexWhere((j) => j.id == job.id) + 1;
  }

  // ---- Stats for the dashboard ----
  int get waitingCount =>
      _jobs.where((j) => j.status == JobStatus.waiting).length;
  int get activeCount => _jobs
      .where((j) => j.status.isActive && j.status != JobStatus.waiting)
      .length;
  int get completedToday =>
      _jobs.where((j) => j.status == JobStatus.completed).length;
  int get totalToday => _jobs.length;

  // ---- FixProof + delay updates (photo / Tamil voice inspection) ----

  /// FixProof capture started: a waiting job moves into inspection.
  void startFixProof(Job job) {
    if (job.status == JobStatus.waiting) {
      job.status = JobStatus.diagnosing;
      job.startedAt ??= DateTime.now();
      _sync(job, 'start');
    }
    job.log('FixProof inspection started', icon: Icons.photo_camera_rounded);
    notifyListeners();
  }

  /// Mechanic confirmed the AI draft; the verified report is now visible
  /// to the customer, who approves repair items one by one.
  void publishFixProof(Job job, {required int issues}) {
    if (job.status == JobStatus.waiting || job.status == JobStatus.diagnosing) {
      job.status = JobStatus.awaitingApproval;
    }
    job.log('FixProof report published',
        detail: '$issues issue${issues == 1 ? '' : 's'} verified by mechanic',
        icon: Icons.verified_rounded);
    notifyListeners();
  }

  /// Running late: pushes this job's estimate so the queue ETAs re-plan.
  void reportDelay(Job job, int minutes, String reason, {String? note}) {
    job.estimatedMinutes += minutes;
    job.log('Delay reported (+$minutes min)',
        detail: [reason, if (note != null && note.isNotEmpty) note].join(' · '),
        icon: Icons.schedule_rounded);
    notifyListeners();
  }

  // ---- Lifecycle ----

  void startDiagnosis(Job job) {
    if (job.status == JobStatus.waiting) {
      job.status = JobStatus.diagnosing;
      job.startedAt ??= DateTime.now();
      job.log('Diagnosis started', icon: Icons.troubleshoot_rounded);
      notifyListeners();
    }
  }

  /// Report + estimate sent to the Customer app for approval.
  void submitDiagnosis(Job job, DiagnosisReport report, Estimate estimate) {
    job.diagnosis = report;
    job.estimate = estimate;
    job.status = JobStatus.awaitingApproval;
    job.estimatedMinutes =
        (estimate.labourHours * 60).round().clamp(30, 600).toInt();
    job.tasks = [
      for (final line in estimate.lines)
        RepairTask('Fit ${line.name} ×${line.qty}'),
      RepairTask('Clear fault codes & re-scan'),
      RepairTask('Road test / functional test'),
    ];
    job.log(
      'Diagnostic report sent to customer',
      detail: '${report.cause} · ${estimate.lines.length} part(s)',
      icon: Icons.send_rounded,
    );
    notifyListeners();
  }

  void parkInPassport(Job job, String entryId) {
    job.status = JobStatus.parked;
    job.passportEntryId = entryId;
    job.completedAt = DateTime.now();
    job.log('Parked in Evidence Passport',
        detail: 'Inconclusive diagnosis recorded with evidence',
        icon: Icons.bookmark_added_outlined);
    notifyListeners();
  }

  /// In production this arrives from the Customer app via SignalR.
  void customerApproved(Job job) {
    if (job.status != JobStatus.awaitingApproval) return;
    job.status = JobStatus.approved;
    job.log('Customer approved the estimate',
        icon: Icons.thumb_up_alt_outlined);
    _reserveParts(job);
    AppServices.notifications.add(AppNotification(
      kind: NotificationKind.approval,
      title: 'Estimate approved',
      body:
          '${job.customer.name} approved the repair for ${job.vehicle.plate}.',
      time: DateTime.now(),
      jobId: job.id,
    ));
    notifyListeners();
  }

  void _reserveParts(Job job) {
    final estimate = job.estimate;
    if (estimate == null) return;
    for (final line in estimate.lines) {
      AppServices.inventory.reserve(line);
    }
    job.partsReserved = true;
    job.log('Parts reserved in stock room', icon: Icons.inventory_2_outlined);
  }

  /// After a delivery, approved jobs pick up the stock they were missing.
  void topUpReservations() {
    for (final job in _jobs) {
      if (!job.partsReserved || !job.status.isActive || job.estimate == null) {
        continue;
      }
      for (final line in job.estimate!.lines) {
        AppServices.inventory.reserve(line);
      }
    }
    notifyListeners();
  }

  void swapToSubstitute(Job job, EstimateLine line, Part substitute) {
    final inv = AppServices.inventory;
    inv.release(line);
    final oldName = line.name;
    line
      ..partId = substitute.id
      ..name = substitute.name
      ..unitPrice = substitute.unitPrice;
    for (var i = 0; i < job.tasks.length; i++) {
      if (job.tasks[i].title.startsWith('Fit $oldName')) {
        job.tasks[i] = RepairTask('Fit ${substitute.name} ×${line.qty}');
      }
    }
    if (job.partsReserved) inv.reserve(line);
    job.log('Substitute part used',
        detail: '$oldName → ${substitute.name}',
        icon: Icons.swap_horiz_rounded);
    notifyListeners();
  }

  void startRepair(Job job) {
    job.status = JobStatus.inProgress;
    job.startedAt = DateTime.now();
    job.paused = false;
    job.log('Repair started',
        detail: 'Bay ${job.bay}', icon: Icons.build_circle_outlined);
    _sync(job, 'start', stage: 'Repair');
    notifyListeners();
  }

  void pauseJob(Job job) {
    if (job.status != JobStatus.inProgress) return;
    job.paused = true;
    job.log('Job paused', icon: Icons.pause_circle_outline_rounded);
    _sync(job, 'pause', stage: 'Repair');
    notifyListeners();
  }

  void resumeJob(Job job) {
    if (job.status != JobStatus.inProgress) return;
    job.paused = false;
    job.log('Job resumed', icon: Icons.play_circle_outline_rounded);
    _sync(job, 'resume', stage: 'Repair');
    notifyListeners();
  }

  /// Blocks complete unless checklist (when present) is fully done.
  bool canComplete(Job job) {
    if (job.status != JobStatus.qualityCheck && job.status != JobStatus.inProgress) {
      return false;
    }
    if (job.tasks.isEmpty) return true;
    return job.tasks.every((t) => t.done);
  }

  void toggleTask(Job job, RepairTask task) {
    task.done = !task.done;
    notifyListeners();
  }

  void addProgressPhoto(Job job) {
    job.progressPhotos++;
    job.log('Progress photo added', icon: Icons.photo_camera_outlined);
    notifyListeners();
  }

  void sendProgressUpdate(Job job, String message) {
    _sync(job, 'progress', stage: 'Repair', message: message, percent: (40 + job.taskProgress * 55).round());
    job.log('Update sent to customer',
        detail: message, icon: Icons.chat_bubble_outline);
    notifyListeners();
  }

  void moveToQualityCheck(Job job) {
    job.status = JobStatus.qualityCheck;
    job.log('Moved to quality check', icon: Icons.fact_check_outlined);
    notifyListeners();
  }

  void completeJob(Job job) {
    if (!canComplete(job) && job.status == JobStatus.inProgress) {
      moveToQualityCheck(job);
      return;
    }
    if (job.tasks.isNotEmpty && !job.tasks.every((t) => t.done)) {
      job.log('Complete blocked · checklist incomplete',
          icon: Icons.block_rounded);
      notifyListeners();
      return;
    }
    final estimate = job.estimate;
    if (estimate != null) {
      for (final line in estimate.lines) {
        AppServices.inventory.consume(line);
      }
    }
    job.status = JobStatus.completed;
    job.completedAt = DateTime.now();
    job.paused = false;
    _sync(job, 'complete');
    job.log('Job completed · invoice generated',
        icon: Icons.receipt_long_outlined);
    notifyListeners();
  }

  /// Converts a roadside SOS into a priority job at the top of the queue.
  Job addSosJob(SosRequest request) {
    final nextToken =
        _jobs.fold<int>(0, (m, j) => j.token > m ? j.token : m) + 1;
    final job = Job(
      id: 'JOB-${2000 + nextToken}',
      token: nextToken,
      vehicle: request.vehicle,
      customer: request.customer,
      serviceType: 'Roadside SOS – ${request.issue}',
      reportedSymptoms: [request.issue],
      slotTime: DateTime.now(),
      estimatedMinutes: 45,
      status: JobStatus.waiting,
      bay: 'Bay 1',
      scenario: 'battery',
      priority: JobPriority.sos,
    );
    job.log('Created from roadside SOS',
        detail: request.channelLabel, icon: Icons.sos_rounded);
    _jobs.add(job);
    AppServices.notifications.add(AppNotification(
      kind: NotificationKind.queue,
      title: 'Queue re-planned',
      body:
          'SOS job #${job.token} moved to the front. Waiting ETAs were updated.',
      time: DateTime.now(),
      jobId: job.id,
    ));
    notifyListeners();
    return job;
  }
}
