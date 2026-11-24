import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/core.dart';
import 'plan_subscribed_screen.dart';
import 'plan_widgets.dart';

/// Card Payment (demo - no real charge is made).
class CardPaymentScreen extends StatefulWidget {
  final ServicePlan plan;
  const CardPaymentScreen({super.key, required this.plan});

  @override
  State<CardPaymentScreen> createState() => _CardPaymentScreenState();
}

class _CardPaymentScreenState extends State<CardPaymentScreen> {
  final _name = TextEditingController(text: AppState.instance.profile.name);
  final _number = TextEditingController();
  final _expiry = TextEditingController();
  final _cvv = TextEditingController();
  bool _save = true;
  bool _submitted = false;
  bool _paying = false;

  @override
  void dispose() {
    _name.dispose();
    _number.dispose();
    _expiry.dispose();
    _cvv.dispose();
    super.dispose();
  }

  String get _digits => _number.text.replaceAll(' ', '');

  String get _brand {
    if (_digits.startsWith('4')) return 'Visa';
    if (RegExp(r'^(5[1-5]|2[2-7])').hasMatch(_digits)) return 'Mastercard';
    if (RegExp(r'^3[47]').hasMatch(_digits)) return 'Amex';
    return '';
  }

  bool _luhn(String d) {
    var sum = 0;
    var alt = false;
    for (var i = d.length - 1; i >= 0; i--) {
      var n = int.parse(d[i]);
      if (alt) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alt = !alt;
    }
    return sum % 10 == 0;
  }

  String? get _nameError => _submitted && _name.text.trim().length < 3 ? 'Enter the name on the card' : null;

  String? get _numberError {
    if (!_submitted) return null;
    if (_digits.length < 13 || !_luhn(_digits)) return 'Card number is not valid';
    return null;
  }

  String? get _expiryError {
    if (!_submitted) return null;
    final m = RegExp(r'^(\d{2})/(\d{2})$').firstMatch(_expiry.text);
    if (m == null) return 'Use MM/YY';
    final mm = int.parse(m.group(1)!);
    final yy = 2000 + int.parse(m.group(2)!);
    if (mm < 1 || mm > 12) return 'Invalid month';
    final now = DateTime.now();
    if (DateTime(yy, mm + 1).isBefore(DateTime(now.year, now.month + 1))) return 'Card expired';
    return null;
  }

  String? get _cvvError => _submitted && !RegExp(r'^\d{3,4}$').hasMatch(_cvv.text) ? '3 or 4 digits' : null;

