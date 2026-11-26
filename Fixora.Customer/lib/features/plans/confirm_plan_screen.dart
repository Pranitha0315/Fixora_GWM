import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/core.dart';
import 'card_payment_screen.dart';
import 'plan_subscribed_screen.dart';
import 'plan_widgets.dart';

enum PayMethod { card, mobile, bank }

/// Confirm Plan: what's included + payment method.
class ConfirmPlanScreen extends StatefulWidget {
  final ServicePlan plan;
  const ConfirmPlanScreen({super.key, required this.plan});

  @override
  State<ConfirmPlanScreen> createState() => _ConfirmPlanScreenState();
}

class _ConfirmPlanScreenState extends State<ConfirmPlanScreen> {
  PayMethod _method = PayMethod.card;

  void _finish(String method) {
    AppState.instance.subscribe(widget.plan, method);
    Navigator.of(context).pushAndRemoveUntil(fxRoute(const PlanSubscribedScreen()), (r) => r.isFirst);
  }

  Future<void> _continue() async {
    switch (_method) {
      case PayMethod.card:
        context.push(CardPaymentScreen(plan: widget.plan));
      case PayMethod.mobile:
        final paid = await showFxSheet<bool>(context, builder: (ctx) => _MobilePaySheet(plan: widget.plan));
        if (paid == true && mounted) _finish('Mobile Payment');
      case PayMethod.bank:
        final sent = await showFxSheet<bool>(context, builder: (ctx) => _BankSheet(plan: widget.plan));
        if (sent == true && mounted) _finish('Bank Transfer');
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.plan;
    final saved = AppState.instance.savedCardLast4;
    return FxPage(
      title: 'Confirm Plan',
      subtitle: 'Review and subscribe to your service plan',
      compactHeader: true,
      showNav: false,
      stickyBottom: PrimaryButton(
        label: 'Confirm & Subscribe',
        icon: Icons.lock_outline_rounded,
        fontSize: 17,
        onPressed: _continue,
      ),
      children: [
        FadeSlide(child: PlanHeaderCard(plan: p)),
        const SizedBox(height: 14),
        FadeSlide(
          index: 1,
          child: FxCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("What's Included", style: AppText.h2),
                const SizedBox(height: 10),
                IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(
                        flex: 6,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [for (final f in p.features) FeatureLine(f, size: 14)],
                        ),
                      ),
                      Container(width: 1, margin: const EdgeInsets.symmetric(horizontal: 10), color: AppColors.border),
                      Expanded(
                        flex: 4,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _side(Icons.calendar_month_outlined, 'Plan Duration', planDuration(p)),
                            const SizedBox(height: 12),
                            _side(Icons.sell_outlined, 'Total Price', lkr(p.price)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        FadeSlide(
          index: 2,
          child: FxCard(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Payment Method', style: AppText.h2),
                const SizedBox(height: 10),
                _methodTile(
                  PayMethod.card,
                  Icons.credit_card_rounded,
                  'Credit / Debit Card',
                  saved != null ? 'Saved card •••• $saved' : 'Visa, Mastercard',
                  const [ValueChip('Visa'), SizedBox(width: 4), ValueChip('Master')],
                ),
                _methodTile(
                  PayMethod.mobile,
                  Icons.smartphone_rounded,
                  'Mobile Payment',
                  'eZ Cash  |  mCash',
                  const [ValueChip('eZ Cash', color: AppColors.success)],
                ),
                _methodTile(
                  PayMethod.bank,
                  Icons.account_balance_outlined,
                  'Bank Transfer',
                  'Upload payment slip',
                  [Icon(Icons.chevron_right_rounded, color: AppColors.navy)],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        const _SecureNote(
          title: 'Secure & Trusted Payment',
          body: 'Your payment is protected with industry-standard encryption.',
        ),
      ],
    );
  }

  Widget _side(IconData icon, String label, String value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: AppColors.link, size: 26),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: AppText.small.copyWith(fontSize: 11.5, color: AppColors.text)),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(value, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.navy)),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _methodTile(PayMethod m, IconData icon, String title, String sub, List<Widget> trailing) {
    final sel = _method == m;
    return GestureDetector(
      onTap: () {
        AppState.instance.feedback();
        setState(() => _method = m);
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: sel ? AppColors.primarySofter : AppColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: sel ? AppColors.primary : AppColors.border, width: sel ? 1.6 : 1),
        ),
        child: Row(
          children: [
            Icon(sel ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded,
                color: sel ? AppColors.primary : AppColors.textFaint),
            const SizedBox(width: 10),
            Icon(icon, color: AppColors.link),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: AppText.h3.copyWith(fontSize: 14.5)),
                  Text(sub, style: AppText.small.copyWith(fontSize: 11.5)),
                ],
              ),
            ),
            ...trailing,
          ],
        ),
      ),
    );
  }
}

