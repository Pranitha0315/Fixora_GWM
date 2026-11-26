import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/utils/formatters.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/widgets/common.dart' show StatStrip;
import '../../../../core/widgets/rev_ui.dart';
import 'more_widgets.dart';

class _Payslip {
  const _Payslip(this.month, this.net, this.paidOn, this.basic, this.overtimeHours, this.overtime, this.jobBonus,
      this.allowance, this.epf);

  final String month;
  final int net;
  final String paidOn;
  final int basic;
  final int overtimeHours;
  final int overtime;
  final int jobBonus;
  final int allowance;
  final int epf;
}

/// Salary & payments: this month's pay, the breakdown and past payslips.
/// Demo figures until the payroll API is connected.
class SalaryScreen extends StatelessWidget {
  const SalaryScreen({super.key});

  static const _slips = [
    _Payslip('November 2026', 85000, 'Due 28 Nov', 70000, 8, 10400, 7800, 2400, 5600),
    _Payslip('October 2026', 85000, 'Paid 28 Oct', 70000, 8, 10400, 7800, 2400, 5600),
    _Payslip('September 2026', 82400, 'Paid 27 Sep', 70000, 6, 7800, 7800, 2400, 5600),
    _Payslip('August 2026', 84100, 'Paid 28 Aug', 70000, 7, 9100, 8200, 2400, 5600),
  ];

  void _openSlip(BuildContext context, _Payslip p) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Payslip · ${p.month}',
                  style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: AppColors.ink)),
              Text(p.paidOn, style: TextStyle(color: AppColors.body)),
              const SizedBox(height: 12),
              _Breakdown(p: p),
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: () {
                  Navigator.pop(ctx);
                  context.toast('Payslip for ${p.month} saved to Downloads', icon: Icons.download_done_rounded);
                },
                icon: const Icon(Icons.download_rounded),
                label: const Text('Download PDF'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final current = _slips[1]; // last paid month
    return MorePage(
      title: 'Salary & payments',
      children: [
        RevCard(
          color: AppColors.primarySoft,
          borderColor: AppColors.primaryBorder,
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text('Net pay · ${current.month}',
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.body)),
                  ),
                  const RevPill(label: 'Paid', tone: RevTone.green, icon: Icons.check_circle_rounded),
                ],
              ),
              const SizedBox(height: 6),
              Text(Fmt.lkr(current.net),
                  style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: AppColors.ink, height: 1.1)),
              const SizedBox(height: 4),
              Text('${current.paidOn} · Commercial Bank •••• 4821',
                  style: TextStyle(fontSize: 14, color: AppColors.body)),
            ],
          ),
        ),
        const SizedBox(height: 10),
        StatStrip(items: [('8 h', 'Overtime'), ('26', 'Jobs done'), ('28', 'Next pay (Nov)')]),
        const RevSection('This month’s breakdown'),
        _Breakdown(p: current),
        const RevSection('Payslips'),
        RevCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (var i = 0; i < _slips.length; i++)
                InkWell(
                  onTap: () => _openSlip(context, _slips[i]),
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
                    decoration: BoxDecoration(
                      border: i == _slips.length - 1 ? null : Border(bottom: BorderSide(color: AppColors.border)),
                    ),
                    child: Row(
                      children: [
                        ToneIcon(
                          icon: Icons.receipt_long_outlined,
                          tone: i == 0 ? RevTone.amber : RevTone.grey,
                          size: 40,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(_slips[i].month,
                                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink)),
                              Text(_slips[i].paidOn, style: TextStyle(fontSize: 13, color: AppColors.muted)),
                            ],
                          ),
                        ),
                        Text(i == 0 ? 'Pending' : Fmt.lkr(_slips[i].net),
                            style: TextStyle(
                              fontSize: 14.5,
                              fontWeight: FontWeight.w700,
                              color: i == 0 ? AppColors.warning : AppColors.ink,
                            )),
                        Icon(Icons.chevron_right_rounded, color: AppColors.muted),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'Questions about your pay? Ask your workshop manager. Figures shown here are demo data.',
          style: TextStyle(fontSize: 12.5, color: AppColors.muted),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

class _Breakdown extends StatelessWidget {
  const _Breakdown({required this.p});
  final _Payslip p;

  @override
  Widget build(BuildContext context) {
    return RevCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          AmountRow('Basic salary', Fmt.lkr(p.basic)),
          AmountRow('Overtime', Fmt.lkr(p.overtime), note: '${p.overtimeHours} hours × LKR 1,300'),
          AmountRow('Job incentives', Fmt.lkr(p.jobBonus), note: 'Bonus for on-time jobs'),
          AmountRow('Tool allowance', Fmt.lkr(p.allowance)),
          AmountRow('EPF (8%)', '− ${Fmt.lkr(p.epf)}', negative: true),
          AmountRow('Net pay', Fmt.lkr(p.net), strong: true, last: true),
        ],
      ),
    );
  }
}
