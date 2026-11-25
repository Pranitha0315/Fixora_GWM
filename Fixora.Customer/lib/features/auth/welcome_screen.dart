import 'package:flutter/material.dart';

import '../../core/core.dart';
import 'auth_widgets.dart';
import 'login_screen.dart';
import 'register_screen.dart';
import 'workshop_hero.dart' show AuthHeroHeading;

/// First screen after onboarding: Google / Login / Create account.
/// UI: Pastel Garage – soft sky top with the Fixora title, an illustration of
/// a mechanic shaking hands with a customer, standing behind the white sheet, then the
/// heading + actions in the sheet.
class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key});

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen> {
  bool _google = false;

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      showBack: false,
      art: const _WelcomeArt(),
      children: [
        const AuthHeroHeading(
          title: 'Your garage, in your pocket.',
          subtitle: 'Book services, approve estimates and track repairs live – all in one app.',
        ),
        const SizedBox(height: 22),
        PrimaryButton(
          label: 'Log in',
          height: 56,
          fontSize: 17,
          onPressed: () => context.push(const LoginScreen()),
        ),
        const SizedBox(height: 12),
        GoogleButton(
          loading: _google,
          onPressed: () => continueWithGoogle(context, (v) => setState(() => _google = v)),
        ),
        const SizedBox(height: 12),
        OutlineButton2(
          label: 'Create an Account',
          icon: Icons.person_add_alt_1_outlined,
          onPressed: () => context.push(const RegisterScreen()),
        ),
        const SizedBox(height: 4),
      ],
    );
  }
}

/// Mechanic + customer handshake with the car behind them (background
/// removed, car kept). The
/// artwork is cropped at the bottom, and that edge hides behind the sheet.
class _WelcomeArt extends StatelessWidget {
  const _WelcomeArt();

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return Align(
      alignment: Alignment.bottomCenter,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: 460, maxHeight: size.height * 0.38),
        child: Image.asset(
          'assets/images/welcome_people.webp',
          fit: BoxFit.contain,
          alignment: Alignment.bottomCenter,
          cacheWidth: (460 * MediaQuery.devicePixelRatioOf(context)).round().clamp(300, 900),
          semanticLabel: 'A Fixora mechanic shaking hands with a customer',
          errorBuilder: (context, error, stackTrace) => const SizedBox.shrink(),
        ),
      ),
    );
  }
}
