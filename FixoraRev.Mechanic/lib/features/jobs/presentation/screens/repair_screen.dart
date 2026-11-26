import 'package:flutter/material.dart';

import '../../../../core/di/app_services.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/utils/formatters.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/widgets/buttons.dart';
import '../../../../core/widgets/rev_common.dart';
import '../../domain/job_entities.dart';
import 'additional_repair_screen.dart';
import 'invoice_screen.dart';

// ------------------------------------------------------------- Repair

/// Repair checklist with live progress the customer can follow.
class RepairScreen extends StatelessWidget {
  const RepairScreen({super.key, required this.jobId});
  final String jobId;

  Future<void> _sendUpdate(BuildContext context, Job job) async {
    final done = job.tasks.where((t) => t.done).length;
    final controller = TextEditingController(
      text:
          'Hi ${job.customer.name.split(' ').first}, your ${job.vehicle.title} is '
          '${(job.taskProgress * 100).round()}% done ($done of ${job.tasks.length} steps).',
    );
    final message = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
            20, 0, 20, 20 + MediaQuery.viewInsetsOf(ctx).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Update to customer',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text('Shown in the Customer app repair tracker.',
                style: TextStyle(color: AppColors.inkSoft)),
            const SizedBox(height: 14),
            TextField(controller: controller, maxLines: 4, minLines: 3),
            const SizedBox(height: 16),
            PrimaryButton(
              label: 'Send update',
              icon: Icons.send_rounded,
              onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            ),
          ],
        ),
      ),
    );
    // Dispose after the sheet's closing animation has finished.
    Future<void>.delayed(const Duration(milliseconds: 500), controller.dispose);
    if (message != null && message.isNotEmpty) {
      AppServices.jobs.sendProgressUpdate(job, message);
      if (context.mounted) {
        context.toast('Update sent to ${job.customer.name}',
            icon: Icons.check_circle);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AppServices.jobs,
      builder: (context, _) {
        final job = AppServices.jobs.byId(jobId);
        final done = job.tasks.where((t) => t.done).length;
        final elapsed = DateTime.now()
            .difference(job.startedAt ?? DateTime.now())
            .inMinutes;
        final allDone = done == job.tasks.length; // a job with no steps can be submitted straight away
        final editable = job.status == JobStatus.inProgress;

        return Scaffold(
          appBar: AppBar(title: Text('Repair · #${job.token}')),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  gradient: AppColors.primaryGradient,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  children: [
                    SizedBox(
                      width: 78,
                      height: 78,
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          SizedBox(
                            width: 78,
                            height: 78,
                            child: CircularProgressIndicator(
                              value: job.taskProgress,
                              strokeWidth: 7,
                              color: AppColors.onPrimary,
                              backgroundColor: AppColors.onPrimary.withValues(alpha: 0.24),
                            ),
                          ),
                          Text('${(job.taskProgress * 100).round()}%',
                              style: TextStyle(
                                  color: AppColors.onPrimary,
                                  fontWeight: FontWeight.w900,
                                  fontSize: 18)),
                        ],
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${job.vehicle.title} · ${job.vehicle.plate}',
                              style: TextStyle(
                                  color: AppColors.onPrimary,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 15.5)),
                          const SizedBox(height: 4),
                          Text('$done of ${job.tasks.length} steps done',
                              style: TextStyle(color: AppColors.onPrimary)),
                          Text(
                            '$elapsed min of ${Fmt.minutes(job.estimatedMinutes)} · ${job.bay}',
                            style: TextStyle(
                              color: elapsed > job.estimatedMinutes
                                  ? const Color(0xFFFFE0E0)
                                  : AppColors.onPrimaryMuted,
                              fontSize: 12.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              if (editable) ...[
                const SectionTitle('Work control'),
                Row(
                  children: [
                    Expanded(
                      child: OutlineButtonX(
                        label: job.paused ? 'Resume' : 'Pause',
                        icon: job.paused ? Icons.play_arrow_rounded : Icons.pause_rounded,
                        onPressed: () {
                          if (job.paused) {
                            AppServices.jobs.resumeJob(job);
                          } else {
                            AppServices.jobs.pauseJob(job);
                          }
                        },
                      ),
                    ),
                  ],
                ),
                if (job.paused)
                  Padding(
                    padding: const EdgeInsets.only(top: 8, bottom: 4),
                    child: Text('Paused — customer ETA holds until you resume.',
                        style: TextStyle(color: AppColors.warning, fontWeight: FontWeight.w600)),
                  ),
              ],
              const SectionTitle('Checklist'),
              if (job.tasks.isEmpty)
                const AppCard(
                  child: EmptyState(
                    compact: true,
                    icon: Icons.checklist_rounded,
                    title: 'No checklist steps for this job',
                    message: 'The approved work had no separate steps. Add a progress photo, then submit for review.',
                  ),
                )
              else
              AppCard(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Column(
                  children: [
                    for (final t in job.tasks)
                      InkWell(
                        onTap: editable
                            ? () => AppServices.jobs.toggleTask(job, t)
                            : null,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 12),
                          child: Row(
                            children: [
                              AnimatedContainer(
                                duration: const Duration(milliseconds: 180),
                                width: 24,
                                height: 24,
                                decoration: BoxDecoration(
                                  color:
                                      t.done ? AppColors.primary : AppColors.surface,
                                  borderRadius: BorderRadius.circular(7),
                                  border: Border.all(
                                      color: t.done
                                          ? AppColors.primary
                                          : AppColors.muted,
                                      width: 1.6),
                                ),
                                child: t.done
                                    ? Icon(Icons.check_rounded,
                                        size: 17, color: AppColors.onPrimary)
                                    : null,
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Text(
                                  t.title,
                                  style: TextStyle(
                                    fontWeight: FontWeight.w600,
                                    color: t.done
                                        ? AppColors.inkSoft
                                        : AppColors.ink,
                                    decoration: t.done
                                        ? TextDecoration.lineThrough
                                        : null,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SectionTitle('Keep the customer informed'),
              // Secondary actions, one per row (the main action is the bar at the bottom).
              OutlineButtonX(
                label: 'Add progress photo (${job.progressPhotos})',
                icon: Icons.add_a_photo_outlined,
                onPressed: editable
                    ? () {
                        AppServices.jobs.addProgressPhoto(job);
                        context.toast('Progress photo attached',
                            icon: Icons.photo_camera);
                      }
                    : null,
              ),
              const SizedBox(height: 10),
              OutlineButtonX(
                label: 'Send update to customer',
                icon: Icons.chat_bubble_outline_rounded,
                onPressed:
                    editable ? () => _sendUpdate(context, job) : null,
              ),
              if (editable) ...[
                const SizedBox(height: 12),
                OutlineButtonX(
                  label: 'Additional problem found?',
                  icon: Icons.add_circle_outline_rounded,
                  onPressed: () => context.push(
                    AdditionalRepairScreen(jobId: job.id),
                  ),
                ),
              ],
            ],
          ),
          bottomNavigationBar: BottomActionBar(
            child: PrimaryButton(
              label: allDone
                  ? 'Submit Work for Manager Review'
                  : 'Finish all steps to continue',
              icon: Icons.fact_check_outlined,
              onPressed: allDone && editable
                  ? () {
                      AppServices.jobs.moveToQualityCheck(job);
                      context.replaceWith(QualityCheckScreen(jobId: job.id));
                    }
                  : null,
            ),
          ),
        );
      },
    );
  }
}

// ------------------------------------------------------------- QC

class QualityCheckScreen extends StatefulWidget {
  const QualityCheckScreen({super.key, required this.jobId});
  final String jobId;

  @override
  State<QualityCheckScreen> createState() => _QualityCheckScreenState();
}

class _QualityCheckScreenState extends State<QualityCheckScreen> {
  static const _checks = [
    'Road test completed',
    'No warning lights on the dashboard',
    'Fault codes cleared and re-scanned',
    'Fluid levels and leaks checked',
    'Old parts bagged for the customer',
    'Vehicle cleaned, seat & floor covers removed',
  ];

  final Set<int> _done = {};
  final _note = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _complete(Job job) async {
    setState(() => _saving = true);
    await Future<void>.delayed(const Duration(milliseconds: 900));
    if (_note.text.trim().isNotEmpty) {
      AppServices.jobs.sendProgressUpdate(job, 'QC note: ${_note.text.trim()}');
    }
    AppServices.jobs.completeJob(job);
    if (!mounted) return;
    context.replaceWith(InvoiceScreen(jobId: job.id, justCompleted: true));
  }

  @override
  Widget build(BuildContext context) {
    final job = AppServices.jobs.byId(widget.jobId);
    final allDone = _done.length == _checks.length;
    return Scaffold(
      appBar: AppBar(title: Text('Quality check · #${job.token}')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          AppCard(
            color: AppColors.infoSoft,
            borderColor: AppColors.info.withValues(alpha: 0.25),
            child: Row(
              children: [
                Icon(Icons.verified_user_outlined, color: AppColors.info),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                      'Confirm every check before handing the vehicle back.',
                      style: TextStyle(
                          color: AppColors.info, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          AppCard(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Column(
              children: [
                for (var i = 0; i < _checks.length; i++)
                  CheckboxListTile(
                    value: _done.contains(i),
                    activeColor: AppColors.primary,
                    controlAffinity: ListTileControlAffinity.leading,
                    title: Text(_checks[i],
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    onChanged: (v) => setState(
                        () => v == true ? _done.add(i) : _done.remove(i)),
                  ),
              ],
            ),
          ),
          const SectionTitle('Final note (optional)'),
          TextField(
            controller: _note,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
                hintText: 'E.g. Rotors bedded in, recheck in 1,000 km'),
          ),
        ],
      ),
      bottomNavigationBar: BottomActionBar(
        child: PrimaryButton(
          label: 'Complete job & generate invoice',
          loadingLabel: 'Completing…',
          icon: Icons.task_alt_rounded,
          loading: _saving,
          onPressed: allDone ? () => _complete(job) : null,
        ),
      ),
    );
  }
}
