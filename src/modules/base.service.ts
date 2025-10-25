export class BaseService {
  public readonly CompanySelector = {
    name: true,
    phone: true,
    address: true,
    country: true,
    industry: true,
  };

  public readonly UserSelector = {
    id: true,
    first_name: true,
    last_name: true,
    address: true,
    created_at: true,
  };

  public readonly UserFullSelector = {
    id: true,
    first_name: true,
    last_name: true,
    phone: true,
    email: true,
    address: true,
    email_verified_at: true,
    created_at: true,
  };

  public readonly StaffSelector = {
    id: true,
    status: true,
    has_all_group: true,
    created_at: true,
    updated_at: true,
  };
}
