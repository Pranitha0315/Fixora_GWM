import 'package:flutter/material.dart';

import '../../../core/core.dart';
import 'service_completed_screen.dart';
import 'view_photos_screen.dart';

/// "Repair In Progress" - vertical timeline + mechanic update.
class RepairProgressScreen extends StatelessWidget {
  const RepairProgressScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = JobStore.instance;
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final done = store.status == JobStatus.completed || store.status == JobStatus.paid;
        final current = done ? MockData.progressSteps.length : store.progress;
        final photos = store.media.where((m) => m.kind == MediaKind.photo).toList();
        return FxPage(
          title: done ? 'Repair Completed' : 'Repair In Progress',
          children: [
            FadeSlide(
              child: FxCard(
                padding: const EdgeInsets.fromLTRB(18, 18, 18, 8),
                child: Column(
                  children: [
                    Text(done ? 'All Steps Completed' : 'Repair In Progress',
                        textAlign: TextAlign.center, style: AppText.h1),
                    const SizedBox(height: 4),
                    Text('${store.vehicle.name} · ${store.vehicle.plate}',
                        style: AppText.muted.copyWith(fontSize: 13)),
                    const SizedBox(height: 18),
                    VerticalTimeline(
                      titles: MockData.progressSteps,
                      current: current,
                      subtitles: List.generate(MockData.progressSteps.length, (i) {
                        if (i < current) return dayTime(MockData.progressTimes[i]);
                        if (i == current) return 'In Progress...';
                        return null;
                      }),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
            FadeSlide(
              index: 1,
              child: FxCard(
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    const IconTile(icon: Icons.event_available_rounded, size: 46),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(done ? 'Ready for pickup now' : 'Estimated delivery',
                              style: AppText.small.copyWith(color: AppColors.navy)),
                          const SizedBox(height: 2),
                          Text(done ? 'Collect before 7:00 PM today' : 'Today, 04:30 PM',
                              style: AppText.h2.copyWith(fontSize: 17)),
                          if (!done) ...[
                            const SizedBox(height: 2),
                            Text('Revised from 4:00 PM · waiting 20 min for alignment bay',
                                style: AppText.small.copyWith(fontSize: 11)),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
            FadeSlide(
              index: 2,
              child: MechanicUpdateCard(
                name: MockData.mechanicName,
                message: done
                    ? 'Test drive OK. Temperature now steady at 90 °C. Car washed and ready.'
                    : 'Installing new thermostat. Will complete soon.',
                time: 'Today, 02:30 PM',
              ),
            ),
            const SizedBox(height: 16),
            FadeSlide(
              index: 3,
              child: PrimaryButton(
                label: 'View Photos',
                icon: Icons.photo_library_outlined,
                onPressed: () => context.push(const ViewPhotosScreen()),
              ),
            ),
            const SizedBox(height: 10),
            if (done)
              OutlineButton2(
                label: 'View Service Summary',
                icon: Icons.celebration_outlined,
                onPressed: () => context.push(const ServiceCompletedScreen()),
              )
            else
              Center(
                child: TextButton.icon(
                  onPressed: () {
                    store.advance();
                    showFxSnack(context, 'Demo: job moved to the next step',
                        icon: Icons.fast_forward_rounded);
                  },
                  icon: const Icon(Icons.fast_forward_rounded, size: 18),
                  label: const Text('Demo: simulate next update'),
                ),
              ),
            Text('${photos.length} photos shared by the workshop',
                textAlign: TextAlign.center, style: AppText.small),
          ],
        );
      },
    );
  }
}

