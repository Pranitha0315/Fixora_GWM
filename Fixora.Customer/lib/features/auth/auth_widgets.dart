import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/core.dart';
import '../../data/remote/customer_backend.dart';
import '../shell/main_shell.dart';
import '../sos/sos_screen.dart';
import 'workshop_hero.dart';

const kLogo = 'assets/images/fixora_logo.png';
const kLogoMark = 'assets/images/fixora_logo_mark.png';
const kLogoDark = 'assets/images/fixora_logo_dark.png';
const kLogoMarkDark = 'assets/images/fixora_logo_mark_dark.png';

/// The Fixora logo image (with or without the tagline).
class FixoraLogoImage extends StatelessWidget {
  final double width;
  final bool tagline;
  const FixoraLogoImage({super.key, this.width = 220, this.tagline = true});

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      AppColors.dark ? (tagline ? kLogoDark : kLogoMarkDark) : (tagline ? kLogo : kLogoMark),
      width: width,
      fit: BoxFit.contain,
      filterQuality: FilterQuality.high,
      errorBuilder: (_, __, ___) => const FixoraLogo(size: 64),
    );
  }
}

/// Auth page (Pastel Garage style), used by every auth screen:
/// soft mint sky on top with the "Fixora · CAR CARE" title, an optional
/// [hero] (rounded workshop photo card), and the form in a white sheet
/// with big rounded top corners.
class AuthScaffold extends StatefulWidget {
  final List<Widget> children;
  final bool showBack;
  final Widget? bottom;

  /// Shown on the sky, above the white sheet (photo card + dots).
  final Widget? hero;

  /// Top-right round button (e.g. Roadside SOS).
  final Widget? topRight;

  /// Illustration that stands on the white sheet: its bottom part is
  /// tucked behind the sheet's top edge, so the sheet works like a desk.
  final Widget? art;

  /// Pass one in when the [hero] shows the workshop photo slider.
  final SlideshowController? slides;

  const AuthScaffold({
    super.key,
    required this.children,
    this.showBack = true,
    this.bottom,
    this.hero,
    this.topRight,
    this.slides,
    this.art,
  });

  @override
  State<AuthScaffold> createState() => _AuthScaffoldState();
}

