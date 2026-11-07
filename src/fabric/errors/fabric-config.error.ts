/** Invalid or missing configuration/credentials. Messages never contain secret values. */
export class FabricConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FabricConfigError';
  }
}
