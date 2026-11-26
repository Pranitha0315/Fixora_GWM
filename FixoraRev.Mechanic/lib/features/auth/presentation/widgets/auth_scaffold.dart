import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/fixora_logo.dart';

/// Garage photo + brand on top, white rounded sheet with the form below.
class AuthScaffold extends StatelessWidget {
  const AuthScaffold(
      {super.key, required this.child, this.showBack = false, this.onBack});

  final Widget child;
  final bool showBack;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final width = media.size.width;
    final heroHeight = (width * 0.73).clamp(240.0, 360.0).toDouble();

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: AppColors.background,
        body: SingleChildScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          child: Stack(
            children: [
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                height: heroHeight,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Image.asset(
                      'assets/images/garage_banner.jpg',
                      fit: BoxFit.cover,
                      alignment: Alignment.centerRight,
                    ),
                    const DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [Colors.transparent, Color(0x33000000)],
                          stops: [0.6, 1],
                        ),
                      ),
                    ),
                    // Logo only when there is no back arrow (they share this corner).
                    if (!showBack)
                      Positioned(
                        top: media.padding.top + 12,
                        left: 16,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 7),
                          decoration: BoxDecoration(
                            color: AppColors.surface.withValues(alpha: 0.94),
                            borderRadius: BorderRadius.circular(14),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.16),
                                blurRadius: 12,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: const FixoraLogo(size: 28, showTagline: false),
                        ),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: EdgeInsets.only(top: heroHeight - 30),
                child: Container(
                  constraints: BoxConstraints(
                      minHeight: media.size.height - heroHeight + 30),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius:
                        const BorderRadius.vertical(top: Radius.circular(30)),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.12),
                        blurRadius: 24,
                        offset: const Offset(0, -6),
                      ),
                    ],
                  ),
                  padding: EdgeInsets.fromLTRB(
                      22, 14, 22, 24 + media.padding.bottom),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Center(
                        child: Container(
                          width: 42,
                          height: 4,
                          margin: const EdgeInsets.only(bottom: 18),
                          decoration: BoxDecoration(
                            color: AppColors.primaryBorder,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                      ),
                      child,
                    ],
                  ),
                ),
              ),
              if (showBack)
                Positioned(
                  top: media.padding.top + 8,
                  left: 12,
                  child: Material(
                    color: AppColors.surface.withValues(alpha: 0.92),
                    shape: const CircleBorder(),
                    child: IconButton(
                      icon: Icon(Icons.arrow_back_rounded,
                          color: AppColors.ink),
                      onPressed:
                          onBack ?? () => Navigator.of(context).maybePop(),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Big title + subtitle used at the top of auth sheets.
class AuthHeading extends StatelessWidget {
  const AuthHeading({super.key, required this.title, this.subtitle});
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          title,
          textAlign: TextAlign.center,
          style: TextStyle(
              fontSize: 24, fontWeight: FontWeight.w800, color: AppColors.ink),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 8),
          Text(
            subtitle!,
            textAlign: TextAlign.center,
            style: TextStyle(
                fontSize: 14.5, color: AppColors.inkSoft, height: 1.4),
          ),
        ],
      ],
    );
  }
}

class OrDivider extends StatelessWidget {
  const OrDivider({super.key, this.label = 'Or continue with'});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 18),
      child: Row(
        children: [
          Expanded(child: Divider(color: AppColors.border, thickness: 1)),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(label,
                style: TextStyle(color: AppColors.muted, fontSize: 13)),
          ),
          Expanded(child: Divider(color: AppColors.border, thickness: 1)),
        ],
      ),
    );
  }
}
