import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../core/core.dart';
import '../../core/backend/api_client.dart';
import '../../data/remote/customer_backend.dart';

/// Add New Vehicle / Edit Vehicle form.
class AddVehicleScreen extends StatefulWidget {
  /// Pass an id to edit an existing vehicle.
  final String? editId;
  const AddVehicleScreen({super.key, this.editId});

  @override
  State<AddVehicleScreen> createState() => _AddVehicleScreenState();
}

class _AddVehicleScreenState extends State<AddVehicleScreen> {
  final _model = TextEditingController();
  final _plate = TextEditingController();
  final _mileage = TextEditingController();

  VehicleType _type = VehicleType.fourWheeler;
  String? _brand;
  int? _year;
  String? _fuel;
  String? _color;
  bool _active = true;
  Uint8List? _photo;
  String? _asset; // existing demo image when editing
  bool _saving = false;
  bool _submitted = false;

  Vehicle? get _editing =>
      widget.editId == null ? null : AppState.instance.vehicleById(widget.editId!);

  @override
  void initState() {
    super.initState();
    final v = _editing;
    if (v != null) {
      _type = v.type;
      _brand = (MockData.brands[v.type] ?? const []).contains(v.make) ? v.make : 'Other';
      _model.text = v.model;
      _plate.text = v.plate;
      _mileage.text = '${v.mileageKm}';
      _year = v.year;
      _fuel = MockData.fuels.contains(v.fuel) ? v.fuel : null;
      _color = MockData.colors.contains(v.color) ? v.color : 'Other';
      _active = v.active;
      _photo = v.photo;
      _asset = v.image;
    }
  }

  @override
  void dispose() {
    _model.dispose();
    _plate.dispose();
    _mileage.dispose();
    super.dispose();
  }

  List<int> get _years {
    final now = DateTime.now().year;
    return [for (var y = now; y >= 1990; y--) y];
  }

  String? get _brandError => _submitted && _brand == null ? 'Select a brand' : null;
  String? get _modelError => _submitted && _model.text.trim().isEmpty ? 'Enter the model' : null;
  String? get _yearError => _submitted && _year == null ? 'Select the year' : null;
  String? get _fuelError => _submitted && _fuel == null ? 'Select the fuel type' : null;

  String? get _plateError {
    if (!_submitted) return null;
    final p = _plate.text.trim();
    final compact = p.replaceAll(RegExp(r'[\s-]'), '');
    if (compact.isEmpty) return 'Enter the registration number';
    if (compact.length < 5 || !RegExp(r'^([A-Za-z]{1,6}[0-9]{3,4}|[0-9]{5,7})$').hasMatch(compact)) {
      return 'Use a format like WP CAB - 1234';
    }
    if (AppState.instance.plateExists(p, exceptId: widget.editId)) {
      return 'This vehicle is already in your list';
    }
    return null;
  }

  String _formatPlate(String raw) {
    final c = raw.replaceAll(RegExp(r'[\s-]'), '').toUpperCase();
    final m = RegExp(r'^([A-Z]{2})([A-Z]{1,3})([0-9]{3,4})$').firstMatch(c);
    if (m != null) return '${m.group(1)} ${m.group(2)} - ${m.group(3)}';
    final m2 = RegExp(r'^([A-Z]{1,3})([0-9]{3,4})$').firstMatch(c);
    if (m2 != null) return '${m2.group(1)} - ${m2.group(2)}';
    return raw.toUpperCase();
  }

  Future<void> _pick() async {
    final bytes = await choosePhoto(context);
    if (bytes != null && mounted) setState(() => _photo = bytes);
  }

