import '../../features/auth/data/mock_auth_repository.dart';
import '../../features/auth/presentation/auth_controller.dart';
import '../../features/diagnosis/data/mock_diagnosis_service.dart';
import '../../features/inventory/presentation/inventory_controller.dart';
import '../../features/jobs/presentation/job_controller.dart';
import '../../features/notifications/presentation/notification_controller.dart';
import '../../features/passport/presentation/passport_controller.dart';
import '../../features/profile/presentation/profile_photo_controller.dart';
import '../../features/sos/presentation/sos_controller.dart';

/// Service locator. Controllers start empty; MechanicBackend fills them
/// from /api/v1/mechanic/* after PIN login.
class AppServices {
  AppServices._();

  static final AuthController auth = AuthController(MockAuthRepository());
  static final ProfilePhotoController profilePhoto = ProfilePhotoController();
  static final MockDiagnosisService diagnosis = MockDiagnosisService();

  static final InventoryController inventory = InventoryController([]);
  static final JobController jobs = JobController([]);
  static final PassportController passport = PassportController([]);
  static final SosController sos = SosController([]);
  static final NotificationController notifications = NotificationController([]);
}
