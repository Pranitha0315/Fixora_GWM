import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/widgets/buttons.dart';

/// What the `/loading` route shows, and where it goes next.
class LoadingArgs {
  const LoadingArgs({
    required this.title,
    required this.subtitle,
    required this.nextRoute,
    this.nextExtra,
    this.delay = const Duration(milliseconds: 1800),
  });

  final String title;
  final String subtitle;
  final String nextRoute;
  final Object? nextExtra;
  final Duration delay;
}

/// Full-screen loader ("Signing you in…", "Processing…").
/// When [nextRoute] is given it moves there (through GoRouter) after [delay].
class LoadingScreen extends StatefulWidget {
  const LoadingScreen({
    super.key,
    required this.title,
    required this.subtitle,
    this.nextRoute,
    this.nextExtra,
    this.delay = const Duration(milliseconds: 1800),
  });

  factory LoadingScreen.fromArgs(LoadingArgs a) => LoadingScreen(
        title: a.title,
        subtitle: a.subtitle,
        nextRoute: a.nextRoute,
        nextExtra: a.nextExtra,
        delay: a.delay,
      );

  final String title;
  final String subtitle;
  final String? nextRoute;
  final Object? nextExtra;
  final Duration delay;

  @override
  State<LoadingScreen> createState() => _LoadingScreenState();
}

class _LoadingScreenState extends State<LoadingScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: widget.delay)..forward();

  @override
  void initState() {
    super.initState();
    final next = widget.nextRoute;
    if (next != null) {
      Future<void>.delayed(widget.delay, () {
        if (mounted) context.goRoute(next, extra: widget.nextExtra);
      });
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: AppColors.background,
        body: _BrandBackdrop(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: 92,
                height: 92,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    SizedBox(
                      width: 92,
                      height: 92,
                      child: CircularProgressIndicator(
                        strokeWidth: 5,
                        color: AppColors.primarySoft,
                        value: 1,
                      ),
                    ),
                    SizedBox(
                      width: 92,
                      height: 92,
                      child: CircularProgressIndicator(
                          strokeWidth: 5, color: AppColors.primary),
                    ),
                    Icon(Icons.garage_rounded,
                        color: AppColors.primary, size: 38),
                  ],
                ),
              ),
              const SizedBox(height: 26),
              Text(widget.title,
                  style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: AppColors.ink)),
              const SizedBox(height: 8),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 40),
                child: Text(
                  widget.subtitle,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: AppColors.inkSoft, fontSize: 14.5, height: 1.4),
                ),
              ),
              const SizedBox(height: 22),
              SizedBox(
                width: 160,
                child: AnimatedBuilder(
                  animation: _c,
                  builder: (_, __) => ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: LinearProgressIndicator(
                      value: _c.value,
                      minHeight: 5,
                      backgroundColor: AppColors.primarySoft,
                    ),
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

/// Success page: "Account Created", "Password Created", …
class ResultScreen extends StatelessWidget {
  const ResultScreen({
    super.key,
    required this.title,
    required this.message,
    required this.actionLabel,
    required this.onAction,
    this.icon = Icons.check_rounded,
    this.actionIcon = Icons.login_rounded,
  });

  final String title;
  final String message;
  final String actionLabel;
  final void Function(BuildContext context) onAction;
  final IconData icon;
  final IconData actionIcon;

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: AppColors.background,
        body: _BrandBackdrop(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0.4, end: 1),
                  duration: const Duration(milliseconds: 650),
                  curve: Curves.elasticOut,
                  builder: (_, v, child) =>
                      Transform.scale(scale: v, child: child),
                  child: Container(
                    width: 112,
                    height: 112,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.primarySoft,
                      shape: BoxShape.circle,
                    ),
                    child: Container(
                      decoration: BoxDecoration(
                        gradient: AppColors.primaryGradient,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.primary.withValues(alpha: 0.35),
                            blurRadius: 18,
                            offset: const Offset(0, 8),
                          ),
                        ],
                      ),
                      child: Icon(icon, color: AppColors.onPrimary, size: 52),
                    ),
                  ),
                ),
                const SizedBox(height: 26),
                Text(
                  title,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      color: AppColors.ink),
                ),
                const SizedBox(height: 10),
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontSize: 15, color: AppColors.inkSoft, height: 1.45),
                ),
                const SizedBox(height: 30),
                PrimaryButton(
                  label: actionLabel,
                  icon: actionIcon,
                  onPressed: () => onAction(context),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Google / email login loader: poster clear; status sits on the background (no box).
class _BrandBackdrop extends StatelessWidget {
  const _BrandBackdrop({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        Image.asset(
          'assets/images/login_loading_art.jpg',
          fit: BoxFit.cover,
          alignment: Alignment.topCenter,
          filterQuality: FilterQuality.high,
        ),
        SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
              child: child,
            ),
          ),
        ),
      ],
    );
  }
}
