import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';

/// App bar + padded list used by every Profile → More page.
class MorePage extends StatelessWidget {
  const MorePage({super.key, required this.title, required this.children, this.subtitle, this.bottom});

  final String title;
  final String? subtitle;
  final List<Widget> children;
  final Widget? bottom;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
        children: [
          if (subtitle != null) ...[
            Text(subtitle!, style: TextStyle(fontSize: 14.5, color: AppColors.body, height: 1.4)),
            const SizedBox(height: 6),
          ],
          ...children,
        ],
      ),
      bottomNavigationBar: bottom,
    );
  }
}

/// Label on the left, value on the right, hairline below.
class AmountRow extends StatelessWidget {
  const AmountRow(this.label, this.value, {super.key, this.note, this.strong = false, this.negative = false, this.last = false});

  final String label;
  final String value;
  final String? note;
  final bool strong;
  final bool negative;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(border: last ? null : Border(bottom: BorderSide(color: AppColors.border))),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: strong ? FontWeight.w800 : FontWeight.w600,
                      color: AppColors.ink,
                    )),
                if (note != null) Text(note!, style: TextStyle(fontSize: 13, color: AppColors.muted)),
              ],
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: strong ? 16 : 15,
              fontWeight: strong ? FontWeight.w800 : FontWeight.w600,
              color: negative ? AppColors.danger : AppColors.ink,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}