class _SecureNote extends StatelessWidget {
  final String title;
  final String body;
  const _SecureNote({required this.title, required this.body});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.primarySoft.o(0.7),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Icon(Icons.verified_user_outlined, color: AppColors.link, size: 30),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppText.h3.copyWith(fontSize: 14)),
                Text(body, style: AppText.small.copyWith(fontSize: 11.5, color: AppColors.text)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MobilePaySheet extends StatefulWidget {
  final ServicePlan plan;
  const _MobilePaySheet({required this.plan});

  @override
  State<_MobilePaySheet> createState() => _MobilePaySheetState();
}

class _MobilePaySheetState extends State<_MobilePaySheet> {
  final _phone = TextEditingController(text: AppState.instance.profile.phone.replaceFirst('+94 ', '0'));
  int _wallet = 0;
  bool _sent = false;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final digits = _phone.text.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 10) {
      setState(() => _error = 'Enter a valid mobile number');
      return;
    }
    setState(() {
      _error = null;
      _loading = true;
    });
    await Future<void>.delayed(const Duration(milliseconds: 1200));
    if (!mounted) return;
    setState(() {
      _loading = false;
      _sent = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Mobile Payment', style: AppText.h1),
        const SizedBox(height: 4),
        Text('Pay ${lkr(widget.plan.price)} from your mobile wallet.', style: AppText.muted),
        const SizedBox(height: 14),
        FxPillTabs(labels: const ['eZ Cash', 'mCash'], index: _wallet, onChanged: (i) => setState(() => _wallet = i)),
        const FxLabel('Mobile number'),
        FxInput(
          controller: _phone,
          hint: '07X XXX XXXX',
          icon: Icons.smartphone_rounded,
          keyboardType: TextInputType.phone,
          errorText: _error,
        ),
        const SizedBox(height: 14),
        if (_sent)
          Container(
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(color: AppColors.successSoft, borderRadius: BorderRadius.circular(14)),
            child: Text(
              'Payment request sent to ${_phone.text}. Approve it in your ${_wallet == 0 ? 'eZ Cash' : 'mCash'} app, then tap "I have paid".',
              style: AppText.body.copyWith(fontSize: 13),
            ),
          ),
        PrimaryButton(
          label: _sent ? 'I have paid' : 'Send Payment Request',
          icon: _sent ? Icons.check_rounded : Icons.send_rounded,
          loading: _loading,
          onPressed: _sent ? () => Navigator.of(context).pop(true) : () => _send(),
        ),
      ],
    );
  }
}

class _BankSheet extends StatefulWidget {
  final ServicePlan plan;
  const _BankSheet({required this.plan});

  @override
  State<_BankSheet> createState() => _BankSheetState();
}

class _BankSheetState extends State<_BankSheet> {
  Uint8List? _slip;
  bool _loading = false;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Bank Transfer', style: AppText.h1),
        const SizedBox(height: 4),
        Text('Transfer ${lkr(widget.plan.price)} and upload the slip.', style: AppText.muted),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: AppColors.primarySofter, borderRadius: BorderRadius.circular(14)),
          child: Column(
            children: [
              const KVRow('Account name', 'Fixora Garage (Pvt) Ltd'),
              const KVRow('Bank', 'Sample Bank - Kandy'),
              Row(
                children: [
                  Expanded(child: Text('Account no.', style: AppText.body)),
                  Text('1234 5678 9000', style: AppText.label),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    icon: Icon(Icons.copy_rounded, size: 18, color: AppColors.link),
                    onPressed: () {
                      Clipboard.setData(const ClipboardData(text: '123456789000'));
                      showFxSnack(context, 'Account number copied');
                    },
                  ),
                ],
              ),
              KVRow('Reference', 'PLAN-${widget.plan.id.toUpperCase()}'),
            ],
          ),
        ),
        const SizedBox(height: 12),
        GestureDetector(
          onTap: () async {
            final b = await choosePhoto(context);
            if (b != null && mounted) setState(() => _slip = b);
          },
          child: DashedBorder(
            fill: AppColors.surface,
            child: SizedBox(
              height: 120,
              child: _slip == null
                  ? Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.upload_file_rounded, color: AppColors.link, size: 34),
                        SizedBox(height: 6),
                        Text('Upload payment slip', style: AppText.label),
                      ],
                    )
                  : Padding(
                      padding: const EdgeInsets.all(8),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: Image.memory(_slip!, fit: BoxFit.contain),
                      ),
                    ),
            ),
          ),
        ),
        const SizedBox(height: 14),
        PrimaryButton(
          label: 'Submit Slip',
          icon: Icons.check_rounded,
          loading: _loading,
          onPressed: _slip == null
              ? null
              : () async {
                  setState(() => _loading = true);
                  await Future<void>.delayed(const Duration(milliseconds: 1000));
                  if (context.mounted) Navigator.of(context).pop(true);
                },
        ),
        if (_slip == null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text('Add the slip photo to continue', textAlign: TextAlign.center, style: AppText.small),
          ),
      ],
    );
  }
}
