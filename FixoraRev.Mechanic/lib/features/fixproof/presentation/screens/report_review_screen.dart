import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/bronze_buttons.dart';
import '../../domain/inspection_issue.dart';
import '../providers/fixproof_provider.dart';
import '../widgets/inspection_issue_form.dart';

class ReportReviewScreen extends ConsumerStatefulWidget {
  const ReportReviewScreen({super.key, required this.jobId});

  final String jobId;

  @override
  ConsumerState<ReportReviewScreen> createState() => _ReportReviewScreenState();
}

class _ReportReviewScreenState extends ConsumerState<ReportReviewScreen> {
  late final TextEditingController _draft;
  bool _showManualForm = false;

  @override
  void initState() {
    super.initState();
    final capture = ref.read(captureProvider.notifier).stateFor(widget.jobId);
    _draft = TextEditingController(text: capture.aiDraft);
    if (_draft.text.isEmpty && capture.issues.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref.read(captureProvider.notifier).generateAiDraft(widget.jobId);
        final next = ref.read(captureProvider.notifier).stateFor(widget.jobId);
        _draft.text = next.aiDraft;
        setState(() {});
      });
    }
  }

  @override
  void dispose() {
    _draft.dispose();
    super.dispose();
  }

  void _saveDraft() {
    ref.read(captureProvider.notifier).setAiDraft(widget.jobId, _draft.text);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Draft saved locally')),
    );
  }

  void _sendReport() {
  ref.read(captureProvider.notifier).setAiDraft(widget.jobId, _draft.text);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Report queued to customer')),
    );
    Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final capture =
        ref.watch(captureProvider)[widget.jobId] ?? const CaptureState();

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Report review'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'Job ${widget.jobId}',
            style: TextStyle(color: AppColors.body),
          ),
          const SizedBox(height: 16),
          Text('Logged issues', style: TextStyle(color: AppColors.ink, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          if (capture.issues.isEmpty)
            Text('No issues yet', style: TextStyle(color: AppColors.body))
          else
            for (final issue in capture.issues)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  title: Text(issue.title, style: TextStyle(color: AppColors.ink)),
                  subtitle: Text(
                    '${componentLabel(issue.component)} · ${issue.severity.label}',
                    style: TextStyle(color: AppColors.body),
                  ),
                  trailing: IconButton(
                    icon: const Icon(Icons.delete_outline),
                    onPressed: () => ref
                        .read(captureProvider.notifier)
                        .removeIssue(widget.jobId, issue.id),
                  ),
                ),
              ),
          const SizedBox(height: 16),
          Row(
            children: [
              Text('AI draft', style: TextStyle(color: AppColors.ink, fontWeight: FontWeight.w700)),
              const Spacer(),
              TextButton(
                onPressed: () {
                  ref.read(captureProvider.notifier).generateAiDraft(widget.jobId);
                  final next =
                      ref.read(captureProvider.notifier).stateFor(widget.jobId);
                  _draft.text = next.aiDraft;
                },
                child: const Text('Regenerate'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _draft,
            minLines: 6,
            maxLines: 14,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              hintText: 'Inspection report draft…',
            ),
            onChanged: (v) =>
                ref.read(captureProvider.notifier).setAiDraft(widget.jobId, v),
          ),
          const SizedBox(height: 16),
          SwitchListTile(
            title: Text('Add issue manually', style: TextStyle(color: AppColors.ink)),
            value: _showManualForm,
            onChanged: (v) => setState(() => _showManualForm = v),
          ),
          if (_showManualForm) ...[
            const SizedBox(height: 8),
            InspectionIssueForm(
              onSave: (issue) {
                ref.read(captureProvider.notifier).addManual(widget.jobId, issue);
                setState(() => _showManualForm = false);
              },
            ),
          ],
          const SizedBox(height: 24),
          ElevatedButton(
            style: BronzeButtons.elevated,
            onPressed: _saveDraft,
            child: const Text('Save draft'),
          ),
          const SizedBox(height: 10),
          OutlinedButton(
            onPressed: capture.issues.isEmpty && _draft.text.trim().isEmpty
                ? null
                : _sendReport,
            child: const Text('Send to customer'),
          ),
        ],
      ),
    );
  }
}