  Future<void> _pay() async {
    setState(() => _submitted = true);
    if (_nameError != null || _numberError != null || _expiryError != null || _cvvError != null) {
      showFxSnack(context, 'Please check your card details', icon: Icons.error_outline_rounded);
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() => _paying = true);
    await Future<void>.delayed(const Duration(milliseconds: 1800));
    if (!mounted) return;
    final app = AppState.instance;
    if (_save) app.savedCardLast4 = _digits.substring(_digits.length - 4);
    app.subscribe(widget.plan, 'Credit / Debit Card');
    Navigator.of(context).pushAndRemoveUntil(fxRoute(const PlanSubscribedScreen()), (r) => r.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.plan;
    return FxPage(
      title: 'Card Payment',
      subtitle: 'Enter your card details to complete the payment',
      compactHeader: true,
      showNav: false,
      stickyBottom: PrimaryButton(
        label: 'Pay ${lkr(p.price)}',
        icon: Icons.lock_outline_rounded,
        fontSize: 17,
        loading: _paying,
        onPressed: _pay,
      ),
      children: [
        PlanHeaderCard(plan: p, showPopular: false),
        const SizedBox(height: 14),
        FxCard(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(child: Text('Enter Card Details', style: AppText.h2)),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    child: _brand.isEmpty
                        ? const Row(
                            key: ValueKey('none'),
                            mainAxisSize: MainAxisSize.min,
                            children: [ValueChip('Visa'), SizedBox(width: 4), ValueChip('Master')],
                          )
                        : ValueChip(_brand, key: ValueKey(_brand), color: AppColors.success),
                  ),
                ],
              ),
              const FxLabel('Cardholder Name'),
              FxInput(
                controller: _name,
                hint: 'Name on card',
                icon: Icons.person_outline_rounded,
                capitalization: TextCapitalization.words,
                errorText: _nameError,
                onChanged: (_) => setState(() {}),
              ),
              const FxLabel('Card Number'),
              TextField(
                controller: _number,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly, _CardNumberFormatter()],
                onChanged: (_) => setState(() {}),
                style: AppText.body.copyWith(fontSize: 16, letterSpacing: 1.2),
                decoration: _deco('1234 5678 9012 3456', Icons.credit_card_rounded, _numberError),
              ),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const FxLabel('Expiry Date'),
                        TextField(
                          controller: _expiry,
                          keyboardType: TextInputType.number,
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly, _ExpiryFormatter()],
                          onChanged: (_) => setState(() {}),
                          style: AppText.body.copyWith(fontSize: 16),
                          decoration: _deco('MM/YY', Icons.calendar_today_outlined, _expiryError),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const FxLabel('CVV'),
                        TextField(
                          controller: _cvv,
                          keyboardType: TextInputType.number,
                          obscureText: true,
                          inputFormatters: [
                            FilteringTextInputFormatter.digitsOnly,
                            LengthLimitingTextInputFormatter(4),
                          ],
                          onChanged: (_) => setState(() {}),
                          style: AppText.body.copyWith(fontSize: 16),
                          decoration: _deco('•••', Icons.lock_outline_rounded, _cvvError),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.fromLTRB(12, 2, 4, 2),
                decoration: BoxDecoration(
                  color: AppColors.primarySofter,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Row(
                  children: [
                    Icon(Icons.bookmark_border_rounded, color: AppColors.link),
                    const SizedBox(width: 8),
                    Expanded(child: Text('Save this card for future payments', style: AppText.label)),
                    FxSwitch(value: _save, onChanged: (v) => setState(() => _save = v)),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Text('Demo mode: no real money is charged. Try 4242 4242 4242 4242.',
                  style: AppText.small.copyWith(color: AppColors.link)),
            ],
          ),
        ),
        const SizedBox(height: 14),
        FxCard(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Payment Summary', style: AppText.h2),
              const SizedBox(height: 8),
              KVRow('Plan', '${p.name} (${planDuration(p)})'),
              KVRow('Plan Amount', lkr(p.price)),
              const SizedBox(height: 8),
              TotalBar(value: lkr(p.price), fontSize: 21),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: AppColors.primarySoft.o(0.7), borderRadius: BorderRadius.circular(16)),
          child: Row(
            children: [
              Icon(Icons.verified_user_outlined, color: AppColors.link, size: 30),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Your Payment is Secure', style: AppText.h3.copyWith(fontSize: 14)),
                    Text('We use industry-standard encryption to keep your card details safe.',
                        style: AppText.small.copyWith(fontSize: 11.5, color: AppColors.text)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  InputDecoration _deco(String hint, IconData icon, String? error) {
    OutlineInputBorder b(Color c, [double w = 1]) =>
        OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: c, width: w));
    return InputDecoration(
      hintText: hint,
      hintStyle: AppText.muted.copyWith(color: AppColors.textFaint, fontSize: 15),
      prefixIcon: Icon(icon, color: AppColors.navy, size: 21),
      errorText: error,
      filled: true,
      fillColor: AppColors.surface,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
      border: b(AppColors.border),
      enabledBorder: b(AppColors.border),
      focusedBorder: b(AppColors.primary, 1.5),
      errorBorder: b(AppColors.danger),
      focusedErrorBorder: b(AppColors.danger, 1.5),
    );
  }
}

/// 4242424242424242 -> 4242 4242 4242 4242 (max 19 digits).
class _CardNumberFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    var digits = newValue.text.replaceAll(' ', '');
    if (digits.length > 19) digits = digits.substring(0, 19);
    final buf = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && i % 4 == 0) buf.write(' ');
      buf.write(digits[i]);
    }
    final text = buf.toString();
    return TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));
  }
}

/// 1228 -> 12/28
class _ExpiryFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    var digits = newValue.text.replaceAll('/', '');
    if (digits.length > 4) digits = digits.substring(0, 4);
    final text = digits.length > 2 ? '${digits.substring(0, 2)}/${digits.substring(2)}' : digits;
    return TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));
  }
}
