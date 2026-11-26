import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_typography.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/common.dart';
import '../../../../core/widgets/rev_common.dart' show EmptyState;
import '../../../../core/di/app_services.dart';
import '../providers/fixproof_provider.dart';

/// FixProof step 1: capture photo/video evidence and a Tamil voice note.
class InspectionCaptureScreen extends ConsumerStatefulWidget {
  const InspectionCaptureScreen({super.key, required this.jobId});
  final String jobId;

  @override
  ConsumerState<InspectionCaptureScreen> createState() => _InspectionCaptureScreenState();
}

class _InspectionCaptureScreenState extends ConsumerState<InspectionCaptureScreen> {
  static const _areas = ['Brakes', 'Engine', 'Suspension', 'Tyres', 'Electrical', 'AC', 'Body'];

  Timer? _timer;
  int _seconds = 0;
  bool _recording = false;
  bool _generating = false;

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _toggleRecording() {
    if (_recording) {
      _timer?.cancel();
      ref.read(captureProvider.notifier).addVoiceNote(math.max(_seconds, 1));
      setState(() {
        _recording = false;
        _seconds = 0;
      });
    } else {
      setState(() => _recording = true);
      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() => _seconds++);
      });
    }
  }

  Future<void> _generate() async {
    setState(() => _generating = true);
    await Future<void>.delayed(const Duration(milliseconds: 1800));
    if (!mounted) return;
    ref.read(reportStateProvider.notifier).set(widget.jobId, ReportState.draft);
    AppServices.jobs.startFixProof(AppServices.jobs.byId(widget.jobId));
    setState(() => _generating = false);
    Navigator.of(context).pushReplacementNamed(RouteNames.reportReview, arguments: widget.jobId);
  }

  String get _clock {
    final m = (_seconds ~/ 60).toString().padLeft(2, '0');
    final s = (_seconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final capture = ref.watch(captureProvider);
    final notifier = ref.read(captureProvider.notifier);
    final job = AppServices.jobs.byId(widget.jobId);

    return Scaffold(
      appBar: AppBar(title: const Text('FixProof inspection')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        children: [
          const _StepBar(current: 0),
          const SizedBox(height: 14),
          Row(
            children: [
              PlateBadge(plate: job.vehicle.plate),
              const SizedBox(width: 10),
              Expanded(child: Text('${job.vehicle.title} ${job.vehicle.year}', style: AppText.bodyStrong)),
            ],
          ),

          // Areas
          const SectionHeader(title: 'What are you checking?'),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final a in _areas)
                FilterChip(
                  label: Text(a),
                  selected: capture.areas.contains(a),
                  onSelected: (_) => notifier.toggleArea(a),
                  showCheckmark: true,
                  checkmarkColor: AppColors.primaryStrong,
                  labelStyle: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: capture.areas.contains(a) ? AppColors.primaryStrong : AppColors.body,
                  ),
                  backgroundColor: AppColors.surface,
                  selectedColor: AppColors.primarySoft,
                  side: BorderSide(color: capture.areas.contains(a) ? AppColors.primaryBorder : AppColors.border),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                ),
            ],
          ),

          // Media
          SectionHeader(title: 'Photos & videos (${capture.media.length})'),
          // Add buttons first (big, one per row), then one captured item per row.
          Row(
            children: [
              Expanded(child: _AddMediaButton(icon: Icons.add_a_photo_rounded, label: 'Photo', onTap: () => notifier.addMedia(isVideo: false))),
              const SizedBox(width: 10),
              Expanded(child: _AddMediaButton(icon: Icons.videocam_rounded, label: 'Video', onTap: () => notifier.addMedia(isVideo: true))),
            ],
          ),
          const SizedBox(height: 10),
          if (capture.media.isEmpty)
            AppCard(
              child: EmptyState(
                compact: true,
                icon: Icons.photo_camera_outlined,
                title: 'No photos yet',
                message: 'Add one close-up per problem. The customer sees these in the report.',
              ),
            )
          else
            for (final m in capture.media)
              MediaRow(
                thumbnail: MediaThumb(isVideo: m.isVideo),
                title: m.label,
                subtitle: m.isVideo ? 'Video' : 'Photo',
                onRemove: () => notifier.removeMedia(m.id),
              ),
          const SizedBox(height: 8),
          Text('Tip: one close-up per problem. Keep the part in focus and in good light.', style: AppText.caption),

          // Voice
          const SectionHeader(title: 'Voice note'),
          AppCard(
            padding: const EdgeInsets.all(18),
            child: Column(
              children: [
                Row(
                  children: [
                    Icon(Icons.translate_rounded, size: 18, color: AppColors.muted),
                    const SizedBox(width: 6),
                    Text('Speak in Tamil · தமிழில் பேசுங்கள்', style: AppText.label),
                  ],
                ),
                const SizedBox(height: 18),
                _Waveform(active: _recording, tick: _seconds),
                const SizedBox(height: 10),
                Text(
                  _recording ? _clock : 'Tap the mic and describe what you found',
                  style: _recording
                      ? AppText.title.copyWith(fontFeatures: const [FontFeature.tabularFigures()])
                      : AppText.caption,
                ),
                const SizedBox(height: 16),
                Semantics(
                  button: true,
                  label: _recording ? 'Stop recording' : 'Start recording',
                  child: InkResponse(
                    onTap: _toggleRecording,
                    radius: 48,
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      width: 76,
                      height: 76,
                      decoration: BoxDecoration(
                        color: _recording ? AppColors.dangerBright : AppColors.primary,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: _recording ? AppColors.dangerSoft : AppColors.primarySoft,
                          width: 8,
                          strokeAlign: BorderSide.strokeAlignOutside,
                        ),
                      ),
                      child: Icon(_recording ? Icons.stop_rounded : Icons.mic_rounded, color: AppColors.onPrimary, size: 34),
                    ),
                  ),
                ),
                if (capture.voiceNotes.isNotEmpty) ...[
                  const SizedBox(height: 18),
                  const Divider(),
                  for (final v in capture.voiceNotes)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const IconBox(icon: Icons.play_arrow_rounded, size: 40),
                      title: Text('Voice note · ${v.duration}', style: AppText.bodyStrong),
                      subtitle: Text('Tamil · ready for AI', style: AppText.caption),
                      trailing: IconButton(
                        tooltip: 'Delete voice note',
                        onPressed: () => notifier.removeVoiceNote(v.id),
                        icon: Icon(Icons.delete_outline_rounded, color: AppColors.muted),
                      ),
                    ),
                ],
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: BottomActionBar(
        children: [
          if (!capture.canGenerate)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(
                'Add at least 1 photo and 1 voice note to create the AI draft.',
                style: AppText.caption,
                textAlign: TextAlign.center,
              ),
            ),
          FilledButton.icon(
            onPressed: capture.canGenerate && !_generating && !_recording ? _generate : null,
            icon: _generating
                ? SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.muted),
                  )
                : const Icon(Icons.auto_awesome_rounded),
            label: Text(_generating ? 'AI is writing the report…' : 'Create AI draft'),
          ),
        ],
      ),
    );
  }
}

