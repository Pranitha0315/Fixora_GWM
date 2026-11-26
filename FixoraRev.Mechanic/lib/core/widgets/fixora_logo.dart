import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// "FIXORA REV" word-mark drawn in code: the X is a pair of crossed
/// wrenches and the O is an orange wheel/gear, as in the brand mock-ups.
class FixoraLogo extends StatelessWidget {
  const FixoraLogo({
    super.key,
    this.size = 40,
    this.onDark = false,
    this.showTagline = true,
  });

  /// Cap height of the main letters.
  final double size;

  /// White letters (for photos / orange backgrounds) instead of ink.
  final bool onDark;
  final bool showTagline;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: EdgeInsets.all(onDark ? size * 0.08 : 0),
          decoration: onDark
              ? BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(size * 0.12))
              : null,
          child: Image.asset(
            'assets/images/fixora_rev_logo.png',
            width: size * 3,
            height: size,
            fit: BoxFit.contain,
            filterQuality: FilterQuality.high,
          ),
        ),
        if (showTagline) ...[
          SizedBox(height: size * 0.04),
          Text(
            'Your Garage. Our Technology.',
            style: TextStyle(
              fontSize: (size * 0.34).clamp(11, 18).toDouble(),
              fontWeight: FontWeight.w500,
              color: onDark ? Colors.white70 : AppColors.inkSoft,
            ),
          ),
        ],
      ],
    );
  }
}

/// Square app-mark used in app bars and avatars.
class FixoraMark extends StatelessWidget {
  const FixoraMark({super.key, this.size = 40});
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: AppColors.primaryGradient,
        borderRadius: BorderRadius.circular(size * 0.28),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(size * 0.28),
        child: Image.asset(
          'assets/images/fixora_rev_app_icon.png',
          fit: BoxFit.cover,
        ),
      ),
    );
  }
}
