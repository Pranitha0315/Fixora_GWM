import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_typography.dart';
import '../../domain/entities/inspection_issue.dart';

/// Form: component selector + description + severity → save callback.
class InspectionIssueForm extends StatefulWidget {
  const InspectionIssueForm({super.key, required this.onSave});

  final void Function({
    required String area,
    required String title,
    required String detail,
    required IssueSeverity severity,
  }) onSave;

  static const components = [
    'Brakes',
    'Engine',
    'Suspension',
    'Electrical',
    'Tyres',
    'Body',
    'A/C',
    'Other',
  ];

  @override
  State<InspectionIssueForm> createState() => _InspectionIssueFormState();
}

class _InspectionIssueFormState extends State<InspectionIssueForm> {
  final _title = TextEditingController();
  final _detail = TextEditingController();
  String _area = InspectionIssueForm.components.first;
  IssueSeverity _severity = IssueSeverity.soon;

  @override
  void dispose() {
    _title.dispose();
    _detail.dispose();
    super.dispose();
  }

  void _submit() {
    final title = _title.text.trim();
    final detail = _detail.text.trim();
    if (title.isEmpty || detail.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter title and description')),
      );
      return;
    }
    widget.onSave(area: _area, title: title, detail: detail, severity: _severity);
    _title.clear();
    _detail.clear();
    setState(() {
      _severity = IssueSeverity.soon;
      _area = InspectionIssueForm.components.first;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Vehicle component', style: AppText.label),
        const SizedBox(height: 6),
        DropdownButtonFormField<String>(
          value: _area,
          items: [
            for (final c in InspectionIssueForm.components)
              DropdownMenuItem(value: c, child: Text(c)),
          ],
          onChanged: (v) => setState(() => _area = v ?? _area),
        ),
        const SizedBox(height: 12),
        Text('Issue title', style: AppText.label),
        const SizedBox(height: 6),
        TextField(controller: _title, decoration: const InputDecoration(hintText: 'Short title')),
        const SizedBox(height: 12),
        Text('Description', style: AppText.label),
        const SizedBox(height: 6),
        TextField(
          controller: _detail,
          minLines: 3,
          maxLines: 5,
          decoration: const InputDecoration(hintText: 'What did you find?'),
        ),
        const SizedBox(height: 12),
        Text('Severity', style: AppText.label),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          children: [
            for (final s in IssueSeverity.values)
              ChoiceChip(
                label: Text(s.label),
                selected: _severity == s,
                selectedColor: AppColors.primarySoft,
                onSelected: (_) => setState(() => _severity = s),
              ),
          ],
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: _submit,
          icon: const Icon(Icons.save_rounded),
          label: const Text('Save inspection issue'),
        ),
      ],
    );
  }
}
