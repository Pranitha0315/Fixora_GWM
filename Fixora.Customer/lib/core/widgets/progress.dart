import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

enum StepState2 { done, current, pending }

/// Green check / blue ring / grey ring step dot.
class StepDot extends StatelessWidget {
  final StepState2 state;
  final double size;
  const StepDot({super.key, required this.state, this.size = 30});

  @override
  Widget build(BuildContext context) {
    switch (state) {
      case StepState2.done:
        return Container(
          width: size,
          height: size,
          decoration: const BoxDecoration(
            gradient: AppColors.successGradient,
            shape: BoxShape.circle,
          ),
          child: Icon(Icons.check_rounded, color: Colors.white, size: size * 0.62),
        );
      case StepState2.current:
        return Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: AppColors.primary, width: 3),
            color: AppColors.primarySoft,
          ),
          child: Center(
            child: Container(
              width: size * 0.36,
              height: size * 0.36,
              decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
            ),
          ),
        );
      case StepState2.pending:
        return Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: AppColors.surface,
            shape: BoxShape.circle,
            border: Border.all(color: const Color(0xFFBBD4D2), width: 1.6),
          ),
          child: Center(
            child: Container(
              width: size * 0.22,
              height: size * 0.22,
              decoration: const BoxDecoration(color: Color(0xFFBBD4D2), shape: BoxShape.circle),
            ),
          ),
        );
    }
  }
}

/// Vertical timeline (Repair In Progress screen).
class VerticalTimeline extends StatelessWidget {
  final List<String> titles;
  final List<String?> subtitles;
  final int current; // index of current step; titles.length = all done

  const VerticalTimeline({
    super.key,
    required this.titles,
    required this.subtitles,
    required this.current,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(titles.length, (i) {
        final state = i < current
            ? StepState2.done
            : i == current
                ? StepState2.current
                : StepState2.pending;
        final last = i == titles.length - 1;
        return IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                width: 40,
                child: Column(
                  children: [
                    const SizedBox(height: 6),
                    StepDot(state: state, size: state == StepState2.pending ? 26 : 32),
                    if (!last)
                      Expanded(
                        child: Container(
                          width: 2.5,
                          margin: const EdgeInsets.symmetric(vertical: 4),
                          decoration: BoxDecoration(
                            color: i < current ? AppColors.success : AppColors.adapt(const Color(0xFFD6E7E5)),
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.only(top: 4, bottom: 18),
                  decoration: BoxDecoration(
                    border: last ? null : Border(bottom: BorderSide(color: AppColors.divider)),
                  ),
                  margin: EdgeInsets.only(bottom: last ? 0 : 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        titles[i],
                        style: TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.w700,
                          color: state == StepState2.pending ? AppColors.textFaint : AppColors.navy,
                        ),
                      ),
                      if (subtitles[i] != null) ...[
                        const SizedBox(height: 3),
                        Text(
                          subtitles[i]!,
                          style: TextStyle(
                            fontSize: 14.5,
                            color: state == StepState2.current ? AppColors.primary : AppColors.textMuted,
                            fontWeight: state == StepState2.current ? FontWeight.w600 : FontWeight.w400,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      }),
    );
  }
}
