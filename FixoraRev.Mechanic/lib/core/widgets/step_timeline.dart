import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';
import '../../app/theme/app_typography.dart';

class TimelineStep {
  const TimelineStep({required this.title, this.subtitle});
  final String title;
  final String? subtitle;
}

/// Vertical timeline: steps before [current] are done, [current] is active.
class StepTimeline extends StatelessWidget {
  const StepTimeline({super.key, required this.steps, required this.current});

  final List<TimelineStep> steps;
  final int current;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var i = 0; i < steps.length; i++)
          _row(steps[i], done: i < current, active: i == current, last: i == steps.length - 1),
      ],
    );
  }

  Widget _row(TimelineStep step, {required bool done, required bool active, required bool last}) {
    final Color dotColor = done ? AppColors.primary : (active ? AppColors.surface : AppColors.surface);
    final Color ring = done || active ? AppColors.primary : AppColors.border;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 28,
            child: Column(
              children: [
                Container(
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    color: dotColor,
                    shape: BoxShape.circle,
                    border: Border.all(color: ring, width: active ? 6 : 2),
                  ),
                  child: done ? Icon(Icons.check_rounded, size: 15, color: AppColors.onPrimary) : null,
                ),
                if (!last)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 2),
                      color: done ? AppColors.primary : AppColors.border,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: last ? 0 : 18, top: 2),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    step.title,
                    style: AppText.bodyStrong.copyWith(
                      color: done || active ? AppColors.ink : AppColors.muted,
                      fontWeight: active ? FontWeight.w800 : FontWeight.w600,
                    ),
                  ),
                  if (step.subtitle != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(step.subtitle!, style: AppText.caption),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
