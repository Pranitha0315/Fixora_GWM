import 'package:flutter/material.dart';

/// Fixora colour tokens – "Pastel Garage" style.
///
/// Clean white screens, soft pastel cards (mint + sky), round icon
/// buttons, pill buttons and a floating round-icon nav bar.
/// Brand colour = Fixora teal. Light mode is the default; dark mode keeps
/// the same layout with deep pastel cards.
///
/// Brand colours stay `const`. Neutral / pastel colours switch with
/// [AppColors.dark], so they are getters.
class AppColors {
  AppColors._();

  /// Set by the app root when Light / Dark / System changes.
  static bool dark = false;

  static Color _p(int light, int darkValue) => Color(dark ? darkValue : light);

  // ---------- Brand (same in both themes) ----------
  /// Fixora teal. White text on it = 4.8:1 (AA).
  static const primary = Color(0xFF0D8075);
  static const primaryDark = Color(0xFF0B6B62);
  static const primaryLight = Color(0xFF14A394);
  static const mint = Color(0xFF5EEAD4);
  static const success = Color(0xFF1FAA59);
  static const danger = Color(0xFFE5393B);
  static const warning = Color(0xFFF08C00);
  static const purple = Color(0xFF7B5CFF);
  static const teal = Color(0xFF0FB5AE);

  /// Kept for older widgets (hazard stripe). Not used by the pastel look.
  static const hazard = Color(0xFFF5B700);
  static const hazardDark = Color(0xFF1A1A1A);
  static const amber = hazard;
  static const cyan = mint;

  /// Near-black ink (call buttons, snackbars, chips).
  static const ink = Color(0xFF151A1E);

  /// Text / icons that sit on a teal or coloured fill.
  static const onPrimary = Colors.white;

  // ---------- Neutrals (theme aware) ----------
  static Color get bg => _p(0xFFFFFFFF, 0xFF0F1517);

  /// Default card: soft grey pastel, flat (no border, no shadow).
  static Color get surface => _p(0xFFF4F7F8, 0xFF182124);

  /// Opaque surface for menus, dialogs, sheets and pickers.
  static Color get surfaceSolid => _p(0xFFFFFFFF, 0xFF182124);

  /// Chips / tiles inside a card.
  static Color get surfaceAlt => _p(0xFFFFFFFF, 0xFF1F2A2E);

  /// Headings / strongest text.
  static Color get navy => _p(0xFF151A1E, 0xFFFFFFFF);
  static Color get text => _p(0xFF2A3238, 0xFFDCE3E5);
  // Muted / faint text meet 4.5:1 on white, grey cards and input fields.
  static Color get textMuted => _p(0xFF5F6A70, 0xFF9AA7AC);
  static Color get textFaint => _p(0xFF66727A, 0xFF8A979C);

  static Color get border => _p(0xFFE6EBED, 0xFF26323A);
  static Color get divider => _p(0xFFEEF1F2, 0xFF222D31);

  /// Pill search / text fields.
  static Color get fieldFill => _p(0xFFF3F5F6, 0xFF1C2629);
  static Color get fieldBorder => _p(0xFFE1E6E8, 0xFF2C383E);

  // Pastel card colours
  /// Mint pastel – main highlight cards (current service, book service).
  static Color get primarySoft => _p(0xFFDDF4EF, 0xFF173A35);
  static Color get primarySofter => _p(0xFFECF8F5, 0xFF142D2A);

  /// Sky pastel – second highlight colour (SOS, other vehicle, mechanic).
  static Color get sky => _p(0xFFE5F0F6, 0xFF17303D);
  static Color get successSoft => _p(0xFFE3F5EA, 0xFF16332A);
  static Color get dangerSoft => _p(0xFFFDEAEA, 0xFF3A1D20);
  static Color get warningSoft => _p(0xFFFFF1DA, 0xFF3A2C14);
  static Color get purpleSoft => _p(0xFFEEEAFF, 0xFF272042);
  static Color get tealSoft => _p(0xFFDDF4F2, 0xFF153533);

  // ---------- Kept for the shared "glass" widgets (now flat) ----------
  static Color get glassSheen => surface;
  static Color get edgeLight => const Color(0x00FFFFFF);
  static Color get edgeShade => const Color(0x00FFFFFF);

