import type { Config } from 'jest';

const config: Config = {
   coverageDirectory: './coverage',
   collectCoverageFrom: ['src/**/*.(t|j)s'],
   coveragePathIgnorePatterns: [
      'main.ts',
      '.module.ts',
      '.dto.ts',
      'index.ts',
   ],
   projects: [
      {
         displayName: 'unit',
         testMatch: ['<rootDir>/src/**/*.spec.ts'],
         testEnvironment: 'node',
         transform: {
            '^.+\\.(t|j)s$': ['ts-jest', {
               tsconfig: '<rootDir>/tsconfig.json',
            }],
         },
         moduleFileExtensions: ['js', 'json', 'ts'],
         moduleNameMapper: {
            '^(\\.{1,2}/.*)\\.js$': '$1',   // ← resuelve imports .js a CJS
         },
      },
      {
         displayName: 'integration',
         testMatch: ['<rootDir>/test/**/*.int.spec.ts'],
         testEnvironment: 'node',
         transform: {
            '^.+\\.(t|j)s$': ['ts-jest', {
               tsconfig: '<rootDir>/tsconfig.json',
            }],
         },
         moduleFileExtensions: ['js', 'json', 'ts'],
         moduleNameMapper: {
            '^(\\.{1,2}/.*)\\.js$': '$1',   // ← resuelve imports .js a CJS
         },
      },
      {
         displayName: 'e2e',
         testMatch: ['<rootDir>/test/**/*.e2e.spec.ts'],
         testEnvironment: 'node',
         transform: {
            '^.+\\.(t|j)s$': ['ts-jest', {
               tsconfig: '<rootDir>/tsconfig.json',
            }],
         },
         moduleFileExtensions: ['js', 'json', 'ts'],
         moduleNameMapper: {
            '^(\\.{1,2}/.*)\\.js$': '$1',
         },
      }
   ],
};

export default config;