class _StepBar extends StatelessWidget {
  const _StepBar({required this.current});
  final int current;

  @override
  Widget build(BuildContext context) {
    const labels = ['Capture', 'Review', 'Publish'];
    return Row(
      children: [
        for (var i = 0; i < labels.length; i++)
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(right: i == labels.length - 1 ? 0 : 6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    height: 5,
                    decoration: BoxDecoration(
                      color: i <= current ? AppColors.primary : AppColors.border,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '${i + 1}. ${labels[i]}',
                    style: AppText.caption.copyWith(
                      color: i <= current ? AppColors.ink : AppColors.muted,
                      fontWeight: i == current ? FontWeight.w800 : FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _AddMediaButton extends StatelessWidget {
  const _AddMediaButton({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.primarySoft,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: AppColors.primaryBorder, width: 1.5),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: SizedBox(
          height: 56,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: AppColors.primaryStrong, size: 24),
              const SizedBox(width: 8),
              Text('Add $label', style: AppText.label.copyWith(color: AppColors.primaryStrong)),
            ],
          ),
        ),
      ),
    );
  }
}

/// Simple animated bars that move while recording.
class _Waveform extends StatelessWidget {
  const _Waveform({required this.active, required this.tick});
  final bool active;
  final int tick;

  @override
  Widget build(BuildContext context) {
    const bars = 28;
    return ExcludeSemantics(
      child: SizedBox(
        height: 40,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (var i = 0; i < bars; i++)
              AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                margin: const EdgeInsets.symmetric(horizontal: 2),
                width: 4,
                height: active ? 8 + 28 * ((math.sin(i * 0.7 + tick * 1.3) + 1) / 2) : 6,
                decoration: BoxDecoration(
                  color: active ? AppColors.primary : AppColors.border,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
