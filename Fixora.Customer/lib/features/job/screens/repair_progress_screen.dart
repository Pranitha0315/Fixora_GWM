import 'package:flutter/material.dart';

import '../../../core/navigation/nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/progress.dart';
import '../../../data/models/models.dart';
import '../../../data/repositories/job_store.dart';
import 'view_photos_screen.dart';

/// "Repair In Progress" - vertical timeline + mechanic update.
class RepairProgressScreen extends StatelessWidget {
  const RepairProgressScreen({super.key});

  static String _dayTime(DateTime d) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
    final m = d.minute.toString().padLeft(2, '0');
    final ap = d.hour >= 12 ? 'PM' : 'AM';
    return '${d.day} ${months[d.month - 1]}, $h:$m $ap';
  }

  @override
  Widget build(BuildContext context) {
    final store = JobStore.instance;
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final done = store.status == JobStatus.completed || store.status == JobStatus.paid;
        final current = done ? JobStore.progressSteps.length : store.progress;
        final photos = store.media.where((m) => m.kind == MediaKind.photo).toList();
        return Scaffold(
          backgroundColor: AppColors.bg,
          appBar: AppBar(
            title: Text(done ? 'Repair Completed' : 'Repair In Progress'),
            backgroundColor: AppColors.bg,
            foregroundColor: AppColors.navy,
            elevation: 0,
          ),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
            children: [
              Container(
                padding: const EdgeInsets.fromLTRB(18, 18, 18, 8),
                decoration: BoxDecoration(
                  color: AppColors.surfaceSolid,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppColors.border),
                ),
                child: Column(
                  children: [
                    Text(
                      done ? 'All Steps Completed' : 'Repair In Progress',
                      textAlign: TextAlign.center,
                      style: AppText.h1,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${store.vehicle.name} · ${store.vehicle.plate}',
                      style: AppText.muted.copyWith(fontSize: 13),
                    ),
                    const SizedBox(height: 18),
                    VerticalTimeline(
                      titles: JobStore.progressSteps,
                      current: current,
                      subtitles: List.generate(JobStore.progressSteps.length, (i) {
                        if (i < current) return _dayTime(JobStore.progressTimes[i]);
                        if (i == current) return 'In Progress...';
                        return null;
                      }),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.surfaceSolid,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 46,
                      height: 46,
                      decoration: BoxDecoration(
                        color: AppColors.primarySoft,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(Icons.event_available_rounded, color: AppColors.link),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            done ? 'Ready for pickup now' : 'Estimated delivery',
                            style: AppText.small.copyWith(color: AppColors.navy),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            done ? 'Collect before 7:00 PM today' : 'Today, 04:30 PM',
                            style: AppText.h2.copyWith(fontSize: 17),
                          ),
                          if (!done) ...[
                            const SizedBox(height: 2),
                            Text(
                              'Revised from 4:00 PM · waiting 20 min for alignment bay',
                              style: AppText.small.copyWith(fontSize: 11),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.surfaceSolid,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 54,
                      height: 58,
                      decoration: BoxDecoration(
                        color: AppColors.primarySoft,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Icon(Icons.engineering_outlined, color: AppColors.link),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Kasun Perera', style: AppText.h3),
                          Text('Today, 02:30 PM', style: AppText.small),
                          const SizedBox(height: 6),
                          Text(
                            done
                                ? 'Test drive OK. Temperature now steady at 90 °C. Car washed and ready.'
                                : 'Installing new thermostat. Will complete soon.',
                            style: AppText.body.copyWith(fontSize: 13.5),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                height: 50,
                child: FilledButton.icon(
                  onPressed: () => context.push(const ViewPhotosScreen()),
                  icon: const Icon(Icons.photo_library_outlined),
                  label: const Text('View Photos'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              if (!done)
                Center(
                  child: TextButton.icon(
                    onPressed: () {
                      store.advance();
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Demo: job moved to the next step'),
                          behavior: SnackBarBehavior.floating,
                        ),
                      );
                    },
                    icon: const Icon(Icons.fast_forward_rounded, size: 18),
                    label: const Text('Demo: simulate next update'),
                  ),
                ),
              Text(
                '${photos.length} photos shared by the workshop',
                textAlign: TextAlign.center,
                style: AppText.small,
              ),
            ],
          ),
        );
      },
    );
  }
}
