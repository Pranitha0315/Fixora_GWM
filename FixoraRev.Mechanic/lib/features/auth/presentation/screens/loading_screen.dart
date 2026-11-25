import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/bronze_colors.dart';
import '../../../shell/presentation/main_shell.dart';

/// Brief bridge after auth before landing on [next].
class LoadingScreen extends StatefulWidget {
  const LoadingScreen({
    super.key,
    required this.title,
    this.subtitle,
    this.next = const MainShell(),
  });

  final String title;
  final String? subtitle;
  final Widget next;

  @override
  State<LoadingScreen> createState() => _LoadingScreenState();
}

class _LoadingScreenState extends State<LoadingScreen> {
  @override
  void initState() {
    super.initState();
    _go();
  }

  Future<void> _go() async {
    await Future<void>.delayed(const Duration(milliseconds: 900));
    if (!mounted) return;
    if (widget.next is MainShell) {
      context.go(RouteNames.shell);
      return;
    }
    context.go(RouteNames.shell);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BronzeColors.charcoal,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(
                width: 36,
                height: 36,
                child: CircularProgressIndicator(
                  strokeWidth: 3,
                  color: BronzeColors.bronze,
                ),
              ),
              const SizedBox(height: 24),
              Text(
                widget.title,
                style: Theme.of(context).textTheme.titleLarge,
                textAlign: TextAlign.center,
              ),
              if (widget.subtitle != null) ...[
                const SizedBox(height: 8),
                Text(
                  widget.subtitle!,
                  style: const TextStyle(color: BronzeColors.creamMuted),
                  textAlign: TextAlign.center,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
