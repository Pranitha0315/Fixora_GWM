import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/bronze_buttons.dart';
import '../../domain/inspection_issue.dart';
import '../providers/fixproof_provider.dart';
import '../widgets/inspection_issue_form.dart';
import '../widgets/vehicle_diagram.dart';

class DiagnosisFlowScreen extends ConsumerStatefulWidget {
  const DiagnosisFlowScreen({super.key, required this.jobId});

  final String jobId;

  @override
  ConsumerState<DiagnosisFlowScreen> createState() =>
      _DiagnosisFlowScreenState();
}

class _DiagnosisFlowScreenState extends ConsumerState<DiagnosisFlowScreen> {
  int _step = 0;
  String? _selectedComponent;
  InspectionIssue? _draft;

  void _onZoneTap(String id, String label) {
    setState(() => _selectedComponent = id);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Selected $label')),
    );
  }

  void _onIssueSaved(InspectionIssue issue) {
    setState(() {
      _draft = issue;
      _step = 2;
    });
  }

  void _confirm() {
    final issue = _draft;
    if (issue == null) return;
    ref.read(captureProvider.notifier).addManual(widget.jobId, issue);
    Navigator.of(context).pop(issue);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Diagnosis flow'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'Step ${_step + 1} of 3',
            style: TextStyle(color: AppColors.body, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 16),
          if (_step == 0) ...[
            Text(
              'Tap the area on the vehicle',
              style: TextStyle(color: AppColors.ink, fontSize: 16),
            ),
            const SizedBox(height: 12),
            VehicleDiagram(
              selectedId: _selectedComponent,
              onZoneTap: _onZoneTap,
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              style: BronzeButtons.elevated,
              onPressed: _selectedComponent == null
                  ? null
                  : () => setState(() => _step = 1),
              child: const Text('Continue to issue details'),
            ),
          ],
          if (_step == 1) ...[
            Text(
              'Document the issue',
              style: TextStyle(color: AppColors.ink, fontSize: 16),
            ),
            const SizedBox(height: 12),
            InspectionIssueForm(
              initialComponent: _selectedComponent,
              onSave: _onIssueSaved,
            ),
          ],
          if (_step == 2 && _draft != null) ...[
            Text(
              'Confirm diagnosis',
              style: TextStyle(color: AppColors.ink, fontSize: 16),
            ),
            const SizedBox(height: 12),
            _ConfirmCard(issue: _draft!),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => setState(() => _step = 1),
                    child: const Text('Edit'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    style: BronzeButtons.elevated,
                    onPressed: _confirm,
                    child: const Text('Add to report'),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _ConfirmCard extends StatelessWidget {
  const _ConfirmCard({required this.issue});

  final InspectionIssue issue;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              componentLabel(issue.component),
              style: TextStyle(color: AppColors.body, fontSize: 12),
            ),
            const SizedBox(height: 4),
            Text(
              issue.title,
              style: TextStyle(
                color: AppColors.ink,
                fontWeight: FontWeight.w700,
                fontSize: 18,
              ),
            ),
            const SizedBox(height: 8),
            Text(issue.description, style: TextStyle(color: AppColors.ink)),
            const SizedBox(height: 8),
            Chip(
              label: Text(issue.severity.label),
              backgroundColor: AppColors.primary.withValues(alpha: 0.15),
            ),
          ],
        ),
      ),
    );
  }
}