  /// Floating nav pill / round buttons over photos.
  static Color get chrome => _p(0xF7FFFFFF, 0xF2182124);

  /// Bottom sheets.
  static Color get sheet => surfaceSolid;

  /// Teal for *text and thin icons* (links, active tab, values). A shade
  /// darker than [primary] in light mode so small text stays readable on
  /// mint / grey cards (5.5:1).
  static Color get link => _p(0xFF0B6B62, 0xFF5EEAD4);

  /// Status colours for *text* on white / pastel fills (4.5:1 or better).
  /// The plain [danger] / [warning] / [success] stay for icons, dots and
  /// filled badges with white text.
  static Color get dangerText => _p(0xFFC62828, 0xFFFF8A8A);
  static Color get warningText => _p(0xFF9A5800, 0xFFFFB54D);
  static Color get successText => _p(0xFF137238, 0xFF4ED68A);

  /// Readable text colour for a status/brand colour shown on its own light
  /// tint (pills, chips): swaps in the darker *Text* variant.
  static Color readable(Color c) {
    if (c == primary || c == teal || c == primaryLight) return link;
    if (c == danger) return dangerText;
    if (c == warning) return warningText;
    if (c == success) return successText;
    return c;
  }

  /// Main call-to-action button.
  static Color get buttonBg => primary;
  static Color get buttonFg => Colors.white;

  /// Round icon buttons (bell, scan, nav items).
  static Color get iconButton => _p(0xFFF1F3F4, 0xFF1F2A2E);

  /// Turns any light tint used in the UI into a matching dark tint
  /// (same hue, low lightness) when dark mode is on.
  static Color adapt(Color light) {
    if (!dark) return light;
    final hsl = HSLColor.fromColor(light);
    if (hsl.lightness < 0.55) return light; // already a strong/dark colour
    final l = (0.12 + (1 - hsl.lightness) * 0.75).clamp(0.10, 0.26).toDouble();
    final s = hsl.saturation.clamp(0.0, 0.40).toDouble();
    return hsl.withLightness(l).withSaturation(s).toColor();
  }

  // ---------- Gradients (kept subtle – flat look) ----------
  /// Flat look: both stops are the same teal, so every "gradient" fill in
  /// the app (selected chips, step numbers, toggles) is solid teal.
  static const primaryGradient = LinearGradient(
    colors: [Color(0xFF0D8075), Color(0xFF0D8075)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static LinearGradient get softGradient => LinearGradient(colors: [primarySoft, primarySoft]);

  static LinearGradient get glassGradient => LinearGradient(colors: [surface, surface]);

  /// Soft sky behind the photo card on the auth / welcome screens.
  static LinearGradient get skyGradient => LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: dark
            ? const [Color(0xFF16353A), Color(0xFF13262A), Color(0xFF0F1517)]
            : const [Color(0xFFCFEFF0), Color(0xFFE9F7F5), Color(0xFFF6FBFA)],
        stops: const [0, 0.45, 1],
      );

  static const heroGradient = LinearGradient(
    colors: [Color(0xFF0D8075), Color(0xFF0B6B62), Color(0xFF09574F)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const sosGradient = LinearGradient(
    colors: [Color(0xFFEF4F51), Color(0xFFD32F3A)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const successGradient = LinearGradient(
    colors: [Color(0xFF22A85A), Color(0xFF178A49)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
}

extension ColorOpacityX on Color {
  /// Version-safe opacity helper (works on old and new Flutter versions).
  Color o(double opacity) => withAlpha((opacity.clamp(0.0, 1.0).toDouble() * 255).round());
}

/// Flat look: cards and buttons have no shadows. Only floating things
/// (nav pill, round buttons over photos) get a soft shadow.
class AppShadows {
  AppShadows._();

  static List<BoxShadow> get card => const [];
  static List<BoxShadow> get soft => const [];
  static List<BoxShadow> get button => const [];

  /// Floating nav pill / round buttons over photos.
  static List<BoxShadow> get float => [
        BoxShadow(
          color: AppColors.dark ? Colors.black.o(0.45) : const Color(0xFF14202A).o(0.12),
          blurRadius: 30,
          offset: const Offset(0, 10),
        ),
      ];

  /// Kept for older call sites – flat look has no glows.
  static List<BoxShadow> glow(Color c, [double strength = 1]) => const [];
}