class _AuthScaffoldState extends State<AuthScaffold> {
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final slides = widget.slides;
    if (_started || slides == null) return;
    _started = true;
    // Respect the phone's "remove animations" setting: start paused.
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      slides.setPaused(true);
    }
    slides.start();
    // Load all slider photos up front so each slide fades in without a gap.
    for (final p in kWorkshopPhotos) {
      precacheImage(AssetImage(p.asset), context, onError: (error, stackTrace) {});
    }
  }

  @override
  Widget build(BuildContext context) {
    final animate = !(MediaQuery.maybeDisableAnimationsOf(context) ?? false);
    // Freeze the photos while the keyboard is open.
    widget.slides?.setHeld(MediaQuery.viewInsetsOf(context).bottom > 0);
    final bottomInset = MediaQuery.of(context).padding.bottom;
    final dark = AppColors.dark;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: (dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark)
          .copyWith(statusBarColor: Colors.transparent),
      child: Scaffold(
        backgroundColor: AppColors.surfaceSolid,
        body: DecoratedBox(
          decoration: BoxDecoration(gradient: AppColors.skyGradient),
          child: SafeArea(
            bottom: false,
            child: LayoutBuilder(
              builder: (context, constraints) {
                return SingleChildScrollView(
                  physics: const BouncingScrollPhysics(),
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  child: ConstrainedBox(
                    constraints: BoxConstraints(minHeight: constraints.maxHeight),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              _AuthTopBar(showBack: widget.showBack, trailing: widget.topRight),
                              if (widget.hero != null) ...[
                                const SizedBox(height: 18),
                                Center(
                                  child: ConstrainedBox(
                                    constraints: const BoxConstraints(maxWidth: 520),
                                    child: widget.hero!,
                                  ),
                                ),
                              ],
                              const SizedBox(height: 22),
                            ],
                          ),
                        ),
                        _SlideUpOnce(
                          enabled: animate,
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              // Painted first, so the sheet below covers its bottom 12 %.
                              if (widget.art != null)
                                FractionalTranslation(
                                  translation: const Offset(0, 0.12),
                                  child: widget.art!,
                                ),
                              Container(
                                decoration: BoxDecoration(
                                  color: AppColors.surfaceSolid,
                                  borderRadius: const BorderRadius.vertical(top: Radius.circular(34)),
                                ),
                                padding: EdgeInsets.fromLTRB(22, 28, 22, 18 + bottomInset),
                                child: Center(
                                  child: ConstrainedBox(
                                    constraints: const BoxConstraints(maxWidth: 480),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.stretch,
                                      children: [
                                        ...widget.children,
                                        if (widget.bottom != null) ...[
                                          const SizedBox(height: 12),
                                          widget.bottom!,
                                        ],
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

/// Back button · centred "Fixora / C A R  C A R E" title · optional action.
class _AuthTopBar extends StatelessWidget {
  final bool showBack;
  final Widget? trailing;
  const _AuthTopBar({required this.showBack, this.trailing});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 64,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Semantics(
            header: true,
            label: 'Fixora car care',
            excludeSemantics: true,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Fixora',
                    style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: AppColors.navy, height: 1.1)),
                const SizedBox(height: 6),
                Text('C A R    C A R E',
                    style: TextStyle(fontSize: 11, letterSpacing: 2.5, color: AppColors.textMuted, fontWeight: FontWeight.w500)),
              ],
            ),
          ),
          if (showBack) Align(alignment: Alignment.centerLeft, child: FxBackButton(onPhoto: true)),
          if (trailing != null) Align(alignment: Alignment.centerRight, child: trailing!),
        ],
      ),
    );
  }
}

/// White round "SOS" button for the auth top bar (Roadside SOS without login).
class AuthSosButton extends StatelessWidget {
  const AuthSosButton({super.key});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Roadside SOS without login',
      excludeSemantics: true,
      child: Material(
        color: AppColors.chrome,
        shape: const StadiumBorder(),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: () => context.push(const SosScreen(showNav: false)),
          child: SizedBox(
            height: 44,
            child: Padding(
              padding: EdgeInsets.fromLTRB(10, 0, 14, 0),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.sos_rounded, color: AppColors.danger, size: 22),
                  SizedBox(width: 4),
                  Text('SOS', style: TextStyle(color: AppColors.dangerText, fontSize: 14, fontWeight: FontWeight.w800)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Slides the sheet up once when the screen opens. Skipped when the phone's
/// "remove animations" setting is on.
class _SlideUpOnce extends StatelessWidget {
  const _SlideUpOnce({required this.enabled, required this.child});

  final bool enabled;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!enabled) return child;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 1, end: 0),
      duration: const Duration(milliseconds: 520),
      curve: Curves.easeOutCubic,
      child: child,
      builder: (context, t, child) => Transform.translate(offset: Offset(0, 48 * t), child: child),
    );
  }
}

/// Centred title + subtitle at the top of the white auth sheet.
class AuthHeader extends StatelessWidget {
  final String title;
  final String subtitle;
  final double logoWidth;
  const AuthHeader({super.key, required this.title, required this.subtitle, this.logoWidth = 190});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Semantics(
          header: true,
          child: Text(title,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 22, height: 1.25, fontWeight: FontWeight.w700, color: AppColors.navy)),
        ),
        const SizedBox(height: 8),
        Text(subtitle,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13.5, height: 1.5, color: AppColors.textMuted)),
        const SizedBox(height: 22),
      ],
    );
  }
}

