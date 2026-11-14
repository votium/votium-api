import {
  CreateSecretCommand,
  GetSecretValueCommand,
  ResourceExistsException,
  ResourceNotFoundException,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';

import { Injectable } from '@nestjs/common';

const SPKI_PEM = /^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----\s*$/;

interface ElectionKeyPair {
  privateKeyPem: string;
  publicKeyPem: string;
}

@Injectable()
export class ElectionKeyService {
  private readonly secretsClient = new SecretsManagerClient({});

  private readonly memoryStore = new Map<string, ElectionKeyPair>();

  // Evita generar varias llaves simultáneamente dentro del mismo proceso.
  private readonly pendingRequests = new Map<string, Promise<string>>();

  private readonly keyStore = process.env.KEY_STORE ?? 'aws';

  /**
   * Obtiene la llave pública de una elección.
   * Si no existe, genera y persiste un nuevo par de llaves RSA.
   */
  ensureElectionKey(electionId: string): Promise<string> {
    if (!electionId || !electionId.trim()) {
      return Promise.reject(new Error('Election ID cannot be empty'));
    }

    const pendingRequest = this.pendingRequests.get(electionId);

    if (pendingRequest) {
      return pendingRequest;
    }

    const request = this.resolveElectionKey(electionId).finally(() => {
      this.pendingRequests.delete(electionId);
    });

    this.pendingRequests.set(electionId, request);

    return request;
  }

  private async resolveElectionKey(electionId: string): Promise<string> {
    if (this.keyStore === 'memory') {
      return this.ensureMemoryKey(electionId);
    }

    if (this.keyStore !== 'aws') {
      throw new Error(`Unsupported KEY_STORE value: ${this.keyStore}`);
    }

    return this.ensureAwsKey(electionId);
  }

  /**
   * Almacenamiento en memoria para desarrollo local.
   */
  private ensureMemoryKey(electionId: string): string {
    const existingKey = this.memoryStore.get(electionId);

    if (existingKey) {
      this.validateKeyPair(existingKey);
      return existingKey.publicKeyPem;
    }

    const keyPair = this.generateElectionKeyPair();

    this.validateKeyPair(keyPair);

    this.memoryStore.set(electionId, keyPair);

    return keyPair.publicKeyPem;
  }

  /**
   * Almacenamiento persistente mediante AWS Secrets Manager.
   */
  private async ensureAwsKey(electionId: string): Promise<string> {
    const secretName = this.getSecretName(electionId);

    // Primero intentamos recuperar una llave existente.
    try {
      const existingSecret = await this.secretsClient.send(
        new GetSecretValueCommand({
          SecretId: secretName,
        }),
      );

      return this.parseSecret(existingSecret.SecretString);
    } catch (error) {
      if (!(error instanceof ResourceNotFoundException)) {
        throw error;
      }
    }

    // Solo generamos una llave cuando el secreto no existe.
    const keyPair = this.generateElectionKeyPair();

    this.validateKeyPair(keyPair);

    try {
      await this.secretsClient.send(
        new CreateSecretCommand({
          Name: secretName,
          SecretString: JSON.stringify(keyPair),
          Description: `RSA signing key for election ${electionId}`,
        }),
      );

      return keyPair.publicKeyPem;
    } catch (error) {
      // Otra instancia pudo haber creado el secreto primero.
      if (error instanceof ResourceExistsException) {
        return this.getExistingAwsKey(secretName);
      }

      // No regenerar ni sobrescribir ante errores ambiguos de red.
      throw error;
    }
  }

  /**
   * Recupera la llave que ganó una posible condición de carrera.
   */
  private async getExistingAwsKey(secretName: string): Promise<string> {
    const response = await this.secretsClient.send(
      new GetSecretValueCommand({
        SecretId: secretName,
      }),
    );

    return this.parseSecret(response.SecretString);
  }

  /**
   * Genera un par RSA compatible con SPKI / PKCS8.
   */
  private generateElectionKeyPair(): ElectionKeyPair {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    return {
      privateKeyPem: privateKey,
      publicKeyPem: publicKey,
    };
  }

  /**
   * Comprueba que el par sea RSA y que ambas llaves correspondan.
   */
  private validateKeyPair(keyPair: ElectionKeyPair): void {
    const publicKey = createPublicKey(keyPair.publicKeyPem);
    const privateKey = createPrivateKey(keyPair.privateKeyPem);

    if (!SPKI_PEM.test(keyPair.publicKeyPem)) {
      throw new Error('Election public key must use SPKI PEM format');
    }

    if (
      publicKey.asymmetricKeyType !== 'rsa' ||
      (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
    ) {
      throw new Error('Election public key must be RSA with at least 2048 bits');
    }

    if (privateKey.asymmetricKeyType !== 'rsa') {
      throw new Error('Election private key must be RSA');
    }

    const derivedPublicKey = createPublicKey(privateKey)
      .export({
        type: 'spki',
        format: 'pem',
      })
      .toString();

    if (derivedPublicKey !== keyPair.publicKeyPem) {
      throw new Error('Election public and private keys do not match');
    }
  }

  /**
   * Recupera y valida el contenido JSON de AWS Secrets Manager.
   */
  private parseSecret(secretString?: string): string {
    if (!secretString) {
      throw new Error('Election secret does not contain a valid SecretString');
    }

    let keyPair: ElectionKeyPair;

    try {
      keyPair = JSON.parse(secretString) as ElectionKeyPair;
    } catch {
      throw new Error('Election secret contains invalid JSON');
    }

    if (typeof keyPair.privateKeyPem !== 'string' || typeof keyPair.publicKeyPem !== 'string') {
      throw new Error('Election secret does not contain a valid key pair');
    }

    this.validateKeyPair(keyPair);

    return keyPair.publicKeyPem;
  }

  /**
   * Construye el nombre del secreto para cada elección.
   */
  private getSecretName(electionId: string): string {
    return `votium/election/${electionId}/signing-key`;
  }
}
