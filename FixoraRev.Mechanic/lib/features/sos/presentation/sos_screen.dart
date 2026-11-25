import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/route_names.dart';
import '../../../app/theme/app_colors.dart';
import '../../../app/theme/bronze_buttons.dart';
import '../../../app/theme/bronze_colors.dart';
import '../../../core/di/app_services.dart';
import '../domain/sos_entities.dart';

class SosListScreen extends StatefulWidget {
  const SosListScreen({super.key});

  @override
  State<SosListScreen> createState() => _SosListScreenState();
}

class _SosListScreenState extends State<SosListScreen> {
  @override
  void initState() {
    super.initState();
    AppServices.sos.addListener(_refresh);
  }

  @override
  void dispose() {
    AppServices.sos.removeListener(_refresh);
    super.dispose();
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final items = AppServices.sos.all;
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('SOS'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
      ),
      body: items.isEmpty
          ? Center(
              child: Text(
                'No open roadside requests.',
                style: TextStyle(color: AppColors.body),
              ),
            )
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              separatorBuilder: (context, index) => const SizedBox(height: 10),
              itemBuilder: (context, i) {
                final r = items[i];
                return ListTile(
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                    side: BorderSide(color: AppColors.outline),
                  ),
                  tileColor: AppColors.surfaceElevated,
                  title: Text(
                    r.vehicleReg,
                    style: TextStyle(
                      color: AppColors.ink,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  subtitle: Text(
                    '${r.severity.label} · ${r.status.label}\n${r.location}',
                    style: TextStyle(color: AppColors.body, fontSize: 12),
                  ),
                  isThreeLine: true,
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push(RouteNames.sosDetailPath(r.id)),
                );
              },
            ),
    );
  }
}

class SosDetailScreen extends StatefulWidget {
  const SosDetailScreen({super.key, required this.requestId});

  final String requestId;

  @override
  State<SosDetailScreen> createState() => _SosDetailScreenState();
}

class _SosDetailScreenState extends State<SosDetailScreen> {
  String? _error;

  @override
  void initState() {
    super.initState();
    AppServices.sos.addListener(_refresh);
  }

  @override
  void dispose() {
    AppServices.sos.removeListener(_refresh);
    super.dispose();
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  SosRequest? get _request => AppServices.sos.byId(widget.requestId);

  String? get _mechanicId => AppServices.auth.user?.id;

  bool get _canAct {
    final r = _request;
    if (r == null) return false;
    return canMechanicAct(r, _mechanicId);
  }

  void _safe(void Function() action) {
    setState(() => _error = null);
    try {
      action();
    } on SosPermissionDenied catch (e) {
      setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = _request;
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('SOS details'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
      ),
      body: r == null
          ? Center(
              child: Text('Request not found', style: TextStyle(color: AppColors.body)),
            )
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Text(r.customerName,
                    style: TextStyle(
                      color: AppColors.ink,
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                    )),
                const SizedBox(height: 8),
                _row('Vehicle', r.vehicleReg),
                _row('Severity', r.severity.label),
                _row('Status', r.status.label),
                _row('Location', r.location),
                if (r.summary.isNotEmpty) _row('Summary', r.summary),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: BronzeColors.danger)),
                ],
                const SizedBox(height: 24),
                if (r.status == SosStatus.pending)
                  ElevatedButton(
                    style: BronzeButtons.elevated,
                    onPressed: () =>
                        _safe(() => AppServices.sos.assignToMe(r.id)),
                    child: const Text('Assign to me'),
                  ),
                if (r.status == SosStatus.assigned && _canAct)
                  ElevatedButton(
                    style: BronzeButtons.elevated,
                    onPressed: () => _safe(() => AppServices.sos.accept(r.id)),
                    child: const Text('Accept'),
                  ),
                if (r.status == SosStatus.accepted && _canAct) ...[
                  ElevatedButton(
                    style: BronzeButtons.elevated,
                    onPressed: () => _safe(
                      () => AppServices.sos.updateStatus(
                        r.id,
                        SosStatus.enRoute,
                      ),
                    ),
                    child: const Text('Mark en route'),
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton(
                    onPressed: () => _safe(
                      () => AppServices.sos.updateStatus(
                        r.id,
                        SosStatus.resolved,
                      ),
                    ),
                    child: const Text('Resolve'),
                  ),
                ],
                if (r.assignedMechanicId != null &&
                    r.assignedMechanicId != _mechanicId &&
                    r.status.isOpen)
                  Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: Text(
                      'Assigned to another mechanic.',
                      style: TextStyle(color: AppColors.body),
                    ),
                  ),
              ],
            ),
    );
  }

  Widget _row(String k, String v) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 90,
            child: Text(k, style: TextStyle(color: AppColors.body)),
          ),
          Expanded(
            child: Text(v,
                style: TextStyle(
                  color: AppColors.ink,
                  fontWeight: FontWeight.w600,
                )),
          ),
        ],
      ),
    );
  }
}