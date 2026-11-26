import 'package:flutter/material.dart';

import '../../../core/core.dart';
import '../widgets/job_widgets.dart';

/// "Pay at Garage" dialog (card, mobile wallet or bank transfer).
Future<void> showPayCashSheet(BuildContext context) {
  return showGeneralDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'close',
    barrierColor: const Color(0xFF0B1418).o(0.45),
    transitionDuration: const Duration(milliseconds: 320),
    pageBuilder: (ctx, _, __) => const _PayCashDialog(),
    transitionBuilder: (_, anim, __, child) {
      final c = CurvedAnimation(parent: anim, curve: Curves.easeOutCubic);
      return FadeTransition(
        opacity: anim,
        child: SlideTransition(
          position: Tween(begin: const Offset(0, 0.06), end: Offset.zero).animate(c),
          child: child,
        ),
      );
    },
  );
}

class _PayCashDialog extends StatefulWidget {
  const _PayCashDialog();

  @override
  State<_PayCashDialog> createState() => _PayCashDialogState();
}

class _PayCashDialogState extends State<_PayCashDialog> {
  static const _methods = [
    (Icons.credit_card_rounded, 'Card at counter', 'Visa / Mastercard at the cashier'),
    (Icons.smartphone_rounded, 'Mobile Payment', 'eZ Cash or mCash wallet'),
    (Icons.account_balance_outlined, 'Bank Transfer', 'Transfer and show the slip'),
  ];
  int _method = 0;
  final _note = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _confirm() async {
    final total = JobStore.instance.total;
    setState(() => _loading = true);
    await Future<void>.delayed(const Duration(milliseconds: 900));
    if (!mounted) return;
    JobStore.instance.recordCashPayment(total, method: _methods[_method].$2);
    final nav = Navigator.of(context);
    nav.pop();
    showSuccessDialog<void>(
      nav.context,
      title: 'Payment Confirmed',
      message: 'Thank you! ${lkr(total)} paid by ${_methods[_method].$2}. Your receipt is in Invoices.',
      actions: (d) => [
        Expanded(
          child: PrimaryButton(
            label: 'Done',
            height: 48,
            onPressed: () => Navigator.of(d).pop(),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final store = JobStore.instance;
    return Center(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(16, 40, 16, 40 + MediaQuery.of(context).viewInsets.bottom),
        child: Material(
          color: Colors.transparent,
          child: Container(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(26),
              boxShadow: AppShadows.card,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                CardHeader(
                  icon: Icons.payments_outlined,
                  title: 'Pay at Garage',
                  subtitle: 'Choose how you will pay at the counter. We confirm once received.',
                  trailing: GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    child: Padding(
                      padding: EdgeInsets.only(left: 6),
                      child: Icon(Icons.close_rounded, color: AppColors.navy),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                VehicleStrip(
                  vehicle: store.vehicle,
                  compact: true,
                  trailing: const CurrentStepBadge(
                    label: 'Service Type',
                    value: 'Diagnosis & Repair',
                  ),
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: [AppColors.adapt(Color(0xFFECFDFC)), AppColors.adapt(Color(0xFFE0FCFA))]),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    children: [
                      Text('Total Amount to Pay',
                          style: AppText.muted.copyWith(fontSize: 14, color: AppColors.navy)),
                      const SizedBox(height: 4),
                      Text(lkr(store.total, decimals: true),
                          style: TextStyle(
                              fontSize: 28, fontWeight: FontWeight.w800, color: AppColors.link)),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                Text('Payment Method', style: AppText.h2),
                const SizedBox(height: 10),
                for (var i = 0; i < _methods.length; i++)
                  GestureDetector(
                    onTap: () {
                      AppState.instance.feedback();
                      setState(() => _method = i);
                    },
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                      decoration: BoxDecoration(
                        color: i == _method ? AppColors.primarySofter : AppColors.surface,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                            color: i == _method ? AppColors.primary : AppColors.border, width: i == _method ? 1.6 : 1),
                      ),
                      child: Row(
                        children: [
                          Icon(i == _method ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded,
                              color: i == _method ? AppColors.primary : AppColors.textFaint),
                          const SizedBox(width: 10),
                          Icon(_methods[i].$1, color: AppColors.link),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(_methods[i].$2, style: AppText.h3.copyWith(fontSize: 14.5)),
                                Text(_methods[i].$3, style: AppText.small.copyWith(fontSize: 11.5)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                const SizedBox(height: 6),
                FxTextField(
                  controller: _note,
                  hint: 'Add a payment note (optional)',
                  prefix: Icon(Icons.sticky_note_2_outlined, size: 20, color: AppColors.textMuted),
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
                        label: 'Confirm Payment',
                        icon: Icons.check_rounded,
                        height: 50,
                        fontSize: 15,
                        loading: _loading,
                        onPressed: _confirm,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
