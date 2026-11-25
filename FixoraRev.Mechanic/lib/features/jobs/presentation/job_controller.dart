import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/backend/mechanic_backend.dart';
import '../domain/job_entities.dart';

/// The mechanic's job cards and the live queue (BRD USP 5).
class JobController extends ChangeNotifier {
  JobController() {
    _jobs.addAll(_demoJobs);
  }

  final List<Job> _jobs = [];

  List<Job> get all => List.unmodifiable(_jobs);

  Job? get currentJob {
    final working = _jobs.where(
      (j) =>
          j.status == JobStatus.diagnosing ||
          j.status == JobStatus.inProgress,
    );
    if (working.isEmpty) return null;
    return working.first;
  }

  /// Replaces the demo jobs with the mechanic's assigned job cards from the backend.
  void replaceAll(List<Job> jobs) {
    _jobs
      ..clear()
      ..addAll(jobs);
    notifyListeners();
  }

  Job? byId(String id) {
    for (final j in _jobs) {
      if (j.id == id) return j;
    }
    return null;
  }

  void setStatus(String jobId, JobStatus status) {
    final job = byId(jobId);
    if (job == null) return;
    job.status = status;
    notifyListeners();
  }

  void startDiagnosis(Job job) {
    if (job.status == JobStatus.waiting) {
      job.status = JobStatus.diagnosing;
      job.startedAt ??= DateTime.now();
      job.paused = false;
      job.log('Diagnosis started', icon: Icons.troubleshoot_rounded);
      notifyListeners();
      unawaited(
        MechanicBackend.instance.jobAction(job.id, 'start_diagnosis'),
      );
    }
  }

  void customerApproved(Job job) {
    if (job.status != JobStatus.awaitingApproval) return;
    job.status = JobStatus.approved;
    job.log('Customer approved proposal', icon: Icons.check_circle_outline);
    notifyListeners();
  }

  bool canComplete(Job job) =>
      job.status == JobStatus.inProgress &&
      !job.paused &&
      job.progressPercent >= 80;

  void setProgress(String jobId, int percent, String? message) {
    final job = byId(jobId);
    if (job == null) return;
    job.progressPercent = percent.clamp(0, 100);
    final detail = message != null && message.isNotEmpty
        ? '$percent% — $message'
        : '$percent%';
    job.log('Progress update', detail: detail, icon: Icons.trending_up);
    notifyListeners();
  }

  void startRepair(Job job) {
    if (job.status == JobStatus.awaitingApproval) return;
    if (job.status != JobStatus.approved) return;
    job.status = JobStatus.inProgress;
    job.startedAt = DateTime.now();
    job.paused = false;
    job.log(
      'Repair started',
      detail: job.bay != null ? 'Bay ${job.bay}' : null,
      icon: Icons.build_circle_outlined,
    );
    notifyListeners();
    unawaited(MechanicBackend.instance.jobAction(job.id, 'start_repair'));
  }

  void pauseJob(Job job) {
    if (job.status != JobStatus.inProgress &&
        job.status != JobStatus.diagnosing) {
      return;
    }
    job.paused = true;
    // 'Paused' stays JobStatus.inProgress (or diagnosing) with paused flag.
    job.log('Paused', icon: Icons.pause_circle_outline);
    notifyListeners();
    unawaited(MechanicBackend.instance.jobAction(job.id, 'pause'));
  }

  void resumeJob(Job job) {
    job.paused = false;
    job.log('Resumed', icon: Icons.play_circle_outline);
    notifyListeners();
    unawaited(MechanicBackend.instance.jobAction(job.id, 'resume'));
  }

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

  List<Job> get finished =>
      _jobs.where((j) => !j.status.isActive).toList(growable: false);

  /// Jobs that have a bay assignment (for board cards).
  List<Job> get bayJobs {
    final list = _jobs.where((j) => j.bay != null && j.bay!.isNotEmpty).toList();
    list.sort((a, b) => (a.bay ?? '').compareTo(b.bay ?? ''));
    return list;
  }

  int _statusGroup(JobStatus s) {
    if (s == JobStatus.diagnosing || s == JobStatus.inProgress) return 0;
    if (s == JobStatus.awaitingApproval || s == JobStatus.qualityCheck) {
      return 1;
    }
    return 2;
  }
}

final _demoJobs = <Job>[
  Job(
    id: 'job-1',
    token: 'A12',
    vehicleReg: 'KA-01-AB-1234',
    vehicleModel: 'Swift Dzire',
    customerName: 'Ravi Kumar',
    summary: 'Brake inspection + pad check',
    status: JobStatus.inProgress,
    priority: JobPriority.high,
    bay: 'Bay 2',
  ),
  Job(
    id: 'job-2',
    token: 'A18',
    vehicleReg: 'TN-09-XY-7788',
    vehicleModel: 'Honda City',
    customerName: 'Meena S',
    summary: 'Oil service + filter',
    status: JobStatus.waiting,
    priority: JobPriority.normal,
    bay: 'Bay 1',
  ),
  Job(
    id: 'job-3',
    token: 'B04',
    vehicleReg: 'MH-12-CD-4411',
    vehicleModel: 'Creta',
    customerName: 'Arjun P',
    summary: 'AC not cooling — diagnosis',
    status: JobStatus.diagnosing,
    priority: JobPriority.urgent,
    bay: 'Bay 3',
  ),
  Job(
    id: 'job-4',
    token: 'B09',
    vehicleReg: 'KL-07-EF-2200',
    vehicleModel: 'Innova',
    customerName: 'Fathima',
    summary: 'Awaiting customer approval',
    status: JobStatus.awaitingApproval,
    priority: JobPriority.normal,
  ),
  Job(
    id: 'job-5',
    token: 'C02',
    vehicleReg: 'AP-16-GH-9090',
    vehicleModel: 'Baleno',
    customerName: 'Suresh',
    summary: 'Approved — start repair',
    status: JobStatus.approved,
    priority: JobPriority.high,
    bay: 'Bay 4',
  ),
  Job(
    id: 'job-6',
    token: 'C11',
    vehicleReg: 'GJ-01-IJ-5555',
    vehicleModel: 'Venue',
    customerName: 'Neha',
    summary: 'Quality check pending',
    status: JobStatus.qualityCheck,
    priority: JobPriority.normal,
    bay: 'Bay 2',
  ),
  Job(
    id: 'job-7',
    token: 'D01',
    vehicleReg: 'RJ-14-KL-3333',
    vehicleModel: 'i20',
    customerName: 'Vikram',
    summary: 'Battery replacement done',
    status: JobStatus.completed,
    priority: JobPriority.low,
    bay: 'Bay 1',
  ),
];
