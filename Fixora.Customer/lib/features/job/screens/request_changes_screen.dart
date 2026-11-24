import 'package:flutter/material.dart';

import '../../../core/core.dart';
import '../widgets/job_widgets.dart';
import 'change_request_submitted_screen.dart';
import '../../../core/backend/api_client.dart';
import '../../../data/remote/customer_backend.dart';

/// "Request Changes" - ask the advisor to revise the estimate.
class RequestChangesScreen extends StatefulWidget {
  const RequestChangesScreen({super.key});

  @override
  State<RequestChangesScreen> createState() => _RequestChangesScreenState();
}

class _RequestChangesScreenState extends State<RequestChangesScreen> {
  static const _options = [
    ('Update Parts', 'e.g. use alternative part / different brand'),
    ('Update Labour Charge', 'e.g. reduce or adjust service charge'),
    ('Remove Item', 'e.g. remove a part or service'),
    ('Add New Item', 'e.g. additional repair or replacement'),
    ('Other (Specify)', 'e.g. any other change'),
  ];

  final Set<int> _selected = {0};
  final _details = TextEditingController();
  bool _loading = false;
  bool _showError = false;

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_selected.isEmpty || _details.text.trim().isEmpty) {
      setState(() => _showError = true);
      return;
    }
    setState(() => _loading = true);
    final changes = _selected.map((i) => _options[i].$1).toList();
    ChangeRequest cr;
    if (JobStore.instance.isLive) {
      try {
        cr = await CustomerBackend.instance.requestChanges(changes, _details.text.trim());
      } on ApiException catch (e) {
        if (!mounted) return;
        setState(() => _loading = false);
        showFxSnack(context, e.message, icon: Icons.error_outline_rounded);
        return;
      }
    } else {
      await Future<void>.delayed(const Duration(milliseconds: 900));
      cr = JobStore.instance.requestChanges(changes, _details.text.trim());
    }
    if (!mounted) return;
    Navigator.of(context).pushReplacement(fxRoute(ChangeRequestSubmittedScreen(request: cr)));
  }

  @override
  Widget build(BuildContext context) {
    final store = JobStore.instance;
    return FxPage(
      title: 'Request Changes',
      children: [
        FadeSlide(
          child: FxCard(
            padding: const EdgeInsets.fromLTRB(14, 16, 14, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                CardHeader(
                  icon: Icons.edit_note_rounded,
                  title: 'Request Estimate Changes',
                  subtitle: 'Specify the changes you want to make to the estimate.',
                  chip: JobChip(store.jobId),
                ),
                const SizedBox(height: 14),
                VehicleStrip(
                  vehicle: store.vehicle,
                  compact: true,
                  trailing: const StatusPill('Changes Requested',
                      color: AppColors.warning, icon: Icons.sync_rounded),
                ),
                const SizedBox(height: 14),
                Text('Current Estimate (For Reference)', style: AppText.h3),
                const SizedBox(height: 10),
                EstimateTable(items: store.items, compact: true, showTotals: false),
                const SizedBox(height: 10),
                TotalBar(label: 'Total Estimate', value: lkr(store.total), fontSize: 19),
                const SizedBox(height: 16),
                Text('What Changes Do You Need?', style: AppText.h3),
                const SizedBox(height: 10),
                for (var i = 0; i < _options.length; i++)
                  CheckCard(
                    checked: _selected.contains(i),
                    title: _options[i].$1,
                    subtitle: _options[i].$2,
                    onChanged: (v) => setState(() {
                      v ? _selected.add(i) : _selected.remove(i);
                      _showError = false;
                    }),
                  ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(Icons.chat_bubble_outline_rounded, size: 17, color: AppColors.navy),
                    SizedBox(width: 6),
                    Text('Change Details ', style: AppText.label),
                    Text('*', style: TextStyle(color: AppColors.dangerText, fontWeight: FontWeight.w700)),
                  ],
                ),
                const SizedBox(height: 8),
                FxTextField(
                  controller: _details,
                  hint: 'Describe the changes you want...',
                  maxLines: 3,
                  onChanged: (_) {
                    if (_showError) setState(() => _showError = false);
                  },
                ),
                AnimatedSize(
                  duration: const Duration(milliseconds: 200),
                  child: _showError
                      ? Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text('Pick at least one change and describe it.',
                              style: AppText.small.copyWith(color: AppColors.danger)),
                        )
                      : const SizedBox(width: double.infinity),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: OutlineButton2(
                        label: 'Cancel',
                        height: 50,
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: PrimaryButton(
                        label: 'Submit Change Request',
                        icon: Icons.send_rounded,
                        height: 50,
                        fontSize: 14.5,
                        loading: _loading,
                        onPressed: _submit,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
