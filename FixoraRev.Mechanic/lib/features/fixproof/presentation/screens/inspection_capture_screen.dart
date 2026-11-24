import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/bronze_buttons.dart';
import '../../../../core/di/app_services.dart';
import '../../data/media_upload_service.dart';
import '../../data/voice_recording_service.dart';
import '../../domain/inspection_issue.dart';
import '../providers/fixproof_provider.dart';
import '../widgets/inspection_issue_form.dart';

class InspectionCaptureScreen extends ConsumerStatefulWidget {
  const InspectionCaptureScreen({super.key, required this.jobId});

  final String jobId;

  @override
  ConsumerState<InspectionCaptureScreen> createState() =>
      _InspectionCaptureScreenState();
}

class _InspectionCaptureScreenState
    extends ConsumerState<InspectionCaptureScreen> {
  @override
  void initState() {
    super.initState();
    AppServices.media.addListener(_refresh);
    AppServices.voice.addListener(_refresh);
  }

  @override
  void dispose() {
    AppServices.media.removeListener(_refresh);
    AppServices.voice.removeListener(_refresh);
    super.dispose();
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  Future<void> _capturePhoto() async {
    final item = await AppServices.media.capturePhoto(widget.jobId);
    if (item != null) {
      ref.read(captureProvider.notifier).increment(widget.jobId);
      await AppServices.media.upload(item);
    }
  }

  Future<void> _captureVideo() async {
    final item = await AppServices.media.captureVideo(widget.jobId);
    if (item != null) {
      ref.read(captureProvider.notifier).increment(widget.jobId);
      await AppServices.media.upload(item);
    }
  }

  void _openIssueSheet() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
          ),
          child: SingleChildScrollView(
            child: InspectionIssueForm(
              onSave: (issue) {
                ref.read(captureProvider.notifier).addManual(widget.jobId, issue);
                Navigator.pop(ctx);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Issue added')),
                );
              },
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final capture = ref.watch(captureProvider)[widget.jobId] ?? const CaptureState();
    final media = AppServices.media.forJob(widget.jobId);
    final voice = AppServices.voice;

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Inspection capture'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
        actions: [
          TextButton(
            onPressed: () => context.push(RouteNames.reportReviewPath(widget.jobId)),
            child: const Text('Review'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'Job ${widget.jobId}',
            style: TextStyle(color: AppColors.body, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 4),
          Text(
            '${capture.issues.length} issues · ${capture.count} media',
            style: TextStyle(color: AppColors.ink),
          ),
          const SizedBox(height: 20),
          Text('Media', style: TextStyle(color: AppColors.ink, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _capturePhoto,
                  icon: const Icon(Icons.photo_camera_outlined),
                  label: const Text('Photo'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _captureVideo,
                  icon: const Icon(Icons.videocam_outlined),
                  label: const Text('Video'),
                ),
              ),
            ],
          ),
          if (media.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text('No media yet', style: TextStyle(color: AppColors.body)),
            )
          else
            ...media.map((m) => _MediaTile(item: m)),
          const SizedBox(height: 20),
          Text('Voice note', style: TextStyle(color: AppColors.ink, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: VoiceLanguage.values
                .map(
                  (l) => ChoiceChip(
                    label: Text(l.label),
                    selected: voice.language == l,
                    onSelected: (_) => AppServices.voice.setLanguage(l),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 8),
          Text(
            voice.status == VoiceRecordStatus.recording
                ? 'Recording ${voice.duration.inSeconds}s'
                : 'Status: ${voice.status.name}',
            style: TextStyle(color: AppColors.body),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              if (voice.status != VoiceRecordStatus.recording)
                Expanded(
                  child: OutlinedButton(
                    onPressed: AppServices.voice.start,
                    child: const Text('Record'),
                  ),
                )
              else
                Expanded(
                  child: OutlinedButton(
                    onPressed: AppServices.voice.stop,
                    child: const Text('Stop'),
                  ),
                ),
              const SizedBox(width: 8),
              if (voice.localPath != null)
                Expanded(
                  child: OutlinedButton(
                    onPressed: AppServices.voice.upload,
                    child: const Text('Upload'),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 24),
          Text('Issues', style: TextStyle(color: AppColors.ink, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          for (final issue in capture.issues) _IssueRow(issue: issue),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _openIssueSheet,
            icon: const Icon(Icons.add),
            label: const Text('Add issue manually'),
          ),
          const SizedBox(height: 12),
          ElevatedButton(
            style: BronzeButtons.elevated,
            onPressed: () => context.push(RouteNames.diagnosisFlowPath(widget.jobId)),
            child: const Text('Guided diagnosis flow'),
          ),
        ],
      ),
    );
  }
}

class _MediaTile extends StatelessWidget {
  const _MediaTile({required this.item});

  final MediaUploadItem item;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(top: 8),
      child: ListTile(
        leading: Icon(
          item.kind == MediaUploadKind.photo
              ? Icons.image_outlined
              : Icons.movie_outlined,
          color: AppColors.primary,
        ),
        title: Text(
          item.localPath.split(RegExp(r'[/\\]')).last,
          style: TextStyle(color: AppColors.ink, fontSize: 13),
        ),
        subtitle: LinearProgressIndicator(
          value: item.progress,
          color: AppColors.primary,
        ),
        trailing: item.status == MediaUploadStatus.failed
            ? IconButton(
                icon: const Icon(Icons.refresh),
                onPressed: () => AppServices.media.retry(item),
              )
            : Text(
                item.status.name,
                style: TextStyle(color: AppColors.body, fontSize: 11),
              ),
      ),
    );
  }
}

class _IssueRow extends StatelessWidget {
  const _IssueRow({required this.issue});

  final InspectionIssue issue;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Icon(Icons.report_outlined, size: 18, color: AppColors.primary),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              '${issue.title} · ${issue.severity.label}',
              style: TextStyle(color: AppColors.ink, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}