  Future<void> _save() async {
    setState(() => _submitted = true);
    if (_brandError != null || _modelError != null || _plateError != null || _yearError != null || _fuelError != null) {
      showFxSnack(context, 'Please fill the highlighted fields', icon: Icons.error_outline_rounded);
      return;
    }
    setState(() => _saving = true);
    final app = AppState.instance;
    final mileage = int.tryParse(_mileage.text.replaceAll(',', '').trim()) ?? 0;
    // Signed in to the garage: the vehicle must exist on the server, or bookings for it are refused.
    String? serverId;
    if (CustomerBackend.instance.live) {
      try {
        final saved = await CustomerBackend.instance.saveVehicle(
          id: widget.editId,
          plate: _formatPlate(_plate.text.trim()),
          make: _brand!,
          model: _model.text.trim(),
          year: _year!,
          type: _type,
          mileageKm: mileage,
          color: _color,
          fuel: _fuel,
        );
        serverId = saved.id;
      } on ApiException catch (e) {
        if (!mounted) return;
        setState(() => _saving = false);
        showFxSnack(context, e.message, icon: Icons.error_outline_rounded);
        return;
      }
    } else {
      await Future<void>.delayed(const Duration(milliseconds: 700));
    }
    if (!mounted) return;
    final body = switch (_type) {
      VehicleType.fourWheeler => 'Sedan',
      VehicleType.twoWheeler => 'Bike',
      VehicleType.threeWheeler => 'Three Wheeler',
    };
    final old = _editing;
    if (old != null) {
      app.updateVehicle(old.copyWith(
        make: _brand,
        model: _model.text.trim(),
        plate: _formatPlate(_plate.text.trim()),
        year: _year,
        fuel: _fuel,
        color: _color ?? old.color,
        type: _type,
        active: _active,
        mileageKm: mileage,
        photo: _photo,
        clearPhoto: _photo == null,
        clearImage: _asset == null,
      ));
      showFxSnack(context, 'Vehicle updated');
    } else {
      app.addVehicle(Vehicle(
        id: serverId ?? app.newVehicleId(),
        make: _brand!,
        model: _model.text.trim(),
        year: _year!,
        plate: _formatPlate(_plate.text.trim()),
        photo: _photo,
        mileageKm: mileage,
        fuel: _fuel!,
        transmission: _type == VehicleType.fourWheeler ? 'Automatic' : 'Manual',
        color: _color ?? 'Other',
        bodyType: body,
        engineCc: _type == VehicleType.fourWheeler ? 1500 : 150,
        type: _type,
        active: _active,
        nextServiceNote: 'First service with Fixora not booked yet',
        healthScore: 0.9,
      ));
      showFxSnack(context, '${_brand!} ${_model.text.trim()} added to My Vehicles');
    }
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final brands = MockData.brands[_type] ?? const <String>[];
    final editing = widget.editId != null;
    return FxPage(
      title: editing ? 'Edit Vehicle' : 'Add New Vehicle',
      subtitle: 'Enter your vehicle details below',
      headerIcon: Icons.directions_car_outlined,
      showNav: false,
      children: [
        FadeSlide(
          child: FxCard(
            padding: const EdgeInsets.fromLTRB(14, 4, 14, 18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const FxLabel('Vehicle Type'),
                FxPillTabs(
                  labels: [for (final t in VehicleType.values) t.tabLabel],
                  icons: [for (final t in VehicleType.values) t.icon],
                  index: _type.index,
                  fontSize: 12.5,
                  height: 46,
                  onChanged: (i) => setState(() {
                    _type = VehicleType.values[i];
                    if (!(MockData.brands[_type] ?? const []).contains(_brand)) _brand = null;
                  }),
                ),
                const FxLabel('Brand', required: true),
                FxDropdown<String>(
                  value: _brand,
                  items: brands,
                  hint: 'Select vehicle brand',
                  icon: Icons.verified_outlined,
                  errorText: _brandError,
                  onChanged: (v) => setState(() => _brand = v),
                ),
                const FxLabel('Model', required: true),
                FxInput(
                  controller: _model,
                  hint: 'Enter vehicle model',
                  icon: Icons.drive_file_rename_outline_rounded,
                  capitalization: TextCapitalization.words,
                  errorText: _modelError,
                  onChanged: (_) => setState(() {}),
                ),
                const FxLabel('Registration Number', required: true),
                FxInput(
                  controller: _plate,
                  hint: 'e.g. WP CAB - 1234',
                  icon: Icons.badge_outlined,
                  capitalization: TextCapitalization.characters,
                  errorText: _plateError,
                  onChanged: (_) => setState(() {}),
                ),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const FxLabel('Year', required: true),
                          FxDropdown<int>(
                            value: _year,
                            items: _years,
                            hint: 'Select year',
                            icon: Icons.calendar_today_outlined,
                            errorText: _yearError,
                            onChanged: (v) => setState(() => _year = v),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const FxLabel('Fuel Type', required: true),
                          FxDropdown<String>(
                            value: _fuel,
                            items: MockData.fuels,
                            hint: 'Select fuel',
                            icon: Icons.local_gas_station_outlined,
                            errorText: _fuelError,
                            onChanged: (v) => setState(() => _fuel = v),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const FxLabel('Color'),
                          FxDropdown<String>(
                            value: _color,
                            items: MockData.colors,
                            hint: 'Select color',
                            icon: Icons.palette_outlined,
                            onChanged: (v) => setState(() => _color = v),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const FxLabel('Mileage (km)'),
                          FxInput(
                            controller: _mileage,
                            hint: 'e.g. 35000',
                            icon: Icons.speed_rounded,
                            keyboardType: TextInputType.number,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const FxLabel('Vehicle Status'),
                FxPillTabs(
                  labels: const ['Active', 'Inactive'],
                  icons: const [Icons.check_circle_outline_rounded, Icons.pause_circle_outline_rounded],
                  index: _active ? 0 : 1,
                  height: 46,
                  onChanged: (i) => setState(() => _active = i == 0),
                ),
                const FxLabel('Upload Vehicle Photo'),
                GestureDetector(
                  onTap: _pick,
                  child: DashedBorder(
                    fill: AppColors.primarySofter,
                    child: SizedBox(
                      height: 150,
                      child: _photo != null || _asset != null
                          ? Stack(
                              children: [
                                Center(
                                  child: Padding(
                                    padding: const EdgeInsets.all(10),
                                    child: ClipRRect(
                                      borderRadius: BorderRadius.circular(12),
                                      child: _photo != null
                                          ? Image.memory(_photo!, fit: BoxFit.contain)
                                          : Image.asset(_asset!, fit: BoxFit.contain),
                                    ),
                                  ),
                                ),
                                Positioned(
                                  right: 10,
                                  top: 10,
                                  child: GestureDetector(
                                    onTap: () => setState(() {
                                      _photo = null;
                                      _asset = null;
                                    }),
                                    child: const CircleAvatar(
                                      radius: 13,
                                      backgroundColor: AppColors.ink,
                                      child: Icon(Icons.close_rounded, size: 16, color: Colors.white),
                                    ),
                                  ),
                                ),
                              ],
                            )
                          : Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.add_photo_alternate_outlined, color: AppColors.link, size: 38),
                                const SizedBox(height: 8),
                                Text('Upload vehicle photo', style: AppText.label),
                                const SizedBox(height: 2),
                                Text('JPG or PNG from gallery or camera', style: AppText.small),
                              ],
                            ),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                PrimaryButton(
                  label: editing ? 'Save Changes' : 'Save Vehicle',
                  icon: Icons.check_rounded,
                  loading: _saving,
                  onPressed: _save,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
