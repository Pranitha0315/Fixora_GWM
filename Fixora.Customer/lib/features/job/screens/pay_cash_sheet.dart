import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../data/repositories/job_store.dart';
import '../../bookings/booking_dialogs.dart';

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
  bool _loading = false;

  String _lkr(num value) {
    final n = value.round().toString();
    final buf = StringBuffer();
    for (var i = 0; i < n.length; i++) {
      final fromEnd = n.length - i;
      if (i > 0 && fromEnd % 3 == 0) buf.write(',');
      buf.write(n[i]);
    }
    return 'LKR $buf';
  }

  Future<void> _confirm() async {
    final total = JobStore.instance.total;
    setState(() => _loading = true);
    await Future<void>.delayed(const Duration(milliseconds: 900));
    if (!mounted) return;
    JobStore.instance.recordCashPayment(total, method: _methods[_method].$2);
    final nav = Navigator.of(context);
    nav.pop();
    await showSuccessDialog<void>(
      nav.context,
      title: 'Payment Confirmed',
      message: 'Thank you! ${_lkr(total)} paid by ${_methods[_method].$2}. Your receipt is in Invoices.',
      actions: (d) => [
        Expanded(
          child: FilledButton(
            onPressed: () => Navigator.of(d).pop(),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primary,
              minimumSize: const Size.fromHeight(48),
            ),
            child: const Text('Done'),
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
              color: AppColors.surfaceSolid,
              borderRadius: BorderRadius.circular(26),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Icon(Icons.payments_outlined, color: AppColors.link),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Pay at Garage', style: AppText.h2),
                          Text('Choose how you will pay at the counter.', style: AppText.small),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: Icon(Icons.close_rounded, color: AppColors.navy),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text('${store.vehicle.name} · ${store.jobId}', style: AppText.muted),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  decoration: BoxDecoration(
                    color: AppColors.primarySofter,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    children: [
                      Text('Total Amount to Pay', style: AppText.muted.copyWith(color: AppColors.navy)),
                      const SizedBox(height: 4),
                      Text(
                        _lkr(store.total),
                        style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: AppColors.link),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                Text('Payment Method', style: AppText.h2.copyWith(fontSize: 15)),
                const SizedBox(height: 10),
                for (var i = 0; i < _methods.length; i++)
                  GestureDetector(
                    onTap: () => setState(() => _method = i),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                      decoration: BoxDecoration(
                        color: i == _method ? AppColors.primarySofter : AppColors.surface,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: i == _method ? AppColors.primary : AppColors.border,
                          width: i == _method ? 1.6 : 1,
                        ),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            i == _method ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded,
                            color: i == _method ? AppColors.primary : AppColors.textFaint,
                          ),
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
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => Navigator.of(context).pop(),
                        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                        child: const Text('Cancel'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: FilledButton.icon(
                        onPressed: _loading ? null : _confirm,
                        icon: _loading
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : const Icon(Icons.check_rounded),
                        label: Text(_loading ? 'Confirming…' : 'Confirm Payment'),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          minimumSize: const Size.fromHeight(50),
                        ),
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
