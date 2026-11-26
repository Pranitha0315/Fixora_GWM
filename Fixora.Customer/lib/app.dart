import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'core/theme/app_colors.dart';
import 'core/theme/app_theme.dart';
import 'data/repositories/app_state.dart';
import 'features/auth/welcome_screen.dart';

class FixoraApp extends StatefulWidget {
  const FixoraApp({super.key});

  @override
  State<FixoraApp> createState() => _FixoraAppState();
}

class _FixoraAppState extends State<FixoraApp> {
  final _rootKey = GlobalKey();

  ThemeMode get _mode => switch (AppState.instance.theme) {
        'Dark' => ThemeMode.dark,
        'System' => ThemeMode.system,
        _ => ThemeMode.light,
      };

  /// Every screen reads AppColors directly, so when the theme flips we ask
  /// every widget that is already on screen (including pages lower in the
  /// navigation stack) to build again with the new colours.
  void _rebuildAll() {
    void visit(Element e) {
      e.markNeedsBuild();
      e.visitChildren(visit);
    }

    final ctx = _rootKey.currentContext;
    if (ctx is Element) {
      ctx.markNeedsBuild();
      ctx.visitChildren(visit);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AppState.instance,
      builder: (context, _) => MaterialApp(
        title: 'Fixora',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        themeMode: _mode,
        builder: (context, child) {
          final isDark = Theme.of(context).brightness == Brightness.dark;
          if (AppColors.dark != isDark) {
            AppColors.dark = isDark;
            WidgetsBinding.instance.addPostFrameCallback((_) => _rebuildAll());
          }
          return AnnotatedRegion<SystemUiOverlayStyle>(
            value: (isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark)
                .copyWith(statusBarColor: Colors.transparent),
            child: _PhoneFrame(
              key: _rootKey,
              // Applies the Text Size setting everywhere (reads the frame's
              // MediaQuery, so the phone size is kept).
              child: Builder(
                builder: (context) => MediaQuery(
                  data: MediaQuery.of(context).copyWith(
                    textScaler: TextScaler.linear(AppState.instance.textScale),
                  ),
                  child: child ?? const SizedBox.shrink(),
                ),
              ),
            ),
          );
        },
        // Opens straight on the Welcome screen (no splash / onboarding).
        home: const WelcomeScreen(),
      ),
    );
  }
}

/// On a phone the app fills the screen as usual.
/// On a wide window (Chrome / desktop) the app is shown as a centred,
/// phone-sized card so the layout and background look exactly like the
/// mobile design instead of being stretched across the whole browser.
class _PhoneFrame extends StatelessWidget {
  final Widget child;
  const _PhoneFrame({super.key, required this.child});

  static const _phoneWidth = 420.0;
  static const _maxPhoneHeight = 900.0;

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final size = mq.size;
    if (size.width < 600) return child;

    final dark = AppColors.dark;
    final height = (size.height - 40).clamp(560.0, _maxPhoneHeight).toDouble();
    final frameSize = Size(_phoneWidth, height);

    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: RadialGradient(
          center: const Alignment(0.6, -0.8),
          radius: 1.3,
          colors: dark
              ? const [Color(0xFF1B2529), Color(0xFF0A0F11)]
              : const [Color(0xFFE9EDEF), Color(0xFFDCE2E5)],
        ),
      ),
      child: Center(
        child: Container(
          width: frameSize.width,
          height: frameSize.height,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(34),
            border: Border.all(color: dark ? const Color(0x33FFFFFF) : const Color(0xCCFFFFFF), width: 1.2),
            boxShadow: [
              BoxShadow(
                color: (dark ? Colors.black : const Color(0xFF14181B)).o(dark ? 0.5 : 0.16),
                blurRadius: 50,
                offset: const Offset(0, 24),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(34),
            child: MediaQuery(
              data: mq.copyWith(
                size: frameSize,
                padding: EdgeInsets.zero,
                viewPadding: EdgeInsets.zero,
              ),
              child: child,
            ),
          ),
        ),
      ),
    );
  }
}