/// "Continue with Google" button.
///
/// Replace the round "G" badge with Google's official sign-in button
/// asset (developers.google.com/identity/branding-guidelines) when you
/// connect real Google Sign-In.
class GoogleButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final String label;
  final bool loading;
  const GoogleButton({super.key, this.onPressed, this.label = 'Continue with Google', this.loading = false});

  @override
  Widget build(BuildContext context) {
    return FxPressable(
      radius: 27,
      pressedScale: 0.97,
      onTap: loading ? null : onPressed,
      child: FxGlass(
        radius: 27,
        color: AppColors.fieldFill,
        borderColor: AppColors.edgeLight,
        borderWidth: 1.2,
        child: SizedBox(
          height: 54,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (loading)
                SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2.4, color: AppColors.link),
                )
              else
                Container(
                  width: 30,
                  height: 30,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.white),
                  child: Image.asset(
                    'assets/images/google_g.png',
                    width: 19,
                    height: 19,
                    excludeFromSemantics: true,
                    errorBuilder: (context, error, stackTrace) => const Text('G',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Color(0xFF1A73E8))),
                  ),
                ),
              const SizedBox(width: 12),
              Text(label, style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600, color: AppColors.navy)),
            ],
          ),
        ),
      ),
    );
  }
}

/// "──── or continue with ────"
class OrDivider extends StatelessWidget {
  final String text;
  const OrDivider({super.key, this.text = 'or continue with'});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 18),
      child: Row(
        children: [
          Expanded(child: Divider(color: AppColors.border, thickness: 1.2)),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(text, style: AppText.muted.copyWith(fontSize: 13)),
          ),
          Expanded(child: Divider(color: AppColors.border, thickness: 1.2)),
        ],
      ),
    );
  }
}

/// "Don't have an account? Sign Up"
class AuthSwitchLink extends StatelessWidget {
  final String question;
  final String action;
  final VoidCallback onTap;
  const AuthSwitchLink({super.key, required this.question, required this.action, required this.onTap});

  @override
  Widget build(BuildContext context) {
    // Wrap (not Row) so big system font sizes move the link to a new line
    // instead of overflowing.
    return Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Text(question, style: AppText.muted.copyWith(fontSize: 14)),
        TextButton(
          onPressed: onTap,
          style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 6)),
          child: Text(action, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
        ),
      ],
    );
  }
}

/// Password strength 0..1.
double passwordStrength(String p) {
  var s = 0.0;
  if (p.length >= 8) s += 0.25;
  if (RegExp(r'[A-Z]').hasMatch(p) && RegExp(r'[a-z]').hasMatch(p)) s += 0.25;
  if (RegExp(r'[0-9]').hasMatch(p)) s += 0.25;
  if (RegExp(r'[^A-Za-z0-9]').hasMatch(p)) s += 0.25;
  return s;
}

/// Strength bar + label under a password field.
class PasswordStrengthBar extends StatelessWidget {
  final String password;
  const PasswordStrengthBar({super.key, required this.password});

  @override
  Widget build(BuildContext context) {
    final s = passwordStrength(password);
    final (label, color) = s <= 0.25
        ? ('Weak', AppColors.danger)
        : s <= 0.5
            ? ('Fair', AppColors.warning)
            : s < 1
                ? ('Good', AppColors.primary)
                : ('Strong', AppColors.success);
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        children: [
          Expanded(child: FxProgressBar(value: password.isEmpty ? 0 : s, color: color, height: 6)),
          const SizedBox(width: 10),
          SizedBox(
            width: 52,
            child: Text(password.isEmpty ? '' : label,
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color)),
          ),
        ],
      ),
    );
  }
}

/// Eye toggle used in password fields.
class EyeToggle extends StatelessWidget {
  final bool visible;
  final VoidCallback onTap;
  const EyeToggle({super.key, required this.visible, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onTap,
      icon: Icon(visible ? Icons.visibility_off_outlined : Icons.visibility_outlined, color: AppColors.textMuted),
    );
  }
}

/// Clears the stack and opens the app.
void goToHome(BuildContext context) {
  NavController.tab.value = 0;
  Navigator.of(context).pushAndRemoveUntil(fxRoute(const MainShell()), (_) => false);
}

