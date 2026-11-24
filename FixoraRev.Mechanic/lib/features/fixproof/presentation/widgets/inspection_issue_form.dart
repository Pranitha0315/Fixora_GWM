import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/bronze_buttons.dart';
import '../../domain/inspection_issue.dart';

class InspectionIssueForm extends StatefulWidget {
  const InspectionIssueForm({
    super.key,
    this.initialComponent,
    this.issue,
    required this.onSave,
  });

  final String? initialComponent;
  final InspectionIssue? issue;
  final ValueChanged<InspectionIssue> onSave;

  @override
  State<InspectionIssueForm> createState() => _InspectionIssueFormState();
}

class _InspectionIssueFormState extends State<InspectionIssueForm> {
  late String _component;
  late final TextEditingController _title;
  late final TextEditingController _description;
  late InspectionSeverity _severity;

  @override
  void initState() {
    super.initState();
    _component = widget.initialComponent ??
        widget.issue?.component ??
        kVehicleComponents.first.id;
    _title = TextEditingController(text: widget.issue?.title ?? '');
    _description = TextEditingController(text: widget.issue?.description ?? '');
    _severity = widget.issue?.severity ?? InspectionSeverity.medium;
  }

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    super.dispose();
  }

  void _submit() {
    final title = _title.text.trim();
    final description = _description.text.trim();
    if (title.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a title for this issue')),
      );
      return;
    }
    widget.onSave(
      InspectionIssue(
        id: widget.issue?.id,
        component: _component,
        title: title,
        description: description,
        severity: _severity,
        createdAt: widget.issue?.createdAt,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DropdownButtonFormField<String>(
          initialValue: _component,
          decoration: const InputDecoration(
            labelText: 'Component',
            border: OutlineInputBorder(),
          ),
          items: [
            for (final c in kVehicleComponents)
              DropdownMenuItem(value: c.id, child: Text(c.label)),
          ],
          onChanged: (v) {
            if (v != null) setState(() => _component = v);
          },
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _title,
          decoration: const InputDecoration(
            labelText: 'Title',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _description,
          minLines: 3,
          maxLines: 5,
          decoration: const InputDecoration(
            labelText: 'Description',
            alignLabelWithHint: true,
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),
        Text('Severity', style: TextStyle(color: AppColors.body, fontSize: 13)),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: [
            for (final s in InspectionSeverity.values)
              ChoiceChip(
                label: Text(s.label),
                selected: _severity == s,
                selectedColor: AppColors.primary.withValues(alpha: 0.25),
                onSelected: (_) => setState(() => _severity = s),
              ),
          ],
        ),
        const SizedBox(height: 20),
        ElevatedButton(
          style: BronzeButtons.elevated,
          onPressed: _submit,
          child: const Text('Save issue'),
        ),
      ],
    );
  }
}