import 'package:flutter/material.dart';

import '../../../../app/theme/bronze_colors.dart';

/// Shared layout for auth / invitation screens.
class AuthScaffold extends StatelessWidget {
  const AuthScaffold({
    super.key,
    required this.child,
    this.showBack = false,
    this.onBack,
    this.title,
  });

  final Widget child;
  final bool showBack;
  final VoidCallback? onBack;
  final String? title;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BronzeColors.charcoal,
      appBar: showBack || title != null
          ? AppBar(
              backgroundColor: BronzeColors.charcoal,
              elevation: 0,
              leading: showBack
                  ? IconButton(
                      icon: const Icon(Icons.arrow_back_rounded),
                      color: BronzeColors.cream,
                      onPressed: onBack ?? () => Navigator.of(context).maybePop(),
                    )
                  : null,
              title: title == null
                  ? null
                  : Text(
                      title!,
                      style: const TextStyle(color: BronzeColors.cream),
                    ),
            )
          : null,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          child: child,
        ),
      ),
    );
  }
}
