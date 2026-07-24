export type ERPRoute = {
  path: string;
  label: string;
  /** null = accesible con solo sesión iniciada, sin permiso adicional */
  permission: string | null;
};

export type ERPModuleDefinition = {
  key: string;
  name: string;
  routes: ERPRoute[];
  permissions: string[];
  isActive: boolean;
};
