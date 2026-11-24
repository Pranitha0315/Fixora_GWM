import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import '../../data/models/models.dart';

class SegItem {
  final IconData? icon;
  final String label;
  const SegItem(this.label, [this.icon]);
}

/// Three-button segmented tabs (Service | Live Data | Media).
class FxSegmented extends StatelessWidget {
  final List<SegItem> items;
  final int index;
  final ValueChanged<int> onChanged;
  final double height;

  const FxSegmented({
    super.key,
    required this.items,
    required this.index,
    required this.onChanged,
    this.height = 46,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) const SizedBox(width: 8),
          Expanded(
            child: GestureDetector(
              onTap: () => onChanged(i),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 260),
                curve: Curves.easeOutCubic,
                height: height,
                decoration: BoxDecoration(
                  gradient: i == index ? AppColors.primaryGradient : null,
                  color: i == index ? null : AppColors.surface,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: i == index ? Colors.transparent : AppColors.border,
                  ),
                  boxShadow: i == index ? AppShadows.button : AppShadows.soft,
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (items[i].icon != null) ...[
                      Icon(items[i].icon,
                          size: 19, color: i == index ? Colors.white : AppColors.navy),
                      const SizedBox(width: 7),
                    ],
                    Flexible(
                      child: Text(
                        items[i].label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: i == index ? Colors.white : AppColors.navy,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// Horizontal chip filter (All (5) | Before (1) ...).
class FxChipTabs extends StatelessWidget {
  final List<String> labels;
  final int index;
  final ValueChanged<int> onChanged;
  const FxChipTabs({super.key, required this.labels, required this.index, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        itemCount: labels.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final sel = i == index;
          return GestureDetector(
            onTap: () => onChanged(i),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              padding: const EdgeInsets.symmetric(horizontal: 18),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                gradient: sel ? AppColors.primaryGradient : null,
                color: sel ? null : AppColors.surface,
                borderRadius: BorderRadius.circular(22),
                border: Border.all(color: sel ? Colors.transparent : AppColors.border),
              ),
              child: Text(
                labels[i],
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                  color: sel ? Colors.white : AppColors.navy,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

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
        return _PulsingRing(size: size);
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

class _PulsingRing extends StatefulWidget {
  final double size;
  const _PulsingRing({required this.size});

  @override
  State<_PulsingRing> createState() => _PulsingRingState();
}

class _PulsingRingState extends State<_PulsingRing> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.size;
    return SizedBox(
      width: s,
      height: s,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, child) {
          final t = _c.value;
          return Stack(
            alignment: Alignment.center,
            clipBehavior: Clip.none,
            children: [
              Transform.scale(
                scale: 1 + 0.5 * t,
                child: Container(
                  width: s,
                  height: s,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.primary.o(0.25 * (1 - t)),
                  ),
                ),
              ),
              child!,
            ],
          );
        },
        child: Container(
          width: s,
          height: s,
          decoration: BoxDecoration(
            color: AppColors.surface,
            shape: BoxShape.circle,
            border: Border.all(color: AppColors.primary, width: s * 0.2),
          ),
        ),
      ),
    );
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
                            color: i < current ? AppColors.success : AppColors.adapt(Color(0xFFD6E7E5)),
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
                    border: last
                        ? null
                        : Border(bottom: BorderSide(color: AppColors.divider)),
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
                          color: state == StepState2.pending
                              ? AppColors.textFaint
                              : AppColors.navy,
                        ),
                      ),
                      if (subtitles[i] != null) ...[
                        const SizedBox(height: 3),
                        Text(
                          subtitles[i]!,
                          style: TextStyle(
                            fontSize: 14.5,
                            color: state == StepState2.current
                                ? AppColors.primary
                                : AppColors.textMuted,
                            fontWeight:
                                state == StepState2.current ? FontWeight.w600 : FontWeight.w400,
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

/// Horizontal stepper with labels below (Live Progress).
class HorizontalProgress extends StatelessWidget {
  final List<String> titles;
  final List<String?> subtitles;
  final int current;
  final double dot;

  const HorizontalProgress({
    super.key,
    required this.titles,
    required this.subtitles,
    required this.current,
    this.dot = 26,
  });

  @override
  Widget build(BuildContext context) {
    final n = titles.length;
    return Column(
      children: [
        SizedBox(
          height: dot + 8,
          child: Row(
            children: List.generate(n * 2 - 1, (k) {
              if (k.isOdd) {
                final i = k ~/ 2;
                return Expanded(
                  child: Container(
                    height: 3,
                    decoration: BoxDecoration(
                      color: i < current ? AppColors.success : AppColors.adapt(Color(0xFFD6E7E5)),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                );
              }
              final i = k ~/ 2;
              final state = i < current
                  ? StepState2.done
                  : i == current
                      ? StepState2.current
                      : StepState2.pending;
              return StepDot(state: state, size: state == StepState2.pending ? dot - 4 : dot);
            }),
          ),
        ),
        const SizedBox(height: 6),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: List.generate(n, (i) {
            final align = i == 0
                ? TextAlign.left
                : i == n - 1
                    ? TextAlign.right
                    : TextAlign.center;
            return Expanded(
              child: Column(
                crossAxisAlignment: i == 0
                    ? CrossAxisAlignment.start
                    : i == n - 1
                        ? CrossAxisAlignment.end
                        : CrossAxisAlignment.center,
                children: [
                  Text(
                    titles[i],
                    textAlign: align,
                    style: TextStyle(
                      fontSize: 10.5,
                      height: 1.2,
                      fontWeight: i == current ? FontWeight.w700 : FontWeight.w600,
                      color: i == current
                          ? AppColors.primary
                          : i < current
                              ? AppColors.navy
                              : AppColors.textMuted,
                    ),
                  ),
                  if (subtitles[i] != null) ...[
                    const SizedBox(height: 2),
                    Text(subtitles[i]!,
                        textAlign: align,
                        style: AppText.small.copyWith(fontSize: 9.5)),
                  ],
                ],
              ),
            );
          }),
        ),
      ],
    );
  }
}

/// Animated linear progress bar.
class FxProgressBar extends StatelessWidget {
  final double value;
  final Color color;
  final double height;
  final Color? track;
  const FxProgressBar({
    super.key,
    required this.value,
    this.color = AppColors.primary,
    this.height = 8,
    this.track,
  });

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(height),
      child: Container(
        height: height,
        width: double.infinity,
        color: track ?? color.o(0.12),
        child: TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: value.clamp(0.0, 1.0).toDouble()),
          duration: const Duration(milliseconds: 900),
          curve: Curves.easeOutCubic,
          builder: (context, v, _) => FractionallySizedBox(
            alignment: Alignment.centerLeft,
            widthFactor: v,
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [color.o(0.75), color]),
                borderRadius: BorderRadius.circular(height),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Dotted progress track like the reference: done = filled line,
/// current = round icon, later = dashed.
class DotsProgress extends StatelessWidget {
  final int current;
  final int count;
  final IconData icon;
  const DotsProgress({super.key, required this.current, this.count = 4, this.icon = Icons.build_rounded});

  @override
  Widget build(BuildContext context) {
    final on = AppColors.primary;
    final off = AppColors.dark ? const Color(0xFF3A474D) : const Color(0xFFC7CED2);
    Widget dot(bool done) => Container(width: 10, height: 10, decoration: BoxDecoration(shape: BoxShape.circle, color: done ? on : off));
    Widget line(bool done) => Expanded(
          child: done
              ? Container(height: 3, decoration: BoxDecoration(color: on, borderRadius: BorderRadius.circular(2)))
              : LayoutBuilder(
                  builder: (context, c) {
                    final n = (c.maxWidth / 10).floor().clamp(1, 60);
                    return Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        for (var i = 0; i < n; i++)
                          Container(width: 5, height: 3, decoration: BoxDecoration(color: off, borderRadius: BorderRadius.circular(2))),
                      ],
                    );
                  },
                ),
        );
    return Semantics(
      label: 'Step ${current + 1} of $count',
      excludeSemantics: true,
      child: Row(
        children: [
          for (var i = 0; i < count; i++) ...[
            if (i == current)
              Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(shape: BoxShape.circle, color: on),
                child: Icon(icon, size: 13, color: Colors.white),
              )
            else
              dot(i < current),
            if (i < count - 1) line(i < current),
          ],
        ],
      ),
    );
  }
}

/// Which dot of [DotsProgress] (0 booked · 1 diagnosis · 2 repair · 3 done)
/// a job status sits on.
int jobStep(JobStatus s) => switch (s) {
      JobStatus.diagnosis => 1,
      JobStatus.awaitingApproval || JobStatus.changesRequested || JobStatus.inProgress => 2,
      JobStatus.completed || JobStatus.paid => 3,
    };