/// Demo Google account chooser. Replace with the google_sign_in package
/// (see README) to use real Google accounts.
Future<GoogleAccount?> showGoogleAccountPicker(BuildContext context) {
  final app = AppState.instance;
  final known = <GoogleAccount>[
    GoogleAccount(name: app.profile.name, email: 'thanuthanujan006@gmail.com'),
    const GoogleAccount(name: 'Fixora Demo', email: 'fixora.demo@gmail.com'),
  ];
  return showFxSheet<GoogleAccount>(
    context,
    builder: (ctx) => _GooglePicker(accounts: known),
  );
}

class _GooglePicker extends StatefulWidget {
  final List<GoogleAccount> accounts;
  const _GooglePicker({required this.accounts});

  @override
  State<_GooglePicker> createState() => _GooglePickerState();
}

class _GooglePickerState extends State<_GooglePicker> {
  bool _other = false;
  final _name = TextEditingController();
  final _email = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Center(
          child: Text('G', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w900, color: Color(0xFF1A73E8))),
        ),
        const SizedBox(height: 6),
        Text('Choose an account', textAlign: TextAlign.center, style: AppText.h1),
        const SizedBox(height: 4),
        Text('to continue to Fixora', textAlign: TextAlign.center, style: AppText.muted),
        const SizedBox(height: 14),
        if (!_other) ...[
          for (final a in widget.accounts)
            ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 4),
              leading: CircleAvatar(
                backgroundColor: AppColors.primarySoft,
                child: Text(a.name.isEmpty ? '?' : a.name[0].toUpperCase(),
                    style: TextStyle(color: AppColors.link, fontWeight: FontWeight.w800)),
              ),
              title: Text(a.name, style: AppText.label.copyWith(fontSize: 14.5)),
              subtitle: Text(a.email, style: AppText.small),
              onTap: () => Navigator.of(context).pop(a),
            ),
          Divider(color: AppColors.divider),
          ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 4),
            leading: CircleAvatar(
              backgroundColor: AppColors.primarySofter,
              child: Icon(Icons.person_add_alt_1_outlined, color: AppColors.navy),
            ),
            title: Text('Use another account', style: AppText.label),
            onTap: () => setState(() => _other = true),
          ),
        ] else ...[
          FxInput(controller: _name, hint: 'Your name', icon: Icons.person_outline_rounded, capitalization: TextCapitalization.words),
          const SizedBox(height: 10),
          FxInput(
            controller: _email,
            hint: 'Gmail address',
            icon: Icons.mail_outline_rounded,
            keyboardType: TextInputType.emailAddress,
            errorText: _error,
          ),
          const SizedBox(height: 14),
          PrimaryButton(
            label: 'Next',
            onPressed: () {
              final email = _email.text.trim();
              if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]{2,}$').hasMatch(email) || _name.text.trim().isEmpty) {
                setState(() => _error = 'Enter your name and a valid email');
                return;
              }
              Navigator.of(context).pop(GoogleAccount(name: _name.text.trim(), email: email));
            },
          ),
        ],
        const SizedBox(height: 10),
        Text(
          'Demo sign-in: no data is sent to Google. Real Google Sign-In can be connected later.',
          textAlign: TextAlign.center,
          style: AppText.small.copyWith(fontSize: 11),
        ),
      ],
    );
  }
}

/// Signs in with Google (demo) and opens Home. Shared by Welcome, Login, Register.
Future<void> continueWithGoogle(BuildContext context, void Function(bool) setLoading) async {
  if (CustomerBackend.instance.enabled) {
    // Google sign-in is demo only; a demo account never reaches the garage.
    showFxSnack(context, 'Google sign-in is not available yet. Log in with email, or create an account.',
        icon: Icons.info_outline_rounded);
    return;
  }
  final account = await showGoogleAccountPicker(context);
  if (account == null || !context.mounted) return;
  setLoading(true);
  await Future<void>.delayed(const Duration(milliseconds: 1100));
  if (!context.mounted) return;
  final isNew = AppState.instance.signInWithGoogle(account);
  setLoading(false);
  showFxSnack(context, isNew ? 'Welcome to Fixora, ${account.name}!' : 'Signed in as ${account.email}');
  goToHome(context);
}
