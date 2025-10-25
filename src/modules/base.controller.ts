export class BaseController {
  public readonly CompanySelector = {
    slug: true,
    name: true,
    address: true,
    type: true,
    domain_name: true,
  };

  public readonly UserSelector = {
    first_name: true,
    last_name: true,
    address: true,
  };
}
