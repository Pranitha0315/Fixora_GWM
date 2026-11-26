import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

/// One pin on an [FxOsmMap].
class FxMapPin {
  const FxMapPin(this.point, {this.icon = Icons.location_on_rounded, this.color = const Color(0xFFE5484D), this.pulse = false, this.label});
  final LatLng point;
  final IconData icon;
  final Color color;

  /// Pulsing ring (use it for the live SOS pin).
  final bool pulse;
  final String? label;
}

/// OpenStreetMap map (free, no API key). Shows the required "© OpenStreetMap contributors" credit.
/// Used by: SOS alert detail (FX13-D10-KAB-1): customer location + Navigate.
class FxOsmMap extends StatelessWidget {
  const FxOsmMap({
    super.key,
    required this.center,
    this.pins = const [],
    this.zoom = 15,
    this.height = 190,
    this.onTap,
    this.interactive = true,
  });

  final LatLng center;
  final List<FxMapPin> pins;
  final double zoom;
  final double height;

  /// Tap on the map → new point (lets the customer correct the SOS pin).
  final ValueChanged<LatLng>? onTap;
  final bool interactive;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: SizedBox(
        height: height,
        child: FlutterMap(
          options: MapOptions(
            initialCenter: center,
            initialZoom: zoom,
            onTap: onTap == null ? null : (_, point) => onTap!(point),
            interactionOptions: InteractionOptions(
              flags: interactive ? InteractiveFlag.all & ~InteractiveFlag.rotate : InteractiveFlag.none,
            ),
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              // OSM tile policy: identify the app. Use the real applicationId from android/app/build.gradle.
              userAgentPackageName: 'com.fixora.fixora_rev',
            ),
            MarkerLayer(
              markers: [
                for (final p in pins)
                  Marker(point: p.point, width: 64, height: 64, child: _Pin(pin: p)),
              ],
            ),
            RichAttributionWidget(
              attributions: [
                TextSourceAttribution(
                  'OpenStreetMap contributors',
                  onTap: () => launchUrl(Uri.parse('https://www.openstreetmap.org/copyright')),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Opens Google Maps (app or browser) with driving directions. Free: no API key, just a link.
Future<bool> openDirections(double lat, double lng) => launchUrl(
      Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng'),
      mode: LaunchMode.externalApplication,
    );

class _Pin extends StatefulWidget {
  const _Pin({required this.pin});
  final FxMapPin pin;

  @override
  State<_Pin> createState() => _PinState();
}

class _PinState extends State<_Pin> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400));

  @override
  void initState() {
    super.initState();
    if (widget.pin.pulse) _c.repeat();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.pin;
    final icon = Icon(p.icon, color: p.color, size: 36, shadows: const [Shadow(blurRadius: 6, color: Colors.black38)]);
    return Semantics(
      label: p.label ?? 'Map pin',
      child: Stack(
        alignment: Alignment.center,
        children: [
          if (p.pulse)
            AnimatedBuilder(
              animation: _c,
              builder: (_, __) => Container(
                width: 18 + 44 * _c.value,
                height: 18 + 44 * _c.value,
                decoration: BoxDecoration(shape: BoxShape.circle, color: p.color.withValues(alpha: 0.35 * (1 - _c.value))),
              ),
            ),
          icon,
        ],
      ),
    );
  }
}
