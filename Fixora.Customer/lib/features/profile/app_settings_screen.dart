import 'package:flutter/material.dart';

import '../../core/core.dart';

/// App Settings: appearance, language, preferences and other options.
class AppSettingsScreen extends StatelessWidget {
  const AppSettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) => FxPage(
        title: 'App Settings',
        subtitle: 'Customize your app experience',
        compactHeader: true,
        children: [
          const SectionTitle('Appearance', padding: EdgeInsets.fromLTRB(2, 4, 2, 10)),
          FxSettingsGroup(children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      SizedBox(width: 32, child: Icon(Icons.palette_outlined, color: AppColors.link, size: 26)),
                      SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('App Theme', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.navy)),
                            Text('Choose how the app looks', style: TextStyle(fontSize: 12, color: AppColors.textMuted)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      _themeChip(context, 'Light', Icons.light_mode_outlined),
                      const SizedBox(width: 8),
                      _themeChip(context, 'Dark', Icons.dark_mode_outlined),
                      const SizedBox(width: 8),
                      _themeChip(context, 'System', Icons.desktop_windows_outlined),
                    ],
                  ),
                ],
              ),
            ),
            FxSettingsTile(
              icon: Icons.text_fields_rounded,
              title: 'Text Size',
              subtitle: 'Adjust the app text size',
              trailing: ValueChip(app.textSize),
              onTap: () async {
                final v = await pickOption(context,
                    title: 'Text Size', options: AppState.textSizes.keys.toList(), selected: app.textSize);
                if (v != null) app.update(() => app.textSize = v);
              },
            ),
          ]),
          const SectionTitle('Language & Region'),
          FxSettingsGroup(children: [
            FxSettingsTile(
              icon: Icons.translate_rounded,
              title: 'Language',
              subtitle: 'Choose your app language',
              trailing: ValueChip(app.language),
              onTap: () async {
                final v = await pickOption(context,
                    title: 'Language',
                    options: const ['English', 'தமிழ்', 'සිංහල'],
                    selected: app.language,
                    subtitles: const {'தமிழ்': 'Tamil', 'සිංහල': 'Sinhala'});
                if (v == null) return;
                app.update(() => app.language = v);
                if (v != 'English' && context.mounted) {
                  showFxSnack(context, 'Saved. Full $v translation arrives in the next update.',
                      icon: Icons.translate_rounded);
                }
              },
            ),
            FxSettingsTile(
              icon: Icons.location_on_outlined,
              title: 'Region',
              subtitle: 'Select your country or region',
              trailing: ValueChip(app.region),
              onTap: () async {
                final v = await pickOption(context,
                    title: 'Region', options: const ['Sri Lanka', 'India', 'Maldives'], selected: app.region);
                if (v != null) app.update(() => app.region = v);
              },
            ),
          ]),
          const SectionTitle('Preferences'),
          FxSettingsGroup(children: [
            FxSettingsTile(
              icon: Icons.notifications_none_rounded,
              title: 'Push Notifications',
              subtitle: 'Receive service updates, offers and reminders',
              chevron: false,
              trailing: FxSwitch(
                value: app.pushNotifications,
                onChanged: (v) => app.update(() => app.pushNotifications = v),
              ),
            ),
            FxSettingsTile(
              icon: Icons.volume_up_outlined,
              title: 'Sound',
              subtitle: 'Play sounds for app actions and alerts',
              chevron: false,
              trailing: FxSwitch(value: app.sound, onChanged: (v) => app.update(() => app.sound = v)),
            ),
            FxSettingsTile(
              icon: Icons.vibration_rounded,
              title: 'Vibration',
              subtitle: 'Vibrate for important alerts and updates',
              chevron: false,
              trailing: FxSwitch(value: app.vibration, onChanged: (v) => app.update(() => app.vibration = v)),
            ),
          ]),
          const SectionTitle('Other'),
          FxSettingsGroup(children: [
            FxSettingsTile(
              icon: Icons.speed_rounded,
              title: 'Units',
              subtitle: 'Choose your distance unit',
              trailing: ValueChip(app.units),
              onTap: () async {
                final v = await pickOption(context,
                    title: 'Distance unit', options: const ['Kilometers', 'Miles'], selected: app.units);
                if (v != null) app.update(() => app.units = v);
              },
            ),
            FxSettingsTile(
              icon: Icons.cleaning_services_outlined,
              title: 'Clear Cache',
              subtitle: 'Free up space by removing temporary files',
              onTap: () => _clearCache(context),
            ),
          ]),
          const SizedBox(height: 14),
          Center(
            child: TextButton.icon(
              onPressed: () {
                app.update(() {
                  app.theme = 'Light';
                  app.textSize = 'Default';
                  app.language = 'English';
                  app.region = 'Sri Lanka';
                  app.pushNotifications = true;
                  app.sound = true;
                  app.vibration = true;
                  app.units = 'Kilometers';
                });
                showFxSnack(context, 'Settings reset to default');
              },
              icon: const Icon(Icons.restart_alt_rounded),
              label: const Text('Reset to default'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _themeChip(BuildContext context, String label, IconData icon, {bool soon = false}) {
    final app = AppState.instance;
    final sel = app.theme == label;
    return Expanded(
      child: GestureDetector(
        onTap: () {
          app.feedback();
          if (soon) {
            showFxSnack(context, 'Dark theme is coming in the next update', icon: Icons.dark_mode_outlined);
            return;
          }
          app.update(() => app.theme = label);
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          height: 42,
          decoration: BoxDecoration(
            gradient: sel ? AppColors.primaryGradient : null,
            color: sel ? null : AppColors.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: sel ? Colors.transparent : AppColors.border),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18, color: sel ? Colors.white : AppColors.navy),
              const SizedBox(width: 5),
              Text(label,
                  style: TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w600, color: sel ? Colors.white : AppColors.navy)),
              if (soon) ...[
                const SizedBox(width: 4),
                Text('soon', style: TextStyle(fontSize: 9, color: AppColors.textFaint)),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _clearCache(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        title: const Text('Clear cache?'),
        content: const Text('Downloaded images and temporary files will be removed. Your data stays safe.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Clear')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final cache = PaintingBinding.instance.imageCache;
    final mb = cache.currentSizeBytes / (1024 * 1024);
    cache.clear();
    cache.clearLiveImages();
    showFxSnack(context, 'Cache cleared (${mb.toStringAsFixed(1)} MB freed)', icon: Icons.cleaning_services_outlined);
  }
}
