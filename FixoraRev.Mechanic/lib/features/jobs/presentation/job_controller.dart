import 'package:flutter/material.dart';

import '../../../core/backend/mechanic_backend.dart';
import '../domain/job_entities.dart';

/// The mechanic's job cards and the live queue, mirrored from the garage server.
/// Each lifecycle action is sent to the backend (`POST /mechanic/jobs/{id}/actions`).
class JobController extends ChangeNotifier {
  JobController(this._jobs);

  final List<Job> _jobs;

  List<Job> get all => List.unmodifiable(_jobs);

  /// Replaces the jobs with the mechanic's assigned job cards from the backend.
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

  Job byId(String id) => _jobs.firstWhere((j) => j.id == id);

  /// Sends a lifecycle step to the backend. The manager and customer follow it in real time.
  void _sync(Job job, String action, {String? stage, String? message, int? percent}) {
    final be = MechanicBackend.instance;
    if (!be.live) return;
    be.jobAction(job.id, action, stage: stage, message: message, percent: percent).catchError((Object _) {});
  }

  int _statusGroup(JobStatus s) => switch (s) {
        JobStatus.inProgress => 0,
        JobStatus.diagnosing => 1,
        JobStatus.awaitingApproval => 2,
        JobStatus.waiting => 3,
        JobStatus.completed => 4,
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
      if (j.status == JobStatus.inProgress || j.status == JobStatus.diagnosing) {
        return j;
      }
    }
    return null;
  }

  /// Rolling ETA for jobs still waiting: starts after the work in hand and
  /// adds each job's estimated duration. Recomputed on every change.
  DateTime? etaFor(Job job) {
    if (job.status != JobStatus.waiting) return null;
    var cursor = DateTime.now();
    for (final j in queue) {
      if (j.status == JobStatus.inProgress) {
        final started = j.startedAt ?? DateTime.now();
        final end = started.add(Duration(minutes: j.estimatedMinutes));
        if (end.isAfter(cursor)) cursor = end;
      }
    }
    for (final j in queue) {
      if (j.status != JobStatus.waiting) continue;
      if (j.id == job.id) return cursor;
      cursor = cursor.add(Duration(minutes: j.estimatedMinutes));
    }
    return cursor;
  }

  int positionOf(Job job) {
    final waiting = queue.where((j) => j.status == JobStatus.waiting).toList();
    return waiting.indexWhere((j) => j.id == job.id) + 1;
  }

  // ---- Stats for the dashboard ----
  int get waitingCount => _jobs.where((j) => j.status == JobStatus.waiting).length;
  int get activeCount => _jobs.where((j) => j.status.isActive && j.status != JobStatus.waiting).length;
  int get completedToday => _jobs.where((j) => j.status == JobStatus.completed).length;
  int get totalToday => _jobs.length;

  // ---- FixProof ----

  /// FixProof capture started: a waiting job moves into inspection (backend action "start").
  void startFixProof(Job job) {
    if (job.status == JobStatus.waiting) {
      job.status = JobStatus.diagnosing;
      job.startedAt ??= DateTime.now();
      _sync(job, 'start', stage: 'Inspection');
    }
    job.log('FixProof inspection started', icon: Icons.photo_camera_rounded);
    notifyListeners();
  }

  /// The FixProof report was sent for review. The backend moves the job to
  /// Awaiting Review; the list is refreshed from the server.
  void publishFixProof(Job job, {required int issues}) {
    job.log('FixProof report sent for review',
        detail: '$issues issue${issues == 1 ? '' : 's'} verified by mechanic',
        icon: Icons.verified_rounded);
    notifyListeners();
  }

  // ---- Lifecycle (backend actions: start, pause, resume, progress, complete) ----

  void startRepair(Job job) {
    job.status = JobStatus.inProgress;
    job.startedAt = DateTime.now();
    job.paused = false;
    job.log('Repair started', detail: 'Bay ${job.bay}', icon: Icons.build_circle_outlined);
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

  void sendProgressUpdate(Job job, String message) {
    _sync(job, 'progress', stage: 'Repair', message: message);
    job.log('Update sent to customer', detail: message, icon: Icons.chat_bubble_outline);
    notifyListeners();
  }

  void completeJob(Job job) {
    job.status = JobStatus.completed;
    job.completedAt = DateTime.now();
    job.paused = false;
    _sync(job, 'complete');
    job.log('Job completed', icon: Icons.check_circle_outline_rounded);
    notifyListeners();
  }
}
