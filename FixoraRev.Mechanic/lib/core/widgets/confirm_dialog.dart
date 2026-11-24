import 'package:flutter/material.dart';

import '../../app/theme/bronze_colors.dart';

Future<bool> confirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Confirm',
  String cancelLabel = 'Cancel',
  bool destructive = false,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: BronzeColors.surface,
      title: Text(title, style: const TextStyle(color: BronzeColors.cream)),
      content: Text(message, style: const TextStyle(color: BronzeColors.creamMuted)),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: Text(cancelLabel),
        ),
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(true),
          style: TextButton.styleFrom(
            foregroundColor:
                destructive ? BronzeColors.danger : BronzeColors.bronze,
          ),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return result ?? false;
}
