import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';

/// One row in an [showActionSheet] bottom sheet.
class SheetAction {
  const SheetAction({required this.icon, required this.label, required this.onTap, this.subtitle, this.danger = false});

  final IconData icon;
  final String label;
  final String? subtitle;
  final VoidCallback onTap;
  final bool danger;
}

/// The familiar mobile "options" sheet: opened by a long-press or a ⋯ button,
/// one 56px row per action, closes before the action runs.
Future<void> showActionSheet(
  BuildContext context, {
  required String title,
  String? subtitle,
  required List<SheetAction> actions,
}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(26))),
    builder: (ctx) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.ink)),
                  if (subtitle != null)
                    Text(subtitle, style: TextStyle(fontSize: 13.5, color: AppColors.body)),
                ],
              ),
            ),
            for (final a in actions)
              ListTile(
                minTileHeight: 56,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                leading: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: a.danger ? AppColors.danger.withValues(alpha: 0.12) : AppColors.primarySoft,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(a.icon, size: 21, color: a.danger ? AppColors.danger : AppColors.onPrimarySoft),
                ),
                title: Text(a.label,
                    style: TextStyle(fontWeight: FontWeight.w700, color: a.danger ? AppColors.danger : AppColors.ink)),
                subtitle: a.subtitle == null ? null : Text(a.subtitle!, style: TextStyle(color: AppColors.body)),
                onTap: () {
                  Navigator.of(ctx).pop();
                  a.onTap();
                },
              ),
          ],
        ),
      ),
    ),
  );
}
